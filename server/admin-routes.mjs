import crypto from "node:crypto";
import {
  addDays, daysBetween, endOfDayVN, normalizeCoupon, normalizePhone, normalizeText, nowIso,
  paginate, parsePage, randomToken, roundUpTo, sha256, todayVN, validateEmail, validatePhone, vnDateOf,
} from "./util.mjs";
import {
  addAudit, addHistory, alert, allowedActionsFor, cfg, cfgNumber, computeCancellationQuote,
  computeChangeQuote, computeQuote, getBooking, getDeparture, getPolicy, getTour, grossPaidAmount,
  holdExpiryFor, notify, publicDeparture, recalcBookingMoney, recomputeTourRating, refundedAmount,
  releaseCoupon, tourCard,
} from "./business.mjs";
import { apiError } from "./errors.mjs";
import { tx } from "./db.mjs";
import { hasPermission, permissionsFor, ROLES, ROLE_LABELS, ROLE_PERMISSIONS } from "./permissions.mjs";
import {
  applyPaymentSuccess, approveChangeRequest, bookingSeats, cancelBookingNow, companyCancelDeparture,
  confirmBooking,
} from "./domain.mjs";
import { hashPassword, maskDocument } from "./util.mjs";
import { manifestHtml } from "./documents.mjs";
import { BACKUP_INTERVAL_HOURS, BACKUP_KEEP, createBackup, listBackups, verifyBackup } from "./backup.mjs";

const BASE = "";
void BASE;

function requireRole(ctx, roles) {
  if (!ctx.user || !ctx.user.roles.some((r) => roles.includes(r))) {
    throw apiError("FORBIDDEN", 403, "Bạn không có quyền thực hiện thao tác này.");
  }
}

function audit(ctx, action, entity, entityId, before, after) {
  addAudit(ctx.db, {
    actorId: ctx.user?.id, actorRole: ctx.user?.roles?.[0], action, entity, entityId,
    before, after, ip: ctx.ip, userAgent: ctx.ua,
  });
}

function staffName(db, id) {
  return db.users.find((u) => u.id === id)?.fullName || null;
}

function adminBookingRow(db, booking) {
  const departure = getDeparture(db, booking.departureId);
  const tour = getTour(db, departure?.tourId);
  const gross = grossPaidAmount(db, booking.id);
  return {
    id: booking.id,
    code: booking.code, status: booking.status, paymentStatus: booking.paymentStatus,
    customerName: booking.contactName, customerEmail: booking.contactEmail, customerPhone: booking.contactPhone,
    tour: { id: tour?.id, name: tour?.name, slug: tour?.slug },
    departureId: booking.departureId, departureDate: departure?.departureDate, returnDate: departure?.returnDate,
    adults: booking.adults, children: booking.children, infants: booking.infants,
    total: booking.totalPrice, paid: gross, remaining: Math.max(0, booking.totalPrice - gross),
    holdExpiresAt: booking.holdExpiresAt, balanceDueDate: booking.balanceDueDate,
    channel: booking.channel, assignedTo: booking.assignedTo || null, assignedName: staffName(db, booking.assignedTo),
    createdAt: booking.createdAt, version: booking.version,
    cancelBy: booking.cancelBy, cancelReasonCode: booking.cancelReasonCode,
  };
}

/** Guides operate the manifest; they must not receive order money or contact email. */
function guideSafeBooking(row) {
  return { ...row, customerEmail: null, total: 0, paid: 0, remaining: 0, paymentStatus: "paid" };
}

function guideSafeDeparture(row) {
  return { ...row, revenue: 0, collected: 0, outstanding: 0, costTotal: 0 };
}

function adminDepartureRow(db, dep) {
  const tour = getTour(db, dep.tourId);
  const bookings = db.bookings.filter((b) => b.departureId === dep.id && ["pending", "confirmed", "completed"].includes(b.status));
  const revenue = bookings.reduce((sum, b) => sum + b.totalPrice, 0);
  const collected = bookings.reduce((sum, b) => sum + grossPaidAmount(db, b.id), 0);
  return {
    ...publicDeparture(dep),
    tourName: tour?.name, tourSlug: tour?.slug,
    fillRate: dep.capacity ? Math.round((dep.seatsTaken / dep.capacity) * 100) : 0,
    bookings: bookings.length,
    revenue, collected, outstanding: Math.max(0, revenue - collected),
    costTotal: db.costs.filter((c) => c.departureId === dep.id).reduce((sum, c) => sum + c.amount, 0),
    version: dep.version, createdAt: dep.createdAt,
  };
}

function pageRows(rows, query, defaultPerPage = 20) {
  const { page, perPage } = parsePage(query, defaultPerPage);
  const paged = paginate(rows, page, perPage);
  return { data: paged.rows, meta: { ...paged.meta, serverTime: nowIso() } };
}

function ensureTourVersion(tour, version) {
  if (version !== undefined && Number(version) !== tour.version) {
    throw apiError("VERSION_CONFLICT", 409, "Tour vừa được người khác cập nhật. Vui lòng tải lại để xem thay đổi mới nhất.");
  }
}

function slugify(text) {
  return normalizeText(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function uniqueSlug(db, collection, slug, id = null) {
  let candidate = slug;
  let n = 2;
  while (db[collection].some((row) => row.slug === candidate && row.id !== id)) {
    candidate = `${slug}-${n++}`;
  }
  return candidate;
}

function validateTourInput(db, body, existing = null) {
  const fields = {};
  const name = String(body.name ?? existing?.name ?? "").trim();
  if (name.length < 6 || name.length > 200) fields.name = "Tên tour từ 6 đến 200 ký tự.";
  const destinationId = Number(body.destinationId ?? existing?.destinationId);
  const categoryId = Number(body.categoryId ?? existing?.categoryId);
  if (!db.destinations.some((d) => d.id === destinationId && d.active)) fields.destinationId = "Chọn điểm đến hợp lệ.";
  if (!db.categories.some((c) => c.id === categoryId && c.active)) fields.categoryId = "Chọn danh mục hợp lệ.";
  const durationDays = Number(body.durationDays ?? existing?.durationDays);
  const durationNights = Number(body.durationNights ?? existing?.durationNights);
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 30) fields.durationDays = "Số ngày từ 1 đến 30.";
  if (!Number.isInteger(durationNights) || durationNights < 0 || durationNights > durationDays) fields.durationNights = "Số đêm không hợp lệ.";
  const minPax = Number(body.minPax ?? existing?.minPax ?? 1);
  const maxPax = Number(body.maxPax ?? existing?.maxPax ?? 30);
  if (minPax < 1 || maxPax < minPax) fields.maxPax = "Sức chứa tối đa phải lớn hơn hoặc bằng tối thiểu.";
  const depositPercent = Number(body.depositPercent ?? existing?.depositPercent ?? 30);
  if (depositPercent < 20 || depositPercent > 100) fields.depositPercent = "Tỷ lệ cọc từ 20% đến 100%.";
  if (Object.keys(fields).length) throw apiError("VALIDATION_ERROR", 422, "Vui lòng kiểm tra thông tin tour.", fields);
  return { name, destinationId, categoryId, durationDays, durationNights, minPax, maxPax, depositPercent };
}

function applyTourBody(tour, body) {
  const fields = [
    "name", "destinationId", "categoryId", "durationDays", "durationNights", "summary", "description",
    "highlights", "itinerary", "inclusions", "exclusions", "notes", "meetingPointDefault",
    "minPax", "maxPax", "ageInfantMax", "ageChildMax", "requiresIdDocument", "requiresPassport",
    "depositPercent", "cancellationPolicyId", "seoTitle", "seoDescription", "cover", "images",
  ];
  for (const key of fields) {
    if (body[key] !== undefined) tour[key] = body[key];
  }
}

function tourPublishIssues(db, tour) {
  const issues = [];
  if (!tour.cover) issues.push("Thiếu ảnh bìa");
  if (!Array.isArray(tour.itinerary) || tour.itinerary.length === 0) issues.push("Thiếu lịch trình theo ngày");
  if (!tour.cancellationPolicyId || !db.cancellationPolicies.some((p) => p.id === tour.cancellationPolicyId)) issues.push("Chưa gán chính sách hủy");
  const open = db.departures.some((d) => d.tourId === tour.id && d.status === "open" && d.departureDate >= todayVN());
  if (!open) issues.push("Chưa có lịch khởi hành đang mở bán");
  return issues;
}

function assertGuideAccess(ctx, departureId) {
  if (!ctx.user.roles.includes("guide")) return;
  const assigned = ctx.db.assignments.some((a) => a.departureId === departureId && a.guideId
    && ctx.db.guides.find((g) => g.id === a.guideId)?.userId === ctx.user.id);
  if (!assigned) throw apiError("FORBIDDEN", 403, "Bạn chỉ được xem chuyến được phân công.");
}

function revenueCollected(db, from, to) {
  const payments = db.payments.filter((p) => p.status === "succeeded" && p.paidAt
    && vnDateOf(p.paidAt) >= from && vnDateOf(p.paidAt) <= to);
  const refunds = db.refunds.filter((r) => r.status === "completed" && r.processedAt
    && vnDateOf(r.processedAt) >= from && vnDateOf(r.processedAt) <= to);
  const collected = payments.reduce((sum, p) => sum + p.amount, 0);
  const refunded = refunds.reduce((sum, r) => sum + r.amount, 0);
  return { collected, refunded, net: collected - refunded, payments, refunds };
}

function revenueRecognized(db, from, to) {
  const rows = [];
  for (const booking of db.bookings.filter((b) => b.status === "completed")) {
    const dep = getDeparture(db, booking.departureId);
    if (!dep) continue;
    if (dep.returnDate >= from && dep.returnDate <= to) {
      rows.push({ booking, departure: dep, amount: booking.totalPrice - refundedAmount(db, booking.id) });
    }
  }
  return { total: rows.reduce((sum, row) => sum + row.amount, 0), rows };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return `\uFEFF${headers.join(",")}\n${rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")).join("\n")}`;
}

/* ====================== DASHBOARD ====================== */

const dashboardHandler = (ctx) => {
  const { db } = ctx;
  const today = todayVN();
  const monthStart = `${today.slice(0, 7)}-01`;
  const now = Date.now();
  const pending = db.bookings.filter((b) => b.status === "pending");
  const expiring = pending.filter((b) => b.holdExpiresAt && new Date(b.holdExpiresAt).getTime() - now < 2 * 3600 * 1000);
  const guideDepartureIds = ctx.user.roles.includes("guide")
    ? new Set(db.assignments.filter((a) => db.guides.find((g) => g.id === a.guideId)?.userId === ctx.user.id).map((a) => a.departureId))
    : null;
  const visiblePending = guideDepartureIds ? pending.filter((b) => guideDepartureIds.has(b.departureId)) : pending;
  const visibleExpiring = guideDepartureIds ? expiring.filter((b) => guideDepartureIds.has(b.departureId)) : expiring;
  const upcoming = db.departures
    .filter((d) => d.departureDate >= today && d.departureDate <= addDays(today, 14) && !["cancelled", "draft"].includes(d.status))
    .filter((d) => !guideDepartureIds || guideDepartureIds.has(d.id))
    .sort((a, b) => a.departureDate.localeCompare(b.departureDate));
  const goNogo = db.departures.filter((d) => !d.isGuaranteed && d.goNogoDate && d.goNogoDate >= today
    && d.goNogoDate <= addDays(today, 3) && ["open", "full", "closed"].includes(d.status)
    && (!guideDepartureIds || guideDepartureIds.has(d.id)));
  const paymentsToConfirm = db.payments.filter((p) => p.method === "bank_transfer" && ["pending", "initiated"].includes(p.status));
  const flagged = db.payments.filter((p) => p.flag === "amount_mismatch" && p.status !== "cancelled");
  const refundsPending = db.refunds.filter((r) => ["requested", "approved", "processing"].includes(r.status));
  const changeRequests = db.changeRequests.filter((c) => c.status === "submitted"
    && (!guideDepartureIds || guideDepartureIds.has(db.bookings.find((b) => b.id === c.bookingId)?.departureId)));
  const overdueTickets = db.tickets.filter((t) => !["resolved", "closed"].includes(t.status) && t.slaDueAt && new Date(t.slaDueAt).getTime() < now);
  const revenueMonth = revenueCollected(db, monthStart, today);
  const recognizedMonth = revenueRecognized(db, monthStart, today);
  const debtRows = db.bookings.filter((b) => b.status === "confirmed" && grossPaidAmount(db, b.id) < b.totalPrice);
  const debtTotal = debtRows.reduce((sum, b) => sum + (b.totalPrice - grossPaidAmount(db, b.id)), 0);
  const monthDepartures = db.departures.filter((d) => d.departureDate >= monthStart && d.departureDate <= today && d.status !== "draft" && d.status !== "cancelled");
  const occupancy = monthDepartures.length
    ? Math.round(monthDepartures.reduce((sum, d) => sum + (d.capacity ? d.seatsTaken / d.capacity : 0), 0) / monthDepartures.length * 100)
    : 0;
  const canceledBookings = db.bookings.filter((b) => b.status === "cancelled" && b.cancelledAt && vnDateOf(b.cancelledAt) >= monthStart);
  const confirmedBookings = db.bookings.filter((b) => ["confirmed", "completed"].includes(b.status) && vnDateOf(b.createdAt) >= monthStart);
  const cancelRate = confirmedBookings.length ? Math.round((canceledBookings.length / confirmedBookings.length) * 100) : 0;
  const topTours = db.tours.map((t) => {
    const bookings = db.bookings.filter((b) => ["confirmed", "completed"].includes(b.status)
      && getDeparture(db, b.departureId)?.tourId === t.id);
    return { id: t.id, name: t.name, slug: t.slug, bookings: bookings.length, revenue: bookings.reduce((sum, b) => sum + b.totalPrice, 0) };
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const alerts = db.alerts.filter((a) => a.status === "open").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);

  return {
    data: {
      cards: [
        { key: "pendingBookings", label: "Đơn chờ xử lý", value: visiblePending.length, link: "/admin/bookings?status=pending", tone: "pending" },
        { key: "expiringHolds", label: "Sắp hết hạn giữ chỗ (≤ 2 giờ)", value: visibleExpiring.length, link: "/admin/bookings?overdue=hold", tone: "danger" },
        { key: "changeRequests", label: "Yêu cầu hủy/đổi chờ duyệt", value: changeRequests.length, link: "/admin/bookings?tab=requests", tone: "pending" },
        { key: "ticketsOverdue", label: "Ticket quá SLA", value: overdueTickets.length, link: "/admin/tickets?sla=overdue", tone: "danger" },
        { key: "paymentsToConfirm", label: "Chuyển khoản chờ xác nhận", value: paymentsToConfirm.length, link: "/admin/payments?tab=confirm", tone: "pending" },
        { key: "flaggedPayments", label: "Giao dịch cần xử lý", value: flagged.length, link: "/admin/payments?tab=review", tone: "danger" },
        { key: "refundsPending", label: "Hoàn tiền chờ xử lý", value: refundsPending.length, link: "/admin/refunds", tone: "pending" },
        { key: "debtTotal", label: "Công nợ phải thu", value: debtTotal, money: true, link: "/admin/reports?tab=debt", tone: "info" },
        { key: "collected", label: "Doanh thu đã thu (tháng)", value: revenueMonth.net, money: true, link: "/admin/reports?tab=revenue", tone: "ok" },
        { key: "recognized", label: "Doanh thu ghi nhận (tháng)", value: recognizedMonth.total, money: true, link: "/admin/reports?tab=revenue", tone: "ok" },
        { key: "occupancy", label: "Tỷ lệ lấp đầy (tháng)", value: occupancy, suffix: "%", link: "/admin/reports?tab=occupancy", tone: "info" },
        { key: "cancelRate", label: "Tỷ lệ hủy (tháng)", value: cancelRate, suffix: "%", link: "/admin/reports?tab=cancellations", tone: "danger" },
      ],
      upcoming: upcoming.map((d) => {
        const row = adminDepartureRow(db, d);
        return guideDepartureIds ? guideSafeDeparture(row) : row;
      }),
      goNogo: goNogo.map((d) => {
        const row = adminDepartureRow(db, d);
        return guideDepartureIds ? guideSafeDeparture(row) : row;
      }),
      recentBookings: db.bookings.slice()
        .filter((b) => !guideDepartureIds || guideDepartureIds.has(b.departureId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)
        .map((b) => {
          const row = adminBookingRow(db, b);
          return guideDepartureIds ? guideSafeBooking(row) : row;
        }),
      topTours: guideDepartureIds ? [] : topTours,
      alerts,
      revenue: guideDepartureIds ? { collected: 0, refunded: 0, net: 0, recognized: 0 } : { collected: revenueMonth.collected, refunded: revenueMonth.refunded, net: revenueMonth.net, recognized: recognizedMonth.total },
      debtTotal: guideDepartureIds ? 0 : debtTotal,
      generatedAt: nowIso(),
      today,
      role: ctx.user.roles[0],
    },
  };
};

/* ====================== TOURS ====================== */

const tourList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.tours.map((tour) => {
    const bookings = db.bookings.filter((b) => getDeparture(db, b.departureId)?.tourId === tour.id && b.status !== "cancelled");
    return {
      id: tour.id, code: tour.code, name: tour.name, slug: tour.slug, status: tour.status,
      destinationName: db.destinations.find((d) => d.id === tour.destinationId)?.name,
      categoryName: db.categories.find((c) => c.id === tour.categoryId)?.name,
      durationDays: tour.durationDays, durationNights: tour.durationNights,
      departures: db.departures.filter((d) => d.tourId === tour.id).length,
      bookings: bookings.length,
      ratingAvg: tour.ratingAvg, ratingCount: tour.ratingCount,
      version: tour.version, updatedAt: tour.updatedAt, cover: tour.cover,
    };
  });
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.q) {
    rows = rows.filter((r) => normalizeText(`${r.name} ${r.code} ${r.destinationName}`).includes(normalizeText(query.q)));
  }
  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return pageRows(rows, query);
};

const tourCreate = (ctx) => {
  const { db, body } = ctx;
  const validated = validateTourInput(db, body);
  const tour = tx((database) => {
    const id = (database._seq.tours = (database._seq.tours || 0) + 1);
    const row = {
      id, code: body.code ? String(body.code).slice(0, 20) : `T-${String(id).padStart(4, "0")}`,
      name: validated.name, slug: uniqueSlug(database, "tours", slugify(body.slug || validated.name)),
      destinationId: validated.destinationId, categoryId: validated.categoryId,
      durationDays: validated.durationDays, durationNights: validated.durationNights,
      summary: String(body.summary || "").slice(0, 500),
      description: String(body.description || ""),
      highlights: Array.isArray(body.highlights) ? body.highlights : [],
      itinerary: Array.isArray(body.itinerary) ? body.itinerary : [],
      inclusions: Array.isArray(body.inclusions) ? body.inclusions : [],
      exclusions: Array.isArray(body.exclusions) ? body.exclusions : [],
      notes: body.notes || null,
      meetingPointDefault: body.meetingPointDefault || "Văn phòng VietTrails — 18 Lý Thường Kiệt, Hà Nội",
      minPax: validated.minPax, maxPax: validated.maxPax,
      ageInfantMax: Number(body.ageInfantMax ?? 2), ageChildMax: Number(body.ageChildMax ?? 12),
      requiresIdDocument: Boolean(body.requiresIdDocument), requiresPassport: Boolean(body.requiresPassport),
      depositPercent: validated.depositPercent,
      cancellationPolicyId: body.cancellationPolicyId || database.cancellationPolicies[0]?.id || null,
      status: "draft", seoTitle: body.seoTitle || validated.name, seoDescription: body.seoDescription || "",
      cover: body.cover || null, images: Array.isArray(body.images) ? body.images : [],
      ratingAvg: 0, ratingCount: 0, version: 1, createdAt: nowIso(), updatedAt: nowIso(),
    };
    database.tours.push(row);
    audit(ctx, "tour.create", "tour", row.id, null, { name: row.name, status: row.status });
    return row;
  });
  return { data: tour };
};

const tourUpdate = (ctx) => {
  const { db, body, params } = ctx;
  if (!hasPermission(ctx.user, "tour:update") && !hasPermission(ctx.user, "tour:seo")) {
    throw apiError("FORBIDDEN", 403, "Bạn không có quyền sửa tour.");
  }
  const tour = getTour(db, params.id);
  if (!tour) throw apiError("NOT_FOUND", 404, "Không tìm thấy tour.");
  ensureTourVersion(tour, body.version);
  const isSeoOnly = !hasPermission(ctx.user, "tour:update") && hasPermission(ctx.user, "tour:seo");
  if (isSeoOnly) {
    const allowed = ["seoTitle", "seoDescription", "cover", "images"];
    if (Object.keys(body).some((key) => !["version", ...allowed].includes(key))) {
      throw apiError("FORBIDDEN", 403, "Vai trò của bạn chỉ được sửa nội dung SEO và ảnh.");
    }
  }
  const validated = validateTourInput(db, body, tour);
  const updated = tx((database) => {
    const target = getTour(database, tour.id);
    const before = { name: target.name, status: target.status, version: target.version };
    if (body.slug && body.slug !== target.slug) target.slug = uniqueSlug(database, "tours", slugify(body.slug), target.id);
    applyTourBody(target, body);
    target.name = validated.name;
    target.destinationId = validated.destinationId;
    target.categoryId = validated.categoryId;
    target.durationDays = validated.durationDays;
    target.durationNights = validated.durationNights;
    target.minPax = validated.minPax;
    target.maxPax = validated.maxPax;
    target.depositPercent = validated.depositPercent;
    target.version += 1;
    target.updatedAt = nowIso();
    if (Array.isArray(body.images)) {
      for (const image of body.images) if (!image.alt) throw apiError("VALIDATION_ERROR", 422, "Mỗi ảnh cần có mô tả alt.", { images: "Thiếu alt." });
    }
    audit(ctx, "tour.update", "tour", target.id, before, { name: target.name, version: target.version });
    return target;
  });
  return { data: updated };
};

const tourDetailAdmin = (ctx) => {
  const { db, params } = ctx;
  const tour = getTour(db, params.id);
  if (!tour) throw apiError("NOT_FOUND", 404, "Không tìm thấy tour.");
  return {
    data: {
      ...tour,
      destination: db.destinations.find((d) => d.id === tour.destinationId) || null,
      category: db.categories.find((c) => c.id === tour.categoryId) || null,
      cancellationPolicy: db.cancellationPolicies.find((p) => p.id === tour.cancellationPolicyId) || null,
      departures: db.departures.filter((d) => d.tourId === tour.id).sort((a, b) => a.departureDate.localeCompare(b.departureDate)).map((d) => adminDepartureRow(db, d)),
      bookingCount: db.bookings.filter((b) => getDeparture(db, b.departureId)?.tourId === tour.id).length,
      publishIssues: tourPublishIssues(db, tour),
      reviews: db.reviews.filter((r) => r.tourId === tour.id).slice(-10),
      history: db.auditLogs.filter((l) => l.entity === "tour" && l.entityId === tour.id).slice(-20),
    },
  };
};

const tourPublish = (ctx) => {
  const tour = getTour(ctx.db, ctx.params.id);
  if (!tour) throw apiError("NOT_FOUND", 404, "Không tìm thấy tour.");
  const issues = tourPublishIssues(ctx.db, tour);
  if (issues.length) {
    throw apiError("VALIDATION_ERROR", 422, "Tour chưa đủ điều kiện xuất bản.", {
      publish: issues.join("; "),
    }, { issues });
  }
  const result = tx((database) => {
    const target = getTour(database, tour.id);
    const before = { status: target.status };
    target.status = "published";
    target.version += 1;
    target.updatedAt = nowIso();
    target.publishedAt = nowIso();
    audit(ctx, "tour.publish", "tour", target.id, before, { status: "published" });
    return target;
  });
  return { data: result };
};

const tourStatus = (status) => (ctx) => {
  const tour = getTour(ctx.db, ctx.params.id);
  if (!tour) throw apiError("NOT_FOUND", 404, "Không tìm thấy tour.");
  const result = tx((database) => {
    const target = getTour(database, tour.id);
    const before = { status: target.status };
    target.status = status;
    target.version += 1;
    target.updatedAt = nowIso();
    audit(ctx, `tour.${status}`, "tour", target.id, before, { status });
    return target;
  });
  return { data: result };
};

const tourDuplicate = (ctx) => {
  const tour = getTour(ctx.db, ctx.params.id);
  if (!tour) throw apiError("NOT_FOUND", 404, "Không tìm thấy tour.");
  const result = tx((database) => {
    const id = (database._seq.tours = (database._seq.tours || 0) + 1);
    const copy = {
      ...structuredClone(tour), id, code: `T-${String(id).padStart(4, "0")}`,
      name: `${tour.name} (bản sao)`, slug: uniqueSlug(database, "tours", `${tour.slug}-copy`),
      status: "draft", version: 1, ratingAvg: 0, ratingCount: 0,
      createdAt: nowIso(), updatedAt: nowIso(), publishedAt: null,
    };
    database.tours.push(copy);
    audit(ctx, "tour.duplicate", "tour", id, { from: tour.id }, { name: copy.name });
    return copy;
  });
  return { data: result };
};

const tourArchive = (ctx) => {
  const tour = getTour(ctx.db, ctx.params.id);
  if (!tour) throw apiError("NOT_FOUND", 404, "Không tìm thấy tour.");
  const result = tx((database) => {
    const target = getTour(database, tour.id);
    target.status = "archived";
    target.updatedAt = nowIso();
    target.version += 1;
    audit(ctx, "tour.archive", "tour", target.id, { status: tour.status }, { status: "archived" });
    return target;
  });
  return { data: { archived: true, tour: result } };
};

/* ====================== DEPARTURES ====================== */

const departureList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.departures.map((d) => adminDepartureRow(db, d));
  if (ctx.user.roles.includes("guide")) {
    const assigned = new Set(db.assignments
      .filter((a) => db.guides.find((g) => g.id === a.guideId)?.userId === ctx.user.id)
      .map((a) => a.departureId));
    rows = rows.filter((row) => assigned.has(row.id)).map(guideSafeDeparture);
  }
  if (query.tourId) rows = rows.filter((r) => r.tourId === Number(query.tourId));
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.from) rows = rows.filter((r) => r.departureDate >= query.from);
  if (query.to) rows = rows.filter((r) => r.departureDate <= query.to);
  if (query.q) rows = rows.filter((r) => normalizeText(`${r.tourName} ${r.departureDate}`).includes(normalizeText(query.q)));
  if (query.attention === "1") {
    rows = rows.filter((r) => (!r.isGuaranteed && r.departureDate <= addDays(todayVN(), 10)) || (r.capacity - r.seatsTaken <= 2 && r.departureDate >= todayVN()));
  }
  rows.sort((a, b) => a.departureDate.localeCompare(b.departureDate));
  return pageRows(rows, query, 30);
};

function validateDepartureInput(db, body, tour, existing = null) {
  const fields = {};
  const date = String(body.departureDate ?? existing?.departureDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fields.departureDate = "Chọn ngày khởi hành.";
  else if (date < addDays(todayVN(), cfgNumber(db, "departure.min_lead_days", 1))) fields.departureDate = `Ngày khởi hành phải cách hôm nay ít nhất ${cfgNumber(db, "departure.min_lead_days", 1)} ngày.`;
  const capacity = Number(body.capacity ?? existing?.capacity);
  if (!Number.isInteger(capacity) || capacity < 1) fields.capacity = "Sức chứa tối thiểu 1.";
  const minPax = Number(body.minPaxToRun ?? existing?.minPaxToRun ?? tour.minPax);
  if (!Number.isInteger(minPax) || minPax < 1 || minPax > capacity) fields.minPaxToRun = "Số khách tối thiểu không hợp lệ.";
  for (const key of ["priceAdult", "priceChild", "priceInfant", "singleSupplement"]) {
    const value = Number(body[key] ?? existing?.[key] ?? 0);
    if (!Number.isFinite(value) || value < 0) fields[key] = "Giá không hợp lệ.";
  }
  if (Number(body.priceAdult ?? existing?.priceAdult) <= 0) fields.priceAdult = "Giá người lớn phải lớn hơn 0.";
  if (existing && capacity < existing.seatsTaken) fields.capacity = "Sức chứa không được nhỏ hơn số chỗ đã bán.";
  const meetingPoint = String(body.meetingPoint ?? existing?.meetingPoint ?? tour.meetingPointDefault ?? "").trim();
  if (meetingPoint.length < 5) fields.meetingPoint = "Nhập điểm đón.";
  const meetingTime = String(body.meetingTime ?? existing?.meetingTime ?? "06:30");
  if (!/^\d{2}:\d{2}$/.test(meetingTime)) fields.meetingTime = "Giờ đón dạng HH:mm.";
  if (Object.keys(fields).length) throw apiError("VALIDATION_ERROR", 422, "Vui lòng kiểm tra lịch khởi hành.", fields);
  return { date, capacity, minPax, meetingPoint, meetingTime };
}

const departureCreate = (ctx) => {
  const { db, body } = ctx;
  const tour = getTour(db, body.tourId);
  if (!tour) throw apiError("NOT_FOUND", 404, "Không tìm thấy tour.");
  const validated = validateDepartureInput(db, body, tour);
  if (db.departures.some((d) => d.tourId === tour.id && d.departureDate === validated.date && d.meetingTime === validated.meetingTime)) {
    throw apiError("VALIDATION_ERROR", 422, "Đã có lịch khởi hành trùng tour, ngày và giờ đón.", { departureDate: "Lịch bị trùng." });
  }
  const result = tx((database) => {
    const id = (database._seq.departures = (database._seq.departures || 0) + 1);
    const cutoffDays = cfgNumber(database, "departure.cutoff_days", 2);
    const row = {
      id, tourId: tour.id, departureDate: validated.date,
      returnDate: addDays(validated.date, tour.durationDays - 1),
      capacity: validated.capacity, seatsTaken: 0, minPaxToRun: validated.minPax,
      priceAdult: Number(body.priceAdult), priceChild: Number(body.priceChild ?? body.priceAdult * 0.7),
      priceInfant: Number(body.priceInfant ?? 0), singleSupplement: Number(body.singleSupplement ?? 0),
      bookingCutoffAt: body.bookingCutoffAt || `${addDays(validated.date, -cutoffDays)}T00:00:00.000Z`,
      balanceDueDate: body.balanceDueDate || addDays(validated.date, -cfgNumber(database, "payment.balance_due_days", 7)),
      goNogoDate: body.goNogoDate || addDays(validated.date, -cfgNumber(database, "departure.go_nogo_days", 7)),
      meetingPoint: validated.meetingPoint, meetingTime: validated.meetingTime,
      isGuaranteed: false, status: ["draft", "open"].includes(body.status) ? body.status : "draft",
      cancelReason: null, version: 1, createdAt: nowIso(),
    };
    database.departures.push(row);
    audit(ctx, "departure.create", "departure", row.id, null, { tourId: tour.id, date: row.departureDate, status: row.status });
    return row;
  });
  return { data: { departure: adminDepartureRow(ctx.db, result) } };
};

const departureBulk = (ctx) => {
  const { db, body } = ctx;
  const tour = getTour(db, body.tourId);
  if (!tour) throw apiError("NOT_FOUND", 404, "Không tìm thấy tour.");
  const from = String(body.fromDate || addDays(todayVN(), 1));
  const to = String(body.toDate || addDays(todayVN(), 90));
  if (to < from) throw apiError("VALIDATION_ERROR", 422, "Khoảng ngày không hợp lệ.", { toDate: "Ngày kết thúc phải sau ngày bắt đầu." });
  const weekdays = Array.isArray(body.weekdays) && body.weekdays.length ? body.weekdays.map(Number) : [5];
  const capacity = Number(body.capacity || 24);
  const minPax = Number(body.minPaxToRun || tour.minPax);
  const priceAdult = Number(body.priceAdult);
  if (!priceAdult || priceAdult <= 0) throw apiError("VALIDATION_ERROR", 422, "Giá người lớn không hợp lệ.", { priceAdult: "Bắt buộc." });
  const dates = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    const d = new Date(`${cursor}T00:00:00Z`);
    if (weekdays.includes(d.getUTCDay())) dates.push(cursor);
  }
  const existing = dates.filter((date) => db.departures.some((d) => d.tourId === tour.id && d.departureDate === date));
  const planned = dates.filter((date) => !existing.includes(date)).map((date) => ({
    departureDate: date, returnDate: addDays(date, tour.durationDays - 1), capacity,
    priceAdult, priceChild: Number(body.priceChild ?? Math.round(priceAdult * 0.7)), priceInfant: Number(body.priceInfant ?? 0),
  }));
  if (body.preview) {
    return { data: { planned, existing, total: dates.length } };
  }
  if (!planned.length) throw apiError("VALIDATION_ERROR", 422, "Không có lịch mới nào để tạo.", { fromDate: "Chọn khoảng ngày khác." });
  const created = tx((database) => {
    const rows = [];
    for (const item of planned) {
      const id = (database._seq.departures = (database._seq.departures || 0) + 1);
      const row = {
        id, tourId: tour.id, departureDate: item.departureDate, returnDate: item.returnDate,
        capacity: item.capacity, seatsTaken: 0, minPaxToRun: minPax,
        priceAdult: item.priceAdult, priceChild: item.priceChild, priceInfant: item.priceInfant,
        singleSupplement: Number(body.singleSupplement || 0),
        bookingCutoffAt: `${addDays(item.departureDate, -cfgNumber(database, "departure.cutoff_days", 2))}T00:00:00.000Z`,
        balanceDueDate: addDays(item.departureDate, -cfgNumber(database, "payment.balance_due_days", 7)),
        goNogoDate: addDays(item.departureDate, -cfgNumber(database, "departure.go_nogo_days", 7)),
        meetingPoint: body.meetingPoint || tour.meetingPointDefault, meetingTime: body.meetingTime || "06:30",
        isGuaranteed: false, status: "open", cancelReason: null, version: 1, createdAt: nowIso(),
      };
      database.departures.push(row);
      rows.push(row);
    }
    audit(ctx, "departure.bulk_create", "departure", null, null, { tourId: tour.id, count: rows.length });
    return rows;
  });
  return { data: { created: created.map((d) => adminDepartureRow(ctx.db, d)), existing } };
};

const departureUpdate = (ctx) => {
  const { db, body, params } = ctx;
  const dep = getDeparture(db, params.id);
  if (!dep) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  if (body.version !== undefined && Number(body.version) !== dep.version) {
    throw apiError("VERSION_CONFLICT", 409, "Lịch khởi hành vừa được người khác cập nhật.");
  }
  const tour = getTour(db, dep.tourId);
  if (body.status === "open") {
    const tourIssues = tour.status !== "published" ? ["Tour chưa xuất bản"] : [];
    if (tourIssues.length) throw apiError("VALIDATION_ERROR", 422, tourIssues.join("; "));
  }
  const validated = validateDepartureInput(db, body, tour, dep);
  if (body.capacity !== undefined && Number(body.capacity) < dep.seatsTaken) {
    throw apiError("VALIDATION_ERROR", 422, "Sức chứa không được nhỏ hơn số chỗ đã bán.", { capacity: "Giảm sức chứa quá mức." });
  }
  const updated = tx((database) => {
    const target = getDeparture(database, dep.id);
    const before = structuredClone({
      status: target.status, capacity: target.capacity, priceAdult: target.priceAdult,
      meetingPoint: target.meetingPoint, meetingTime: target.meetingTime,
    });
    target.departureDate = validated.date;
    target.returnDate = addDays(validated.date, tour.durationDays - 1);
    target.capacity = validated.capacity;
    target.minPaxToRun = validated.minPax;
    target.meetingPoint = validated.meetingPoint;
    target.meetingTime = validated.meetingTime;
    for (const key of ["priceAdult", "priceChild", "priceInfant", "singleSupplement", "bookingCutoffAt", "balanceDueDate", "goNogoDate"]) {
      if (body[key] !== undefined) target[key] = ["priceAdult", "priceChild", "priceInfant", "singleSupplement"].includes(key) ? Number(body[key]) : body[key];
    }
    if (body.status === "open" && ["draft", "closed"].includes(target.status)) target.status = "open";
    else if (body.status === "closed") target.status = "closed";
    if (body.isGuaranteed !== undefined) target.isGuaranteed = Boolean(body.isGuaranteed);
    if (target.seatsTaken >= target.capacity && target.status === "open") target.status = "full";
    target.version += 1;
    if (target.seatsTaken >= target.minPaxToRun) target.isGuaranteed = true;
    audit(ctx, "departure.update", "departure", target.id, before, {
      status: target.status, capacity: target.capacity, priceAdult: target.priceAdult,
      meetingPoint: target.meetingPoint, meetingTime: target.meetingTime,
    });
    return target;
  });
  return { data: adminDepartureRow(ctx.db, updated) };
};

const departureDetail = (ctx) => {
  const { db, params } = ctx;
  const dep = getDeparture(db, params.id);
  if (!dep) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  assertGuideAccess(ctx, dep.id);
  const tour = getTour(db, dep.tourId);
  const isGuide = ctx.user.roles.includes("guide");
  const bookings = db.bookings.filter((b) => b.departureId === dep.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const costs = isGuide ? [] : db.costs.filter((c) => c.departureId === dep.id);
  const assignments = db.assignments.filter((a) => a.departureId === dep.id);
  const revenue = isGuide ? 0 : bookings.filter((b) => ["confirmed", "completed"].includes(b.status)).reduce((sum, b) => sum + b.totalPrice, 0);
  return {
    data: {
      departure: adminDepartureRow(db, dep),
      tour: { id: tour.id, name: tour.name, slug: tour.slug, durationDays: tour.durationDays, durationNights: tour.durationNights, cancellationPolicy: getPolicy(db, tour) },
      bookings: bookings.map((b) => {
        const row = adminBookingRow(db, b);
        return isGuide ? guideSafeBooking(row) : row;
      }),
      assignments: assignments.map((a) => ({
        ...a,
        guide: db.guides.find((g) => g.id === a.guideId) || null,
        vehicle: db.vehicles.find((v) => v.id === a.vehicleId) || null,
      })),
      costs,
      costTotal: isGuide ? 0 : costs.reduce((sum, c) => sum + c.amount, 0),
      revenue,
      profit: isGuide ? 0 : revenue - costs.reduce((sum, c) => sum + c.amount, 0),
      incidents: db.incidents.filter((i) => i.departureId === dep.id),
      history: isGuide ? [] : db.auditLogs.filter((l) => l.entity === "departure" && l.entityId === dep.id).slice(-30),
      manifestCount: db.passengers.filter((p) => bookings.some((b) => b.id === p.bookingId)).length,
      guideView: isGuide,
    },
  };
};

const departureCancel = (ctx) => {
  const { db, body, params } = ctx;
  const dep = getDeparture(db, params.id);
  if (!dep) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  if (!body.reason || String(body.reason).trim().length < 5) {
    throw apiError("VALIDATION_ERROR", 422, "Bắt buộc nhập lý do hủy chuyến.", { reason: "Lý do tối thiểu 5 ký tự." });
  }
  const reasonCode = ["min_pax_not_met", "force_majeure", "operational", "other"].includes(body.reasonCode) ? body.reasonCode : "operational";
  if (dep.isGuaranteed && !ctx.user.roles.includes("super_admin") && reasonCode !== "force_majeure") {
    throw apiError("FORBIDDEN", 403, "Chuyến đã đảm bảo khởi hành; chỉ super_admin hoặc lý do bất khả kháng mới được hủy.");
  }
  const result = tx((database) => {
    const target = getDeparture(database, dep.id);
    return companyCancelDeparture(database, target, {
      reasonCode, note: String(body.reason).trim(), actorId: ctx.user.id, actorType: "staff",
    });
  });
  return { data: { cancelled: true, affected: result.affected, departure: adminDepartureRow(ctx.db, result.departure) } };
};

const departureGoNoGo = (ctx) => {
  const { db, body, params } = ctx;
  const dep = getDeparture(db, params.id);
  if (!dep) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  const decision = body.decision;
  if (!["run", "cancel", "merge"].includes(decision)) throw apiError("VALIDATION_ERROR", 422, "Chọn quyết định chốt đoàn.");
  if (!body.reason || String(body.reason).trim().length < 5) throw apiError("VALIDATION_ERROR", 422, "Bắt buộc nhập lý do chốt đoàn.", { reason: "Lý do tối thiểu 5 ký tự." });
  const result = tx((database) => {
    const target = getDeparture(database, dep.id);
    if (decision === "run") {
      target.isGuaranteed = true;
      target.version += 1;
      audit(ctx, "departure.go_nogo.run", "departure", target.id, { isGuaranteed: false }, { isGuaranteed: true, reason: body.reason });
      for (const booking of database.bookings.filter((b) => b.departureId === target.id && b.status === "confirmed")) {
        notify(database, {
          userId: booking.userId, type: "departure.guaranteed",
          title: `Chuyến ${getTour(database, target.tourId).name} đảm bảo khởi hành`,
          content: "Chuyến của bạn đã đủ khách tối thiểu và chắc chắn khởi hành.",
          email: booking.contactEmail, link: `/account/bookings/${booking.code}`, priority: "high",
        });
      }
      return { decision, departure: target };
    }
    if (decision === "cancel") {
      return { decision, ...companyCancelDeparture(database, target, {
        reasonCode: "min_pax_not_met", note: String(body.reason).trim(), actorId: ctx.user.id, actorType: "staff",
      }) };
    }
    const mergeInto = getDeparture(database, body.mergeIntoId);
    if (!mergeInto || mergeInto.tourId !== target.tourId || mergeInto.id === target.id) {
      throw apiError("VALIDATION_ERROR", 422, "Chọn lịch cùng tour để ghép.", { mergeIntoId: "Lịch không hợp lệ." });
    }
    if (!["open", "full"].includes(mergeInto.status)) throw apiError("DEPARTURE_CLOSED", 409, "Lịch nhận ghép không mở bán.");
    const activeBookings = database.bookings.filter((b) => b.departureId === target.id && ["pending", "confirmed"].includes(b.status));
    const needed = activeBookings.reduce((sum, b) => sum + bookingSeats(database, b), 0);
    if (mergeInto.capacity - mergeInto.seatsTaken < needed) {
      throw apiError("SEAT_UNAVAILABLE", 409, "Lịch nhận ghép không đủ chỗ.", { seatsLeft: mergeInto.capacity - mergeInto.seatsTaken, needed });
    }
    for (const booking of activeBookings) {
      const seats = bookingSeats(database, booking);
      target.seatsTaken = Math.max(0, target.seatsTaken - seats);
      mergeInto.seatsTaken += seats;
      const oldDepartureId = booking.departureId;
      booking.departureId = mergeInto.id;
      booking.balanceDueDate = mergeInto.balanceDueDate;
      booking.version += 1;
      booking.updatedAt = nowIso();
      addHistory(database, booking.id, booking.status, booking.status, {
        actorType: "staff", actorId: ctx.user.id,
        note: `Ghép chuyến từ ${oldDepartureId} sang ${mergeInto.id} — ${body.reason}`,
      });
      notify(database, {
        userId: booking.userId, type: "departure.merged",
        title: `Chuyến của bạn được ghép sang ngày ${mergeInto.departureDate.split("-").reverse().join("/")}`,
        content: "Lịch trình và quyền lợi không thay đổi. Vui lòng kiểm tra lại thông tin chuyến.",
        email: booking.contactEmail, link: `/account/bookings/${booking.code}`, priority: "high",
      });
    }
    if (mergeInto.seatsTaken >= mergeInto.capacity) mergeInto.status = "full";
    target.status = "cancelled";
    target.cancelReason = `Ghép sang lịch ${mergeInto.id}: ${body.reason}`;
    target.version += 1;
    mergeInto.version += 1;
    audit(ctx, "departure.go_nogo.merge", "departure", target.id, null, { mergeIntoId: mergeInto.id, bookings: activeBookings.length, reason: body.reason });
    return { decision, departure: target, mergeInto, moved: activeBookings.length };
  });
  return { data: result };
};

const departureAssign = (ctx) => {
  const { db, body, params } = ctx;
  const dep = getDeparture(db, params.id);
  if (!dep) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  const guide = body.guideId ? db.guides.find((g) => g.id === Number(body.guideId)) : null;
  const vehicle = body.vehicleId ? db.vehicles.find((v) => v.id === Number(body.vehicleId)) : null;
  if (body.guideId && !guide) throw apiError("VALIDATION_ERROR", 422, "Không tìm thấy hướng dẫn viên.", { guideId: "Không hợp lệ." });
  if (body.vehicleId && !vehicle) throw apiError("VALIDATION_ERROR", 422, "Không tìm thấy xe.", { vehicleId: "Không hợp lệ." });
  if (vehicle && vehicle.seats < dep.seatsTaken) throw apiError("VALIDATION_ERROR", 422, "Xe không đủ chỗ cho số khách hiện tại.", { vehicleId: "Chọn xe lớn hơn." });
  for (const other of db.departures) {
    if (other.id === dep.id || other.status === "cancelled" || other.status === "completed") continue;
    const overlap = other.departureDate <= dep.returnDate && other.returnDate >= dep.departureDate;
    if (!overlap) continue;
    const assigned = db.assignments.filter((a) => a.departureId === other.id);
    if (guide && assigned.some((a) => a.guideId === guide.id)) {
      throw apiError("VALIDATION_ERROR", 422, `Hướng dẫn viên đã được phân công chuyến trùng lịch (${other.departureDate}).`, { guideId: "Trùng lịch." });
    }
    if (vehicle && assigned.some((a) => a.vehicleId === vehicle.id)) {
      throw apiError("VALIDATION_ERROR", 422, `Xe đã được phân công chuyến trùng lịch (${other.departureDate}).`, { vehicleId: "Trùng lịch." });
    }
  }
  const assignment = tx((database) => {
    let row = database.assignments.find((a) => a.departureId === dep.id);
    if (!row) {
      row = {
        id: (database._seq.assignments = (database._seq.assignments || 0) + 1),
        departureId: dep.id, guideId: guide?.id || null, vehicleId: vehicle?.id || null,
        note: body.note || null, createdAt: nowIso(),
      };
      database.assignments.push(row);
    } else {
      row.guideId = guide?.id || null;
      row.vehicleId = vehicle?.id || null;
      row.note = body.note || null;
    }
    if (guide && !guide.userId) {
      // link guide profile to a guide account by email/phone if possible
      const user = database.users.find((u) => u.roles.includes("guide") && (!guide.userId));
      if (user) guide.userId = user.id;
    }
    audit(ctx, "departure.assign", "departure", dep.id, null, { guideId: guide?.id || null, vehicleId: vehicle?.id || null });
    return row;
  });
  return { data: assignment };
};

const departureCostAdd = (ctx) => {
  const { db, body, params } = ctx;
  const dep = getDeparture(db, params.id);
  if (!dep) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw apiError("VALIDATION_ERROR", 422, "Chi phí phải lớn hơn 0.", { amount: "Không hợp lệ." });
  const cost = tx((database) => {
    const row = {
      id: (database._seq.costs = (database._seq.costs || 0) + 1),
      departureId: dep.id, supplierId: body.supplierId ? Number(body.supplierId) : null,
      category: String(body.category || "other").slice(0, 60),
      amount: Math.round(amount), note: body.note ? String(body.note).slice(0, 300) : null,
      createdAt: nowIso(),
    };
    database.costs.push(row);
    audit(ctx, "departure.cost.add", "departure", dep.id, null, { amount: row.amount, category: row.category });
    return row;
  });
  return { data: cost };
};

const departureCostDelete = (ctx) => {
  const cost = ctx.db.costs.find((c) => c.id === Number(ctx.params.costId));
  if (!cost) throw apiError("NOT_FOUND", 404, "Không tìm thấy chi phí.");
  tx((database) => {
    database.costs = database.costs.filter((c) => c.id !== cost.id);
    audit(ctx, "departure.cost.delete", "departure", cost.departureId, { amount: cost.amount }, null);
  });
  return { data: { deleted: true } };
};

const departureIncidentAdd = (ctx) => {
  const { db, body, params } = ctx;
  if (!hasPermission(ctx.user, "operations:manage") && !hasPermission(ctx.user, "manifest:read")) {
    throw apiError("FORBIDDEN", 403, "Bạn không có quyền.");
  }
  const dep = getDeparture(db, params.id);
  if (!dep) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  assertGuideAccess(ctx, dep.id);
  if (!body.description || String(body.description).trim().length < 10) {
    throw apiError("VALIDATION_ERROR", 422, "Mô tả sự cố tối thiểu 10 ký tự.", { description: "Bắt buộc." });
  }
  const incident = tx((database) => {
    const row = {
      id: (database._seq.incidents = (database._seq.incidents || 0) + 1),
      departureId: dep.id, type: String(body.type || "other").slice(0, 40),
      severity: ["low", "medium", "high", "critical"].includes(body.severity) ? body.severity : "medium",
      description: String(body.description).slice(0, 1000), status: "open",
      reportedBy: ctx.user.id, createdAt: nowIso(), resolvedAt: null,
    };
    database.incidents.push(row);
    if (row.severity === "critical" || row.severity === "high") {
      for (const admin of database.users.filter((u) => u.roles.includes("super_admin") || u.roles.includes("operator"))) {
        notify(database, {
          userId: admin.id, type: "incident.high", title: `Sự cố ${row.severity} — chuyến ${dep.departureDate}`,
          content: row.description.slice(0, 200), link: `/admin/departures/${dep.id}`, priority: "urgent",
        });
      }
    }
    audit(ctx, "departure.incident.add", "departure", dep.id, null, { severity: row.severity, type: row.type });
    return row;
  });
  return { data: incident };
};

const departureIncidentResolve = (ctx) => {
  const incident = ctx.db.incidents.find((i) => i.id === Number(ctx.params.incidentId));
  if (!incident) throw apiError("NOT_FOUND", 404, "Không tìm thấy sự cố.");
  tx((database) => {
    const target = database.incidents.find((i) => i.id === incident.id);
    target.status = "resolved";
    target.resolvedAt = nowIso();
    target.resolution = ctx.body.resolution ? String(ctx.body.resolution).slice(0, 500) : null;
    audit(ctx, "departure.incident.resolve", "departure", incident.departureId, { status: "open" }, { status: "resolved" });
  });
  return { data: { resolved: true } };
};

const departureCheckin = (ctx) => {
  const { db, body, params } = ctx;
  if (!hasPermission(ctx.user, "operations:manage") && !hasPermission(ctx.user, "manifest:read")) {
    throw apiError("FORBIDDEN", 403, "Bạn không có quyền.");
  }
  const dep = getDeparture(db, params.id);
  if (!dep) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  assertGuideAccess(ctx, dep.id);
  const booking = db.bookings.find((b) => b.id === Number(body.bookingId) && b.departureId === dep.id);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn trong chuyến.");
  const status = ["checked_in", "no_show", "pending"].includes(body.status) ? body.status : "checked_in";
  tx((database) => {
    const target = database.bookings.find((b) => b.id === booking.id);
    target.checkinStatus = status;
    target.checkinAt = nowIso();
    addHistory(database, booking.id, booking.status, booking.status, {
      actorType: "staff", actorId: ctx.user.id, note: status === "no_show" ? "Ghi nhận no-show" : "Điểm danh khách",
    });
    if (status === "no_show") {
      target.cancelReasonCode = "no_show";
      target.internalNote = `${target.internalNote || ""}\nNo-show ghi nhận lúc ${nowIso()}`.trim();
    }
    audit(ctx, "departure.checkin", "booking", booking.code, null, { status });
  });
  return { data: { checkinStatus: status } };
};

const departureManifest = (ctx) => {
  const { db, params, query } = ctx;
  const dep = getDeparture(db, params.id);
  if (!dep) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  if (!hasPermission(ctx.user, "manifest:read")) throw apiError("FORBIDDEN", 403, "Bạn không có quyền xem manifest.");
  assertGuideAccess(ctx, dep.id);
  const full = query.full === "1";
  if (full && !hasPermission(ctx.user, "export:pii")) {
    throw apiError("FORBIDDEN", 403, "Bạn không có quyền xuất dữ liệu giấy tờ đầy đủ.");
  }
  if (hasPermission(ctx.user, "manifest:export")) {
    tx((database) => audit(ctx, "manifest.export", "departure", dep.id, null, { full }));
  }
  return {
    data: {
      html: manifestHtml(db, dep, { fullDocuments: full, exportedBy: ctx.user.fullName }),
      filename: `Manifest-${getTour(db, dep.tourId)?.name || "tour"}-${dep.departureDate}.html`,
    },
  };
};

/* ====================== BOOKINGS ====================== */

const bookingList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.bookings.map((b) => adminBookingRow(db, b));
  if (ctx.user.roles.includes("guide")) {
    const assigned = db.assignments.filter((a) => db.guides.find((g) => g.id === a.guideId)?.userId === ctx.user.id).map((a) => a.departureId);
    rows = rows.filter((row) => assigned.includes(row.departureId)).map(guideSafeBooking);
  }
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.paymentStatus) rows = rows.filter((r) => r.paymentStatus === query.paymentStatus);
  if (query.tourId) rows = rows.filter((r) => r.tour.id === Number(query.tourId));
  if (query.departureId) rows = rows.filter((r) => r.departureId === Number(query.departureId));
  if (query.channel) rows = rows.filter((r) => r.channel === query.channel);
  if (query.assignedTo) rows = rows.filter((r) => r.assignedTo === Number(query.assignedTo));
  if (query.overdue === "hold") rows = rows.filter((r) => r.holdExpiresAt && new Date(r.holdExpiresAt).getTime() - Date.now() < 2 * 3600 * 1000 && new Date(r.holdExpiresAt).getTime() > Date.now());
  if (query.overdue === "balance") rows = rows.filter((r) => r.balanceDueDate && r.balanceDueDate < todayVN() && r.remaining > 0);
  if (query.from) rows = rows.filter((r) => r.departureDate >= query.from);
  if (query.to) rows = rows.filter((r) => r.departureDate <= query.to);
  if (query.q) {
    const q = normalizeText(query.q);
    rows = rows.filter((r) => normalizeText(`${r.code} ${r.customerName} ${r.customerEmail} ${r.customerPhone} ${r.tour.name}`).includes(q));
  }
  rows.sort((a, b) => (query.sort === "departure" ? (a.departureDate || "").localeCompare(b.departureDate || "") : b.createdAt.localeCompare(a.createdAt)));
  const paged = pageRows(rows, query);
  return paged;
};

const bookingCreateAdmin = (ctx) => {
  const { db, body } = ctx;
  if (!hasPermission(ctx.user, "booking:update")) throw apiError("FORBIDDEN", 403, "Không có quyền tạo đơn.");
  const departure = getDeparture(db, body.departureId);
  if (!departure) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  const tour = getTour(db, departure.tourId);
  const contact = body.contact || {};
  const email = String(contact.email || "").trim().toLowerCase();
  if (!validateEmail(email)) throw apiError("VALIDATION_ERROR", 422, "Email liên hệ không hợp lệ.", { email: "Không hợp lệ." });
  if (!contact.fullName || String(contact.fullName).trim().length < 2) throw apiError("VALIDATION_ERROR", 422, "Nhập họ tên khách.", { fullName: "Bắt buộc." });
  const phone = normalizePhone(contact.phone || "");
  if (!validatePhone(phone)) throw apiError("VALIDATION_ERROR", 422, "Số điện thoại không hợp lệ.", { phone: "Không hợp lệ." });
  const passengersInput = Array.isArray(body.passengers) ? body.passengers : [];
  if (!passengersInput.length) throw apiError("VALIDATION_ERROR", 422, "Nhập danh sách hành khách.", { passengers: "Bắt buộc." });
  const today = todayVN();
  const dobs = passengersInput.map((p) => {
    const dob = String(p.dateOfBirth || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || dob > today) throw apiError("VALIDATION_ERROR", 422, "Ngày sinh hành khách không hợp lệ.");
    if (!p.fullName || String(p.fullName).trim().length < 2) throw apiError("VALIDATION_ERROR", 422, "Họ tên hành khách không hợp lệ.");
    if (tour.requiresIdDocument && !/^\d{9}$|^\d{12}$/.test(String(p.idNumber || "").replace(/\s/g, ""))) {
      throw apiError("VALIDATION_ERROR", 422, "Tour yêu cầu số CCCD/CMND hợp lệ cho từng hành khách.", { idNumber: "Bắt buộc 9 hoặc 12 chữ số." });
    }
    if (tour.requiresPassport && !/^[A-Z0-9]{6,9}$/.test(String(p.passportNumber || "").replace(/\s/g, "").toUpperCase())) {
      throw apiError("VALIDATION_ERROR", 422, "Tour yêu cầu số hộ chiếu hợp lệ cho từng hành khách.", { passportNumber: "Bắt buộc 6–9 ký tự." });
    }
    return dob;
  });
  const classes = dobs.map((dob) => {
    const [by, bm, bd] = dob.split("-").map(Number);
    const [y, m, d] = departure.departureDate.split("-").map(Number);
    const age = y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
    return age < tour.ageInfantMax ? "infant" : age < tour.ageChildMax ? "child" : "adult";
  });
  const counts = {
    adults: classes.filter((c) => c === "adult").length,
    children: classes.filter((c) => c === "child").length,
    infants: classes.filter((c) => c === "infant").length,
  };
  if (!counts.adults) throw apiError("VALIDATION_ERROR", 422, "Cần ít nhất một người lớn.");
  const quote = computeQuote(db, {
    tour, departure,
    input: { ...counts, singles: body.singles || 0, couponCode: body.couponCode },
    userId: null,
  });
  if (departure.seatsTaken + quote.seatsRequired > departure.capacity) {
    throw apiError("SEAT_UNAVAILABLE", 409, "Chuyến không đủ chỗ.");
  }
  const result = tx((database) => {
    const existingUser = database.users.find((u) => u.email === email);
    if (existingUser && !existingUser.roles.includes("customer")) {
      throw apiError("VALIDATION_ERROR", 422, "Email này thuộc tài khoản nội bộ. Vui lòng dùng email khách hàng khác.", { email: "Email nội bộ." });
    }
    let customer = existingUser;
    if (!customer) {
      const id = (database._seq.users = (database._seq.users || 0) + 1);
      customer = {
        id, fullName: String(contact.fullName).trim(), email, phone,
        passwordHash: hashPassword(randomToken(16)), roles: ["customer"], emailVerifiedAt: null,
        status: "active", marketingConsent: false, failedLoginCount: 0, lockedUntil: null,
        mfaEnabled: false, createdAt: nowIso(), termsVersion: cfg(database, "terms.version"),
      };
      database.users.push(customer);
      const token = randomToken(24);
      database.authTokens.push({
        id: (database._seq.authTokens = (database._seq.authTokens || 0) + 1),
        userId: customer.id, purpose: "invite", tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), usedAt: null, createdAt: nowIso(),
      });
      database.outbox.push({
        id: (database._seq.outbox = (database._seq.outbox || 0) + 1),
        to: email, subject: "VietTrails — Kích hoạt tài khoản của bạn",
        body: "Nhân viên VietTrails đã tạo đơn hộ bạn. Bấm liên kết để đặt mật khẩu và quản lý đơn.",
        link: `/reset-password?token=${token}&invite=1`, type: "invite", status: "sent",
        attempts: 1, createdAt: nowIso(), sentAt: nowIso(),
      });
    }
    const targetDep = getDeparture(database, departure.id);
    if (targetDep.seatsTaken + quote.seatsRequired > targetDep.capacity) throw apiError("SEAT_UNAVAILABLE", 409, "Chuyến vừa hết chỗ.");
    const code = (() => {
      for (let i = 0; i < 20; i++) {
        const candidate = `VT${today.replace(/-/g, "").slice(2)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
        if (!database.bookings.some((b) => b.code === candidate)) return candidate;
      }
      return `VT-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    })();
    const booking = {
      id: (database._seq.bookings = (database._seq.bookings || 0) + 1),
      code, userId: customer.id, departureId: targetDep.id,
      contactName: String(contact.fullName).trim(), contactEmail: email, contactPhone: phone,
      adults: quote.adults, children: quote.children, infants: quote.infants, singles: quote.singles,
      priceSnapshot: quote.lines, subtotal: quote.subtotal, discountTotal: quote.discountTotal,
      couponCode: quote.coupon?.valid ? quote.coupon.code : null,
      totalPrice: quote.total, depositRequired: quote.deposit.amount,
      paidAmount: 0, refundedAmount: 0, balanceDueDate: quote.balanceDueDate,
      status: "pending", paymentStatus: "unpaid", holdExpiresAt: holdExpiryFor(database, targetDep),
      channel: ["counter", "phone", "agent"].includes(body.channel) ? body.channel : "counter",
      createdByUserId: ctx.user.id, assignedTo: ctx.user.id,
      customerNote: body.customerNote || null, internalNote: body.internalNote || null,
      cancelBy: null, cancelReasonCode: null, cancelledAt: null, termsVersion: cfg(database, "terms.version"),
      changeCount: 0, version: 1, createdAt: nowIso(), updatedAt: nowIso(),
    };
    database.bookings.push(booking);
    targetDep.seatsTaken += quote.seatsRequired;
    if (targetDep.seatsTaken >= targetDep.capacity) targetDep.status = "full";
    if (targetDep.seatsTaken >= targetDep.minPaxToRun) targetDep.isGuaranteed = true;
    targetDep.version += 1;
    passengersInput.forEach((p, index) => {
      database.passengers.push({
        id: (database._seq.passengers = (database._seq.passengers || 0) + 1),
        bookingId: booking.id, fullName: String(p.fullName).trim(),
        gender: ["male", "female", "other"].includes(p.gender) ? p.gender : "other",
        dateOfBirth: p.dateOfBirth, type: classes[index],
        idNumber: p.idNumber ? String(p.idNumber).replace(/\s/g, "").toUpperCase() : null,
        passportNumber: p.passportNumber ? String(p.passportNumber).replace(/\s/g, "").toUpperCase() : null,
        nationality: p.nationality || "Việt Nam", specialRequest: p.specialRequest || null, isLead: index === 0,
      });
    });
    if (quote.coupon?.valid) {
      const coupon = database.coupons.find((c) => c.code === quote.coupon.code);
      coupon.usedCount += 1;
      database.couponUsages.push({
        id: (database._seq.couponUsages = (database._seq.couponUsages || 0) + 1),
        couponId: coupon.id, userId: customer.id, bookingId: booking.id,
        discountAmount: quote.discountTotal, usedAt: nowIso(), voidedAt: null,
      });
    }
    addHistory(database, booking.id, null, "pending", {
      actorType: "staff", actorId: ctx.user.id, note: `Đơn tạo hộ qua kênh ${booking.channel}`,
    });
    notify(database, {
      userId: customer.id, type: "booking.created.offline",
      title: `VietTrails đã tạo đơn ${booking.code} cho bạn`,
      content: `Vui lòng thanh toán ${quote.deposit.amount.toLocaleString("vi-VN")} đ để xác nhận chỗ. Hạn giữ chỗ ${new Date(booking.holdExpiresAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.`,
      email, link: `/booking/${booking.code}/pay`, priority: "high",
    });
    audit(ctx, "booking.create_admin", "booking", booking.code, null, { departureId: targetDep.id, total: booking.totalPrice, channel: booking.channel });
    return { booking, customer, quote };
  });
  return {
    data: {
      code: result.booking.code,
      booking: adminBookingRow(ctx.db, result.booking),
      quote: result.quote,
      customer: { id: result.customer.id, email: result.customer.email, emailVerified: Boolean(result.customer.emailVerifiedAt) },
    },
  };
};

const bookingDetailAdmin = (ctx) => {
  const { db, params } = ctx;
  const booking = getBooking(db, params.code);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  if (ctx.user.roles.includes("guide")) assertGuideAccess(ctx, booking.departureId);
  const isGuide = ctx.user.roles.includes("guide");
  const departure = getDeparture(db, booking.departureId);
  const tour = getTour(db, departure.tourId);
  const passengers = db.passengers.filter((p) => p.bookingId === booking.id).map((p) => ({
    ...p, idNumber: maskDocument(p.idNumber), passportNumber: maskDocument(p.passportNumber),
  }));
  return {
    data: {
      ...adminBookingRow(db, booking),
      contact: { fullName: booking.contactName, email: isGuide ? "" : booking.contactEmail, phone: booking.contactPhone },
      ...(isGuide ? {
        total: 0, paid: 0, remaining: 0, depositRequired: 0, refundedAmount: 0, priceSnapshot: [],
        subtotal: 0, discountTotal: 0, couponCode: null, payments: [], refunds: [], invoice: null, review: null,
        internalNote: null, customerNote: null, customerEmail: null, paymentStatus: "paid",
      } : {
        priceSnapshot: booking.priceSnapshot,
        subtotal: booking.subtotal, discountTotal: booking.discountTotal, couponCode: booking.couponCode,
        depositRequired: booking.depositRequired, refundedAmount: booking.refundedAmount,
        payments: db.payments.filter((p) => p.bookingId === booking.id),
        refunds: db.refunds.filter((r) => r.bookingId === booking.id),
        invoice: db.invoices.find((i) => i.bookingId === booking.id) || null,
        review: db.reviews.find((r) => r.bookingId === booking.id) || null,
        customerNote: booking.customerNote, internalNote: booking.internalNote,
      }),
      departure: publicDeparture(departure),
      tour: { id: tour.id, name: tour.name, slug: tour.slug, cover: tour.cover },
      passengers,
      history: db.bookingHistory.filter((h) => h.bookingId === booking.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      changeRequests: db.changeRequests.filter((c) => c.bookingId === booking.id),
      allowedActions: allowedActionsFor(db, booking, departure, { id: booking.userId }),
      adminActions: {
        confirm: booking.status === "pending",
        cancel: ["pending", "confirmed"].includes(booking.status),
        extendHold: booking.status === "pending" && !booking.holdExtendedAt,
        recordPayment: ["pending", "confirmed"].includes(booking.status) && grossPaidAmount(db, booking.id) < booking.totalPrice,
        approveChange: booking.status === "confirmed",
      },
      serverTime: nowIso(),
    },
  };
};

const bookingConfirmAdmin = (ctx) => {
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  const result = tx((database) => {
    const target = database.bookings.find((b) => b.id === booking.id);
    return confirmBooking(database, target, {
      actorType: "staff", actorId: ctx.user.id, note: ctx.body.note || "Nhân viên xác nhận đơn",
    });
  });
  return { data: adminBookingRow(ctx.db, result) };
};

const bookingCancelQuoteAdmin = (ctx) => {
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  const departure = getDeparture(ctx.db, booking.departureId);
  return {
    data: computeCancellationQuote(ctx.db, {
      booking, departure, tour: getTour(ctx.db, departure.tourId),
    }),
  };
};

const bookingCancelAdmin = (ctx) => {
  const { db, body } = ctx;
  const booking = getBooking(db, ctx.params.code);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  if (!hasPermission(ctx.user, "booking:cancel")) throw apiError("FORBIDDEN", 403, "Không có quyền hủy đơn.");
  const allowed = ["customer_request", "unpaid", "no_show", "min_pax_not_met", "force_majeure", "operational", "duplicate", "fraud", "other"];
  const reasonCode = allowed.includes(body.reasonCode) ? body.reasonCode : "other";
  const result = tx((database) => {
    const target = database.bookings.find((b) => b.id === booking.id);
    const quote = computeCancellationQuote(database, {
      booking: target, departure: getDeparture(database, target.departureId), tour: getTour(database, getDeparture(database, target.departureId).tourId),
    });
    if (body.forceRefund) {
      return cancelBookingNow(database, target, {
        cancelBy: body.cancelBy === "company" ? "company" : "staff", reasonCode: body.reasonCode || "operational",
        note: body.note || null, actorId: ctx.user.id, actorType: "staff", force: true,
      });
    }
    return { ...cancelBookingNow(database, target, {
      cancelBy: "staff", reasonCode, note: body.note || null, actorId: ctx.user.id, actorType: "staff",
    }), quote };
  });
  return { data: { cancelled: true, quote: result.quote, refund: result.refund, booking: adminBookingRow(ctx.db, getBooking(ctx.db, booking.code)) } };
};

const bookingExtendHold = (ctx) => {
  const { db, body } = ctx;
  const booking = getBooking(db, ctx.params.code);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  if (booking.status !== "pending") throw apiError("INVALID_STATE_TRANSITION", 409, "Chỉ đơn đang giữ chỗ mới được gia hạn.");
  if (booking.holdExtendedAt) throw apiError("INVALID_STATE_TRANSITION", 409, "Đơn này đã được gia hạn một lần.");
  const reason = String(body.reason || "").trim();
  if (reason.length < 5) throw apiError("VALIDATION_ERROR", 422, "Bắt buộc nhập lý do gia hạn.", { reason: "Tối thiểu 5 ký tự." });
  const hours = Number(body.hours);
  const max = cfgNumber(db, "hold.max_extend_hours", 24);
  if (!Number.isFinite(hours) || hours <= 0 || hours > max) {
    throw apiError("VALIDATION_ERROR", 422, `Số giờ gia hạn phải từ 1 đến ${max}.`, { hours: `Tối đa ${max} giờ.` });
  }
  const result = tx((database) => {
    const target = database.bookings.find((b) => b.id === booking.id);
    const base = target.holdExpiresAt && new Date(target.holdExpiresAt) > new Date() ? new Date(target.holdExpiresAt) : new Date();
    target.holdExpiresAt = new Date(base.getTime() + hours * 3600 * 1000).toISOString();
    target.holdExtendedAt = nowIso();
    target.holdExtendReason = reason;
    target.version += 1;
    target.updatedAt = nowIso();
    addHistory(database, target.id, target.status, target.status, {
      actorType: "staff", actorId: ctx.user.id, note: `Gia hạn giữ chỗ thêm ${hours} giờ: ${reason}`,
    });
    audit(ctx, "booking.extend_hold", "booking", target.code, { holdExpiresAt: booking.holdExpiresAt }, { holdExpiresAt: target.holdExpiresAt });
    return target;
  });
  return { data: { holdExpiresAt: result.holdExpiresAt } };
};

const bookingNote = (ctx) => {
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  const note = String(ctx.body.internalNote || "").slice(0, 2000);
  tx((database) => {
    const target = database.bookings.find((b) => b.id === booking.id);
    const before = target.internalNote;
    target.internalNote = note;
    target.updatedAt = nowIso();
    target.version += 1;
    audit(ctx, "booking.note", "booking", booking.code, { internalNote: before }, { internalNote: note });
  });
  return { data: { saved: true } };
};

const bookingAssign = (ctx) => {
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  const staffId = ctx.body.assignedTo ? Number(ctx.body.assignedTo) : null;
  if (staffId && !ctx.db.users.some((u) => u.id === staffId && u.roles.some((r) => r !== "customer"))) {
    throw apiError("VALIDATION_ERROR", 422, "Nhân viên không hợp lệ.", { assignedTo: "Chọn nhân viên." });
  }
  tx((database) => {
    const target = database.bookings.find((b) => b.id === booking.id);
    target.assignedTo = staffId;
    target.updatedAt = nowIso();
    audit(ctx, "booking.assign", "booking", booking.code, { assignedTo: booking.assignedTo }, { assignedTo: staffId });
  });
  return { data: { assignedTo: staffId } };
};

const bookingManualPayment = (ctx) => {
  const { db, body } = ctx;
  const booking = getBooking(db, ctx.params.code);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  if (!hasPermission(ctx.user, "payment:confirm")) throw apiError("FORBIDDEN", 403, "Không có quyền ghi nhận thanh toán.");
  if (!["pending", "confirmed"].includes(booking.status)) throw apiError("INVALID_STATE_TRANSITION", 409, "Đơn không thể ghi nhận thanh toán.");
  const gross = grossPaidAmount(db, booking.id);
  const outstanding = Math.max(0, booking.totalPrice - gross);
  const amount = Math.round(Number(body.amount || outstanding));
  if (!Number.isFinite(amount) || amount <= 0) throw apiError("VALIDATION_ERROR", 422, "Số tiền không hợp lệ.", { amount: "Lớn hơn 0." });
  if (amount > outstanding) throw apiError("PAYMENT_AMOUNT_MISMATCH", 409, "Số tiền vượt quá số còn phải thu.", undefined, { outstanding });
  const method = ["cash", "pos_card", "bank_transfer"].includes(body.method) ? body.method : "cash";
  const result = tx((database) => {
    const target = database.bookings.find((b) => b.id === booking.id);
    const payment = {
      id: (database._seq.payments = (database._seq.payments || 0) + 1),
      bookingId: target.id, purpose: amount >= outstanding ? "full" : "balance",
      method, provider: method === "bank_transfer" ? "vietqr" : "counter", amount,
      currency: "VND", status: "succeeded", providerTxnId: `MANUAL-${Date.now()}`,
      merchantRef: `VT-${target.code}-M${Date.now().toString(36).toUpperCase()}`,
      idempotencyKey: null, paidAt: body.paidAt ? new Date(body.paidAt).toISOString() : nowIso(),
      proofUrl: body.proofUrl || null, confirmedBy: ctx.user.id,
      note: body.note ? String(body.note).slice(0, 500) : "Ghi nhận thủ công tại quầy",
      rawPayload: null, flag: null, reconciledAt: null, createdAt: nowIso(), updatedAt: nowIso(),
    };
    database.payments.push(payment);
    const applied = applyPaymentSuccess(database, payment, {
      providerTxnId: payment.providerTxnId, paidAt: payment.paidAt, actorId: ctx.user.id, source: "manual",
    });
    payment.confirmedBy = ctx.user.id;
    if (payment.note) payment.note = body.note || payment.note;
    addHistory(database, target.id, target.status, target.status, {
      actorType: "staff", actorId: ctx.user.id, note: `Ghi nhận thanh toán ${amount.toLocaleString("vi-VN")} đ (${method})`,
    });
    audit(ctx, "payment.manual", "payment", payment.merchantRef, null, { booking: target.code, amount, method });
    return { payment: applied.payment, booking: target };
  });
  return { data: { payment: result.payment, booking: adminBookingRow(ctx.db, result.booking) } };
};

const bookingRevealDocument = (ctx) => {
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  if (!hasPermission(ctx.user, "export:pii")) throw apiError("FORBIDDEN", 403, "Bạn không có quyền xem đầy đủ giấy tờ.");
  const passenger = ctx.db.passengers.find((p) => p.id === Number(ctx.params.passengerId) && p.bookingId === booking.id);
  if (!passenger) throw apiError("NOT_FOUND", 404, "Không tìm thấy hành khách.");
  tx((database) => {
    audit(ctx, "booking.passenger.reveal_document", "booking", booking.code, null, { passengerId: passenger.id });
  });
  return { data: { idNumber: passenger.idNumber, passportNumber: passenger.passportNumber } };
};

const changeRequestList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.changeRequests.map((r) => {
    const booking = db.bookings.find((b) => b.id === r.bookingId);
    const dep = getDeparture(db, booking?.departureId);
    return {
      ...r, bookingCode: booking?.code, customerName: booking?.contactName,
      customerEmail: booking?.contactEmail, departureDate: dep?.departureDate,
      tourName: getTour(db, dep?.tourId)?.name, requesterName: staffName(db, r.requestedBy) || booking?.contactName,
    };
  });
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.type) rows = rows.filter((r) => r.type === query.type);
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return pageRows(rows, query);
};

const changeRequestApprove = (ctx) => {
  const request = ctx.db.changeRequests.find((r) => r.id === Number(ctx.params.id));
  if (!request) throw apiError("NOT_FOUND", 404, "Không tìm thấy yêu cầu.");
  if (!["booking:update", "booking:cancel"].some((p) => hasPermission(ctx.user, p))) {
    throw apiError("FORBIDDEN", 403, "Không có quyền duyệt yêu cầu.");
  }
  const result = tx((database) => {
    const target = database.changeRequests.find((r) => r.id === request.id);
    if (target.type === "cancel") {
      const booking = database.bookings.find((b) => b.id === target.bookingId);
      target.status = "approved";
      target.decidedBy = ctx.user.id;
      target.decisionNote = ctx.body.note || null;
      target.updatedAt = nowIso();
      const cancelled = cancelBookingNow(database, booking, {
        cancelBy: "customer", reasonCode: target.payload?.reasonCode || "customer_request",
        note: target.payload?.note || ctx.body.note || null, actorId: ctx.user.id, actorType: "staff",
      });
      target.status = "completed";
      return { booking: cancelled.booking, quote: cancelled.quote, request: target };
    }
    return approveChangeRequest(database, target, { actorId: ctx.user.id, actorType: "staff", note: ctx.body.note || null });
  });
  return { data: { ...result, booking: adminBookingRow(ctx.db, result.booking) } };
};

const changeRequestReject = (ctx) => {
  const request = ctx.db.changeRequests.find((r) => r.id === Number(ctx.params.id));
  if (!request) throw apiError("NOT_FOUND", 404, "Không tìm thấy yêu cầu.");
  if (!["booking:update", "booking:cancel"].some((p) => hasPermission(ctx.user, p))) throw apiError("FORBIDDEN", 403, "Không có quyền.");
  if (request.status !== "submitted") throw apiError("INVALID_STATE_TRANSITION", 409, "Yêu cầu đã được xử lý.");
  tx((database) => {
    const target = database.changeRequests.find((r) => r.id === request.id);
    target.status = "rejected";
    target.decidedBy = ctx.user.id;
    target.decisionNote = ctx.body.note || null;
    target.updatedAt = nowIso();
    const booking = database.bookings.find((b) => b.id === target.bookingId);
    if (booking) {
      notify(database, {
        userId: booking.userId, type: "booking.change_rejected",
        title: `Yêu cầu ${target.type === "cancel" ? "hủy" : "đổi"} đơn ${booking.code} bị từ chối`,
        content: target.decisionNote || "Vui lòng liên hệ hotline để được hỗ trợ thêm.",
        email: booking.contactEmail, link: `/account/bookings/${booking.code}`,
      });
      addHistory(database, booking.id, booking.status, booking.status, {
        actorType: "staff", actorId: ctx.user.id, note: `Từ chối yêu cầu ${target.type}`,
      });
    }
    audit(ctx, "change_request.reject", "booking", booking?.code, null, { requestId: target.id, note: target.decisionNote });
  });
  return { data: { rejected: true } };
};

/* ====================== PAYMENTS ADMIN ====================== */

const paymentList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.payments.map((p) => {
    const booking = db.bookings.find((b) => b.id === p.bookingId);
    const dep = getDeparture(db, booking?.departureId);
    return {
      ...p,
      bookingCode: booking?.code, customerName: booking?.contactName, customerEmail: booking?.contactEmail,
      tourName: getTour(db, dep?.tourId)?.name, departureDate: dep?.departureDate,
    };
  });
  const tab = query.tab || "all";
  if (tab === "confirm") rows = rows.filter((r) => r.method === "bank_transfer" && ["pending", "initiated"].includes(r.status) && r.proofUrl);
  if (tab === "review") rows = rows.filter((r) => r.flag === "amount_mismatch" || (r.status === "pending" && !r.proofUrl));
  if (tab === "reconcile") rows = rows.filter((r) => ["succeeded", "failed"].includes(r.status));
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.method) rows = rows.filter((r) => r.method === query.method);
  if (query.q) rows = rows.filter((r) => normalizeText(`${r.merchantRef} ${r.bookingCode} ${r.customerName}`).includes(normalizeText(query.q)));
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return pageRows(rows, query);
};

const paymentConfirm = (ctx) => {
  const payment = ctx.db.payments.find((p) => p.id === Number(ctx.params.id));
  if (!payment) throw apiError("NOT_FOUND", 404, "Không tìm thấy giao dịch.");
  if (!hasPermission(ctx.user, "payment:confirm")) throw apiError("FORBIDDEN", 403, "Không có quyền xác nhận thanh toán.");
  if (payment.status === "succeeded") throw apiError("PAYMENT_ALREADY_SETTLED", 409, "Giao dịch đã được xác nhận.");
  if (payment.method !== "bank_transfer") throw apiError("VALIDATION_ERROR", 422, "Chỉ xác nhận giao dịch chuyển khoản.");
  const received = Math.round(Number(ctx.body.receivedAmount ?? payment.amount));
  if (received !== payment.amount) {
    throw apiError("PAYMENT_AMOUNT_MISMATCH", 409, "Số tiền thực nhận không khớp với số tiền cần thu.", {
      receivedAmount: `Cần đúng ${payment.amount.toLocaleString("vi-VN")} đ`,
    }, { expected: payment.amount, received });
  }
  const result = tx((database) => {
    const target = database.payments.find((p) => p.id === payment.id);
    target.confirmedBy = ctx.user.id;
    target.note = ctx.body.note || null;
    const paidAt = ctx.body.paidAt ? new Date(ctx.body.paidAt).toISOString() : nowIso();
    const applied = applyPaymentSuccess(database, target, {
      providerTxnId: ctx.body.providerTxnId || `BANK-${target.id}`, paidAt, actorId: ctx.user.id, source: "accountant",
    });
    database.alerts = database.alerts.map((a) => (a.entity === "payment" && a.entityId === target.id ? { ...a, status: "resolved", resolvedAt: nowIso() } : a));
    audit(ctx, "payment.confirm_transfer", "payment", payment.merchantRef, { status: payment.status }, { status: "succeeded", received });
    return applied;
  });
  return { data: { payment: result.payment, booking: adminBookingRow(ctx.db, ctx.db.bookings.find((b) => b.id === payment.bookingId)) } };
};

const paymentReject = (ctx) => {
  const payment = ctx.db.payments.find((p) => p.id === Number(ctx.params.id));
  if (!payment) throw apiError("NOT_FOUND", 404, "Không tìm thấy giao dịch.");
  if (!hasPermission(ctx.user, "payment:confirm")) throw apiError("FORBIDDEN", 403, "Không có quyền.");
  if (payment.status === "succeeded") throw apiError("PAYMENT_ALREADY_SETTLED", 409, "Không thể từ chối giao dịch đã thành công.");
  if (!ctx.body.reason || String(ctx.body.reason).trim().length < 5) throw apiError("VALIDATION_ERROR", 422, "Nhập lý do từ chối.", { reason: "Bắt buộc." });
  tx((database) => {
    const target = database.payments.find((p) => p.id === payment.id);
    target.status = "cancelled";
    target.note = `Từ chối: ${String(ctx.body.reason).slice(0, 400)}`;
    target.updatedAt = nowIso();
    const booking = database.bookings.find((b) => b.id === target.bookingId);
    if (booking) {
      notify(database, {
        userId: booking.userId, type: "payment.rejected",
        title: `Chứng từ thanh toán đơn ${booking.code} chưa hợp lệ`,
        content: target.note, email: booking.contactEmail, link: `/booking/${booking.code}/pay`,
      });
    }
    audit(ctx, "payment.reject_transfer", "payment", payment.merchantRef, { status: payment.status }, { status: "cancelled", reason: target.note });
  });
  return { data: { rejected: true } };
};

const paymentReconcile = (ctx) => {
  const payment = ctx.db.payments.find((p) => p.id === Number(ctx.params.id));
  if (!payment) throw apiError("NOT_FOUND", 404, "Không tìm thấy giao dịch.");
  if (!hasPermission(ctx.user, "payment:confirm")) throw apiError("FORBIDDEN", 403, "Không có quyền.");
  tx((database) => {
    const target = database.payments.find((p) => p.id === payment.id);
    target.reconciledAt = nowIso();
    target.reconciledBy = ctx.user.id;
    target.reconcileNote = ctx.body.note ? String(ctx.body.note).slice(0, 400) : null;
    audit(ctx, "payment.reconcile", "payment", payment.merchantRef, null, { reconciledAt: target.reconciledAt, note: target.reconcileNote });
  });
  return { data: { reconciled: true } };
};

/* ====================== REFUNDS ====================== */

const refundList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.refunds.map((r) => {
    const booking = db.bookings.find((b) => b.id === r.bookingId);
    return {
      ...r, bookingCode: booking?.code, customerName: booking?.contactName, customerEmail: booking?.contactEmail,
      requesterName: staffName(db, r.requestedBy) || "Khách hàng",
      approverName: r.approvals?.map((a) => staffName(db, a.by)).filter(Boolean).join(", ") || staffName(db, r.approvedBy),
      needsSecondApproval: r.amount >= cfgNumber(db, "refund.dual_approval_threshold", 20000000) && (r.approvals?.length || 0) < 2,
    };
  });
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.q) rows = rows.filter((r) => normalizeText(`${r.bookingCode} ${r.customerName}`).includes(normalizeText(query.q)));
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return pageRows(rows, query);
};

const refundCreate = (ctx) => {
  const { db, body } = ctx;
  if (!hasPermission(ctx.user, "refund:approve")) throw apiError("FORBIDDEN", 403, "Không có quyền tạo hoàn tiền.");
  const booking = getBooking(db, body.bookingCode);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  const amount = Math.round(Number(body.amount));
  const gross = grossPaidAmount(db, booking.id);
  const refunded = refundedAmount(db, booking.id);
  if (!Number.isFinite(amount) || amount <= 0) throw apiError("VALIDATION_ERROR", 422, "Số tiền hoàn không hợp lệ.", { amount: "Lớn hơn 0." });
  if (amount > gross - refunded) throw apiError("REFUND_EXCEEDS_PAID", 422, "Số tiền hoàn không được vượt số tiền đã thu.", { max: gross - refunded });
  const refund = tx((database) => {
    const id = (database._seq.refunds = (database._seq.refunds || 0) + 1);
    const row = {
      id, bookingId: booking.id,
      paymentId: database.payments.find((p) => p.bookingId === booking.id && p.status === "succeeded")?.id || null,
      amount, type: body.type === "credit" ? "credit" : "cash_back",
      reasonCode: String(body.reasonCode || "goodwill").slice(0, 40),
      policyApplied: body.policyApplied || "Thiện chí / xử lý khiếu nại",
      status: "requested", requestedBy: ctx.user.id, approvedBy: null, approvals: [],
      processedAt: null, providerRefundId: null, note: body.note || null,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    database.refunds.push(row);
    audit(ctx, "refund.create", "refund", row.id, null, { booking: booking.code, amount, type: row.type });
    notify(database, {
      userId: booking.userId, type: "refund.requested", title: `Đã tiếp nhận yêu cầu hoàn tiền đơn ${booking.code}`,
      content: `Số tiền ${amount.toLocaleString("vi-VN")} đ đang chờ duyệt.`, email: booking.contactEmail,
      link: `/account/bookings/${booking.code}`,
    });
    return row;
  });
  return { data: refund };
};

const refundApprove = (ctx) => {
  const refund = ctx.db.refunds.find((r) => r.id === Number(ctx.params.id));
  if (!refund) throw apiError("NOT_FOUND", 404, "Không tìm thấy khoản hoàn tiền.");
  if (!hasPermission(ctx.user, "refund:approve")) throw apiError("FORBIDDEN", 403, "Không có quyền duyệt hoàn tiền.");
  if (refund.requestedBy === ctx.user.id) throw apiError("FORBIDDEN", 403, "Người tạo yêu cầu không được tự duyệt.");
  if (!["requested", "approved"].includes(refund.status)) throw apiError("INVALID_STATE_TRANSITION", 409, "Khoản hoàn tiền không ở trạng thái chờ duyệt.");
  const threshold = cfgNumber(ctx.db, "refund.dual_approval_threshold", 20000000);
  const approvals = refund.approvals || [];
  if (approvals.some((a) => a.by === ctx.user.id)) throw apiError("FORBIDDEN", 403, "Bạn đã duyệt khoản này rồi.");
  const result = tx((database) => {
    const target = database.refunds.find((r) => r.id === refund.id);
    target.approvals = [...(target.approvals || []), { by: ctx.user.id, at: nowIso() }];
    target.approvedBy = target.approvedBy || ctx.user.id;
    const needsSecond = target.amount >= threshold && target.approvals.length < 2;
    target.status = needsSecond ? "requested" : "approved";
    target.updatedAt = nowIso();
    target.decisionNote = ctx.body.note || null;
    audit(ctx, "refund.approve", "refund", target.id, { status: refund.status }, { status: target.status, approvals: target.approvals.length });
    return { needsSecondApproval: needsSecond, refund: target };
  });
  return { data: result };
};

const refundReject = (ctx) => {
  const refund = ctx.db.refunds.find((r) => r.id === Number(ctx.params.id));
  if (!refund) throw apiError("NOT_FOUND", 404, "Không tìm thấy khoản hoàn tiền.");
  if (!hasPermission(ctx.user, "refund:approve")) throw apiError("FORBIDDEN", 403, "Không có quyền.");
  if (!["requested", "approved"].includes(refund.status)) throw apiError("INVALID_STATE_TRANSITION", 409, "Không thể từ chối ở trạng thái này.");
  if (!ctx.body.reason || String(ctx.body.reason).trim().length < 5) throw apiError("VALIDATION_ERROR", 422, "Nhập lý do từ chối.", { reason: "Bắt buộc." });
  tx((database) => {
    const target = database.refunds.find((r) => r.id === refund.id);
    target.status = "rejected";
    target.decisionNote = String(ctx.body.reason).slice(0, 500);
    target.updatedAt = nowIso();
    const booking = database.bookings.find((b) => b.id === target.bookingId);
    if (booking) {
      notify(database, {
        userId: booking.userId, type: "refund.rejected", title: `Yêu cầu hoàn tiền đơn ${booking.code} bị từ chối`,
        content: target.decisionNote, email: booking.contactEmail, link: `/account/bookings/${booking.code}`,
      });
    }
    audit(ctx, "refund.reject", "refund", target.id, { status: refund.status }, { status: "rejected", reason: target.decisionNote });
  });
  return { data: { rejected: true } };
};

const refundProcess = (ctx) => {
  const refund = ctx.db.refunds.find((r) => r.id === Number(ctx.params.id));
  if (!refund) throw apiError("NOT_FOUND", 404, "Không tìm thấy khoản hoàn tiền.");
  if (!hasPermission(ctx.user, "refund:approve")) throw apiError("FORBIDDEN", 403, "Không có quyền.");
  if (refund.status !== "approved") throw apiError("INVALID_STATE_TRANSITION", 409, "Khoản hoàn tiền chưa được duyệt đủ.");
  tx((database) => {
    const target = database.refunds.find((r) => r.id === refund.id);
    target.status = "processing";
    target.providerRefundId = ctx.body.providerRefundId || `RF-${Date.now()}`;
    target.updatedAt = nowIso();
    audit(ctx, "refund.process", "refund", target.id, { status: "approved" }, { status: "processing" });
  });
  return { data: { processing: true } };
};

const refundComplete = (ctx) => {
  const refund = ctx.db.refunds.find((r) => r.id === Number(ctx.params.id));
  if (!refund) throw apiError("NOT_FOUND", 404, "Không tìm thấy khoản hoàn tiền.");
  if (!hasPermission(ctx.user, "refund:approve")) throw apiError("FORBIDDEN", 403, "Không có quyền.");
  if (!["processing", "approved"].includes(refund.status)) throw apiError("INVALID_STATE_TRANSITION", 409, "Khoản hoàn tiền chưa sẵn sàng.");
  const result = tx((database) => {
    const target = database.refunds.find((r) => r.id === refund.id);
    const booking = database.bookings.find((b) => b.id === target.bookingId);
    const gross = grossPaidAmount(database, booking.id);
    if (target.amount > gross - refundedAmount(database, booking.id)) {
      throw apiError("REFUND_EXCEEDS_PAID", 422, "Số tiền hoàn vượt quá số đã thu.");
    }
    target.status = "completed";
    target.processedAt = nowIso();
    target.processedBy = ctx.user.id;
    target.updatedAt = nowIso();
    if (target.type === "credit") {
      const credit = {
        id: (database._seq.credits = (database._seq.credits || 0) + 1),
        userId: booking.userId, amount: target.amount, remaining: target.amount,
        expiresAt: new Date(Date.now() + cfgNumber(database, "credit.valid_months", 12) * 30 * 86400000).toISOString(),
        createdAt: nowIso(), note: `Bảo lưu từ đơn ${booking.code}`,
      };
      database.credits.push(credit);
      database.creditHistory.push({
        id: (database._seq.creditHistory = (database._seq.creditHistory || 0) + 1),
        creditId: credit.id, amount: target.amount, type: "credit_issued",
        note: `Bảo lưu từ đơn ${booking.code}`, createdAt: nowIso(),
      });
    }
    recalcBookingMoney(database, booking);
    notify(database, {
      userId: booking.userId, type: "refund.completed",
      title: `Hoàn tiền đơn ${booking.code} đã hoàn tất`,
      content: target.type === "credit"
        ? `Bạn đã được ghi có ${target.amount.toLocaleString("vi-VN")} đ vào tài khoản bảo lưu.`
        : `${target.amount.toLocaleString("vi-VN")} đ đã được hoàn về phương thức thanh toán ban đầu.`,
      email: booking.contactEmail, link: `/account/bookings/${booking.code}`, priority: "high",
    });
    audit(ctx, "refund.complete", "refund", target.id, { status: refund.status }, { status: "completed", amount: target.amount });
    return { refund: target, booking };
  });
  return { data: result };
};

/* ====================== INVOICES ====================== */

const invoiceList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.invoices.map((i) => {
    const booking = db.bookings.find((b) => b.id === i.bookingId);
    return {
      ...i, bookingCode: booking?.code, total: booking?.totalPrice,
      departureDate: getDeparture(db, booking?.departureId)?.departureDate,
    };
  });
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.q) rows = rows.filter((r) => normalizeText(`${r.bookingCode} ${r.companyName} ${r.taxCode}`).includes(normalizeText(query.q)));
  rows.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  return pageRows(rows, query);
};

const invoiceIssue = (ctx) => {
  const invoice = ctx.db.invoices.find((i) => i.id === Number(ctx.params.id));
  if (!invoice) throw apiError("NOT_FOUND", 404, "Không tìm thấy hóa đơn.");
  if (!hasPermission(ctx.user, "invoice:manage")) throw apiError("FORBIDDEN", 403, "Không có quyền xuất hóa đơn.");
  if (invoice.status !== "requested") throw apiError("INVALID_STATE_TRANSITION", 409, "Hóa đơn không ở trạng thái chờ xuất.");
  const invoiceNo = String(ctx.body.invoiceNo || "").trim();
  if (!invoiceNo) throw apiError("VALIDATION_ERROR", 422, "Nhập số hóa đơn.", { invoiceNo: "Bắt buộc." });
  if (ctx.db.invoices.some((i) => i.invoiceNo === invoiceNo && i.id !== invoice.id)) {
    throw apiError("VALIDATION_ERROR", 422, "Số hóa đơn đã tồn tại.", { invoiceNo: "Số hóa đơn đã dùng." });
  }
  tx((database) => {
    const target = database.invoices.find((i) => i.id === invoice.id);
    target.invoiceNo = invoiceNo;
    target.issuedAt = nowIso();
    target.status = "issued";
    target.note = ctx.body.note || null;
    const booking = database.bookings.find((b) => b.id === target.bookingId);
    if (booking) {
      notify(database, {
        userId: booking.userId, type: "invoice.issued", title: `Hóa đơn cho đơn ${booking.code} đã được xuất`,
        content: `Số hóa đơn ${invoiceNo}. Hóa đơn điện tử được gửi tới ${target.email}.`,
        email: target.email, link: `/account/bookings/${booking.code}`,
      });
    }
    audit(ctx, "invoice.issue", "invoice", target.id, null, { invoiceNo, booking: booking?.code });
  });
  return { data: { issued: true } };
};

const invoiceCancel = (ctx) => {
  const invoice = ctx.db.invoices.find((i) => i.id === Number(ctx.params.id));
  if (!invoice) throw apiError("NOT_FOUND", 404, "Không tìm thấy hóa đơn.");
  if (!hasPermission(ctx.user, "invoice:manage")) throw apiError("FORBIDDEN", 403, "Không có quyền.");
  if (invoice.status === "cancelled") throw apiError("INVALID_STATE_TRANSITION", 409, "Hóa đơn đã hủy.");
  if (!ctx.body.reason || String(ctx.body.reason).trim().length < 5) throw apiError("VALIDATION_ERROR", 422, "Nhập lý do hủy.", { reason: "Bắt buộc." });
  tx((database) => {
    const target = database.invoices.find((i) => i.id === invoice.id);
    target.status = "cancelled";
    target.cancelReason = String(ctx.body.reason).slice(0, 400);
    target.cancelledAt = nowIso();
    audit(ctx, "invoice.cancel", "invoice", target.id, { status: invoice.status }, { status: "cancelled", reason: target.cancelReason });
  });
  return { data: { cancelled: true } };
};

/* ====================== CUSTOMERS ====================== */

const customerList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.users.filter((u) => u.roles.includes("customer")).map((u) => {
    const bookings = db.bookings.filter((b) => b.userId === u.id);
    const spend = bookings.filter((b) => ["confirmed", "completed"].includes(b.status))
      .reduce((sum, b) => sum + grossPaidAmount(db, b.id), 0);
    return {
      id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, status: u.status,
      emailVerified: Boolean(u.emailVerifiedAt), bookingCount: bookings.length,
      totalSpend: spend, createdAt: u.createdAt,
      lastBookingAt: bookings.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt || null,
      marketingConsent: u.marketingConsent,
    };
  });
  if (query.q) rows = rows.filter((r) => normalizeText(`${r.fullName} ${r.email} ${r.phone}`).includes(normalizeText(query.q)));
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  rows.sort((a, b) => (b.lastBookingAt || b.createdAt).localeCompare(a.lastBookingAt || a.createdAt));
  return pageRows(rows, query);
};

const customerDetail = (ctx) => {
  const { db, params } = ctx;
  const user = db.users.find((u) => u.id === Number(params.id) && u.roles.includes("customer"));
  if (!user) throw apiError("NOT_FOUND", 404, "Không tìm thấy khách hàng.");
  const bookings = db.bookings.filter((b) => b.userId === user.id);
  const credits = db.credits.filter((c) => c.userId === user.id && c.remaining > 0);
  return {
    data: {
      id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, status: user.status,
      emailVerified: Boolean(user.emailVerifiedAt), createdAt: user.createdAt, marketingConsent: user.marketingConsent,
      bookings: bookings.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((b) => adminBookingRow(db, b)),
      tickets: db.tickets.filter((t) => t.userId === user.id),
      credits,
      totalSpend: bookings.filter((b) => ["confirmed", "completed"].includes(b.status)).reduce((sum, b) => sum + grossPaidAmount(db, b.id), 0),
      note: user.adminNote || null,
    },
  };
};

const customerLock = (ctx) => {
  requireRole(ctx, ["super_admin"]);
  const user = ctx.db.users.find((u) => u.id === Number(ctx.params.id) && u.roles.includes("customer"));
  if (!user) throw apiError("NOT_FOUND", 404, "Không tìm thấy khách hàng.");
  if (!hasPermission(ctx.user, "customer:update")) throw apiError("FORBIDDEN", 403, "Không có quyền.");
  const reason = String(ctx.body.reason || "").trim();
  if (reason.length < 5) throw apiError("VALIDATION_ERROR", 422, "Nhập lý do khóa/mở khóa.", { reason: "Bắt buộc." });
  const status = ctx.body.status === "active" ? "active" : "locked";
  tx((database) => {
    const target = database.users.find((u) => u.id === user.id);
    target.status = status;
    target.lockReason = reason;
    if (status === "locked") {
      for (const session of database.sessions) if (session.userId === user.id && !session.revokedAt) session.revokedAt = nowIso();
    }
    database.outbox.push({
      id: (database._seq.outbox = (database._seq.outbox || 0) + 1),
      to: user.email, subject: status === "locked" ? "Tài khoản VietTrails đã bị tạm khóa" : "Tài khoản VietTrails đã được mở khóa",
      body: reason, type: "account_status", status: "sent", attempts: 1, createdAt: nowIso(), sentAt: nowIso(),
    });
    audit(ctx, "customer.lock", "user", user.id, { status: user.status }, { status, reason });
  });
  return { data: { status } };
};

const customerNote = (ctx) => {
  const user = ctx.db.users.find((u) => u.id === Number(ctx.params.id) && u.roles.includes("customer"));
  if (!user) throw apiError("NOT_FOUND", 404, "Không tìm thấy khách hàng.");
  tx((database) => {
    const target = database.users.find((u) => u.id === user.id);
    target.adminNote = String(ctx.body.note || "").slice(0, 1000);
    audit(ctx, "customer.note", "user", user.id, null, { note: target.adminNote });
  });
  return { data: { saved: true } };
};

/* ====================== COUPONS ====================== */

const couponList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.coupons.map((c) => ({
    ...c,
    usagePercent: c.usageLimit ? Math.round((c.usedCount / c.usageLimit) * 100) : null,
    revenue: db.couponUsages.filter((u) => u.couponId === c.id && !u.voidedAt)
      .reduce((sum, u) => sum + (db.bookings.find((b) => b.id === u.bookingId)?.totalPrice || 0), 0),
    totalDiscount: db.couponUsages.filter((u) => u.couponId === c.id && !u.voidedAt)
      .reduce((sum, u) => sum + u.discountAmount, 0),
  }));
  if (query.q) rows = rows.filter((r) => normalizeText(`${r.code} ${r.name}`).includes(normalizeText(query.q)));
  if (query.status === "active") rows = rows.filter((r) => r.active);
  if (query.status === "inactive") rows = rows.filter((r) => !r.active);
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return pageRows(rows, query);
};

function validateCouponInput(db, body, existing = null) {
  const fields = {};
  const code = normalizeCoupon(body.code ?? existing?.code);
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) fields.code = "Mã 3–32 ký tự chữ, số, gạch dưới hoặc gạch ngang.";
  const name = String(body.name ?? existing?.name ?? "").trim();
  if (name.length < 2) fields.name = "Nhập tên chương trình.";
  const type = ["percent", "fixed"].includes(body.type) ? body.type : existing?.type || "percent";
  const value = Number(body.value ?? existing?.value);
  if (!Number.isFinite(value) || value <= 0) fields.value = "Giá trị giảm phải lớn hơn 0.";
  if (type === "percent" && value > 100) fields.value = "Phần trăm giảm tối đa 100.";
  if (body.validFrom && body.validTo && body.validTo < body.validFrom) fields.validTo = "Ngày kết thúc phải sau ngày bắt đầu.";
  if (Object.keys(fields).length) throw apiError("VALIDATION_ERROR", 422, "Vui lòng kiểm tra mã giảm giá.", fields);
  return { code, name, type, value };
}

const couponCreate = (ctx) => {
  const { db, body } = ctx;
  const validated = validateCouponInput(db, body);
  if (db.coupons.some((c) => c.code === validated.code)) throw apiError("VALIDATION_ERROR", 422, "Mã giảm giá đã tồn tại.", { code: "Trùng mã." });
  const row = tx((database) => {
    const item = {
      id: (database._seq.coupons = (database._seq.coupons || 0) + 1),
      code: validated.code, name: validated.name, type: validated.type, value: validated.value,
      maxDiscount: body.maxDiscount ? Number(body.maxDiscount) : null,
      minOrder: Number(body.minOrder || 0),
      validFrom: body.validFrom || todayVN(), validTo: body.validTo || addDays(todayVN(), 90),
      usageLimit: body.usageLimit ? Number(body.usageLimit) : null,
      perUserLimit: Number(body.perUserLimit || 1),
      appliesTo: body.appliesTo?.type === "tour" ? { type: "tour", tourIds: (body.appliesTo.tourIds || []).map(Number) }
        : body.appliesTo?.type === "category" ? { type: "category", categoryIds: (body.appliesTo.categoryIds || []).map(Number) }
          : { type: "all" },
      active: body.active !== false, newCustomersOnly: Boolean(body.newCustomersOnly),
      usedCount: 0, createdAt: nowIso(), updatedAt: nowIso(),
    };
    database.coupons.push(item);
    audit(ctx, "coupon.create", "coupon", item.id, null, { code: item.code, value: item.value, type: item.type });
    return item;
  });
  return { data: row };
};

const couponUpdate = (ctx) => {
  const coupon = ctx.db.coupons.find((c) => c.id === Number(ctx.params.id));
  if (!coupon) throw apiError("NOT_FOUND", 404, "Không tìm thấy mã giảm giá.");
  const validated = validateCouponInput(ctx.db, ctx.body, coupon);
  if (ctx.db.coupons.some((c) => c.code === validated.code && c.id !== coupon.id)) {
    throw apiError("VALIDATION_ERROR", 422, "Mã giảm giá đã tồn tại.", { code: "Trùng mã." });
  }
  const row = tx((database) => {
    const target = database.coupons.find((c) => c.id === coupon.id);
    const before = structuredClone(target);
    target.code = validated.code;
    target.name = validated.name;
    target.type = validated.type;
    target.value = validated.value;
    if (ctx.body.maxDiscount !== undefined) target.maxDiscount = ctx.body.maxDiscount ? Number(ctx.body.maxDiscount) : null;
    if (ctx.body.minOrder !== undefined) target.minOrder = Number(ctx.body.minOrder || 0);
    if (ctx.body.validFrom) target.validFrom = ctx.body.validFrom;
    if (ctx.body.validTo) target.validTo = ctx.body.validTo;
    if (ctx.body.usageLimit !== undefined) target.usageLimit = ctx.body.usageLimit ? Number(ctx.body.usageLimit) : null;
    if (ctx.body.perUserLimit !== undefined) target.perUserLimit = Number(ctx.body.perUserLimit || 1);
    if (ctx.body.appliesTo) {
      target.appliesTo = ctx.body.appliesTo.type === "tour" ? { type: "tour", tourIds: (ctx.body.appliesTo.tourIds || []).map(Number) }
        : ctx.body.appliesTo.type === "category" ? { type: "category", categoryIds: (ctx.body.appliesTo.categoryIds || []).map(Number) }
          : { type: "all" };
    }
    if (ctx.body.active !== undefined) target.active = Boolean(ctx.body.active);
    if (ctx.body.newCustomersOnly !== undefined) target.newCustomersOnly = Boolean(ctx.body.newCustomersOnly);
    target.updatedAt = nowIso();
    audit(ctx, "coupon.update", "coupon", target.id, { code: before.code, value: before.value, active: before.active }, { code: target.code, value: target.value, active: target.active });
    return target;
  });
  return { data: row };
};

const couponDelete = (ctx) => {
  const coupon = ctx.db.coupons.find((c) => c.id === Number(ctx.params.id));
  if (!coupon) throw apiError("NOT_FOUND", 404, "Không tìm thấy mã giảm giá.");
  tx((database) => {
    const target = database.coupons.find((c) => c.id === coupon.id);
    target.active = false;
    target.updatedAt = nowIso();
    audit(ctx, "coupon.deactivate", "coupon", target.id, { active: true }, { active: false });
  });
  return { data: { deactivated: true } };
};

/* ====================== REVIEWS ====================== */

const reviewList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.reviews.map((r) => ({
    ...r,
    userName: db.users.find((u) => u.id === r.userId)?.fullName,
    userEmail: db.users.find((u) => u.id === r.userId)?.email,
    tourName: db.tours.find((t) => t.id === r.tourId)?.name,
    tourSlug: db.tours.find((t) => t.id === r.tourId)?.slug,
    bookingCode: db.bookings.find((b) => b.id === r.bookingId)?.code,
  }));
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.tourId) rows = rows.filter((r) => r.tourId === Number(query.tourId));
  if (query.q) rows = rows.filter((r) => normalizeText(`${r.userName} ${r.comment} ${r.tourName}`).includes(normalizeText(query.q)));
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return pageRows(rows, query);
};

const reviewModerate = (ctx) => {
  const review = ctx.db.reviews.find((r) => r.id === Number(ctx.params.id));
  if (!review) throw apiError("NOT_FOUND", 404, "Không tìm thấy đánh giá.");
  if (!hasPermission(ctx.user, "review:moderate")) throw apiError("FORBIDDEN", 403, "Không có quyền duyệt đánh giá.");
  const status = ctx.params.action === "approve" ? "approved" : ctx.params.action === "reject" ? "rejected" : "hidden";
  if (ctx.params.action === "reject" && (!ctx.body.reason || String(ctx.body.reason).trim().length < 10)) {
    throw apiError("VALIDATION_ERROR", 422, "Nhập lý do từ chối đánh giá.", { reason: "Tối thiểu 10 ký tự." });
  }
  tx((database) => {
    const target = database.reviews.find((r) => r.id === review.id);
    target.status = status;
    target.approvedAt = status === "approved" ? nowIso() : target.approvedAt;
    target.approvedBy = ctx.user.id;
    target.moderationNote = ctx.body.reason || null;
    recomputeTourRating(database, target.tourId);
    audit(ctx, `review.${status}`, "review", target.id, { status: review.status }, { status });
  });
  return { data: { status } };
};

const reviewReply = (ctx) => {
  const review = ctx.db.reviews.find((r) => r.id === Number(ctx.params.id));
  if (!review) throw apiError("NOT_FOUND", 404, "Không tìm thấy đánh giá.");
  if (!hasPermission(ctx.user, "review:moderate")) throw apiError("FORBIDDEN", 403, "Không có quyền.");
  const reply = String(ctx.body.reply || "").trim();
  if (reply.length < 5 || reply.length > 1000) throw apiError("VALIDATION_ERROR", 422, "Phản hồi từ 5 đến 1000 ký tự.", { reply: "Chưa hợp lệ." });
  tx((database) => {
    const target = database.reviews.find((r) => r.id === review.id);
    target.reply = reply;
    target.replyAt = nowIso();
    target.replyBy = ctx.user.id;
    audit(ctx, "review.reply", "review", target.id, { reply: review.reply }, { reply });
  });
  return { data: { replied: true } };
};

/* ====================== TICKETS ====================== */

const ticketList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.tickets.map((t) => ({
    ...t,
    customerName: t.userId ? db.users.find((u) => u.id === t.userId)?.fullName : t.fullName,
    customerEmail: t.userId ? db.users.find((u) => u.id === t.userId)?.email : t.email,
    assignedName: staffName(db, t.assignedTo),
    slaOverdue: !["resolved", "closed"].includes(t.status) && new Date(t.slaDueAt).getTime() < Date.now(),
  }));
  if (ctx.user.roles.includes("sales")) {
    rows = rows.filter((r) => ["support", "complaint", "custom_tour"].includes(r.type));
  }
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  if (query.type) rows = rows.filter((r) => r.type === query.type);
  if (query.sla === "overdue") rows = rows.filter((r) => r.slaOverdue);
  if (query.assignedTo) rows = rows.filter((r) => r.assignedTo === Number(query.assignedTo));
  if (query.q) rows = rows.filter((r) => normalizeText(`${r.code} ${r.subject} ${r.customerName} ${r.customerEmail}`).includes(normalizeText(query.q)));
  rows.sort((a, b) => (b.slaOverdue === true) - (a.slaOverdue === true) || b.createdAt.localeCompare(a.createdAt));
  return pageRows(rows, query);
};

const ticketDetail = (ctx) => {
  const ticket = ctx.db.tickets.find((t) => t.id === Number(ctx.params.id));
  if (!ticket) throw apiError("NOT_FOUND", 404, "Không tìm thấy ticket.");
  const user = ticket.userId ? ctx.db.users.find((u) => u.id === ticket.userId) : null;
  return {
    data: {
      ...ticket,
      customer: user ? { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone } : {
        fullName: ticket.fullName, email: ticket.email, phone: ticket.phone,
      },
      assignedName: staffName(ctx.db, ticket.assignedTo),
      booking: ticket.bookingId ? (() => {
        const b = ctx.db.bookings.find((x) => x.id === ticket.bookingId);
        return b ? adminBookingRow(ctx.db, b) : null;
      })() : null,
      messages: ctx.db.ticketMessages.filter((m) => m.ticketId === ticket.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      slaOverdue: !["resolved", "closed"].includes(ticket.status) && new Date(ticket.slaDueAt).getTime() < Date.now(),
    },
  };
};

const ticketReply = (ctx) => {
  const ticket = ctx.db.tickets.find((t) => t.id === Number(ctx.params.id));
  if (!ticket) throw apiError("NOT_FOUND", 404, "Không tìm thấy ticket.");
  if (!hasPermission(ctx.user, "ticket:handle")) throw apiError("FORBIDDEN", 403, "Không có quyền.");
  const message = String(ctx.body.message || "").trim();
  if (message.length < 2) throw apiError("VALIDATION_ERROR", 422, "Nhập nội dung phản hồi.", { message: "Bắt buộc." });
  const result = tx((database) => {
    const target = database.tickets.find((t) => t.id === ticket.id);
    const msg = {
      id: (database._seq.ticketMessages = (database._seq.ticketMessages || 0) + 1),
      ticketId: target.id, userId: ctx.user.id, actorType: "staff",
      message: message.slice(0, 3000), createdAt: nowIso(),
    };
    database.ticketMessages.push(msg);
    target.status = ctx.body.status || "waiting_customer";
    target.updatedAt = nowIso();
    target.firstResponseAt = target.firstResponseAt || nowIso();
    if (target.userId) {
      notify(database, {
        userId: target.userId, type: "ticket.reply", title: `Phản hồi cho yêu cầu ${target.code}`,
        content: message.slice(0, 200), email: target.customerEmail || database.users.find((u) => u.id === target.userId)?.email,
        link: `/account/bookings`, priority: "high",
      });
    }
    audit(ctx, "ticket.reply", "ticket", target.id, { status: ticket.status }, { status: target.status });
    return { message: msg, ticket: target };
  });
  return { data: result };
};

const ticketUpdate = (ctx) => {
  const ticket = ctx.db.tickets.find((t) => t.id === Number(ctx.params.id));
  if (!ticket) throw apiError("NOT_FOUND", 404, "Không tìm thấy ticket.");
  if (!hasPermission(ctx.user, "ticket:handle")) throw apiError("FORBIDDEN", 403, "Không có quyền.");
  const statuses = ["open", "in_progress", "waiting_customer", "resolved", "closed"];
  tx((database) => {
    const target = database.tickets.find((t) => t.id === ticket.id);
    const before = { status: target.status, priority: target.priority, assignedTo: target.assignedTo };
    if (ctx.body.status && statuses.includes(ctx.body.status)) target.status = ctx.body.status;
    if (["low", "normal", "high", "urgent"].includes(ctx.body.priority)) target.priority = ctx.body.priority;
    if (ctx.body.assignedTo !== undefined) target.assignedTo = ctx.body.assignedTo ? Number(ctx.body.assignedTo) : null;
    target.updatedAt = nowIso();
    audit(ctx, "ticket.update", "ticket", target.id, before, { status: target.status, priority: target.priority, assignedTo: target.assignedTo });
  });
  return { data: { updated: true } };
};

/* ====================== RESOURCES ====================== */

const resourceTypes = {
  guides: { perm: "operations:manage", fields: ["fullName", "phone", "languages", "region", "status", "note"] },
  vehicles: { perm: "operations:manage", fields: ["name", "plate", "seats", "driverName", "driverPhone", "status", "note"] },
  suppliers: { perm: "operations:manage", fields: ["name", "category", "contactName", "phone", "email", "address", "note", "status"] },
};

const resourceList = (ctx) => {
  const type = ctx.params.type;
  const config = resourceTypes[type];
  if (!config) throw apiError("NOT_FOUND", 404, "Loại danh mục không tồn tại.");
  return { data: ctx.db[type].slice().sort((a, b) => a.id - b.id) };
};

const resourceCreate = (ctx) => {
  const type = ctx.params.type;
  const config = resourceTypes[type];
  if (!config) throw apiError("NOT_FOUND", 404, "Loại danh mục không tồn tại.");
  const row = tx((database) => {
    const id = (database._seq[type] = (database._seq[type] || 0) + 1);
    const item = { id, ...Object.fromEntries(config.fields.map((f) => [f, ctx.body[f] ?? null])), createdAt: nowIso() };
    if (type === "guides" && !item.fullName) throw apiError("VALIDATION_ERROR", 422, "Nhập tên hướng dẫn viên.", { fullName: "Bắt buộc." });
    if (type === "vehicles" && (!item.name || !item.seats)) throw apiError("VALIDATION_ERROR", 422, "Nhập tên xe và số chỗ.", { name: "Bắt buộc." });
    if (type === "suppliers" && !item.name) throw apiError("VALIDATION_ERROR", 422, "Nhập tên nhà cung cấp.", { name: "Bắt buộc." });
    database[type].push(item);
    audit(ctx, `${type}.create`, type, id, null, item);
    return item;
  });
  return { data: row };
};

const resourceUpdate = (ctx) => {
  const type = ctx.params.type;
  const config = resourceTypes[type];
  if (!config) throw apiError("NOT_FOUND", 404, "Loại danh mục không tồn tại.");
  const item = ctx.db[type].find((x) => x.id === Number(ctx.params.id));
  if (!item) throw apiError("NOT_FOUND", 404, "Không tìm thấy bản ghi.");
  tx((database) => {
    const target = database[type].find((x) => x.id === item.id);
    for (const field of config.fields) if (ctx.body[field] !== undefined) target[field] = ctx.body[field];
    audit(ctx, `${type}.update`, type, item.id, null, { fields: Object.keys(ctx.body) });
  });
  return { data: { updated: true } };
};

const resourceDelete = (ctx) => {
  const type = ctx.params.type;
  if (!resourceTypes[type]) throw apiError("NOT_FOUND", 404, "Loại danh mục không tồn tại.");
  const item = ctx.db[type].find((x) => x.id === Number(ctx.params.id));
  if (!item) throw apiError("NOT_FOUND", 404, "Không tìm thấy bản ghi.");
  if (type === "guides" && ctx.db.assignments.some((a) => a.guideId === item.id)) throw apiError("HAS_DEPENDENCIES", 409, "Hướng dẫn viên đã được phân công chuyến.");
  if (type === "vehicles" && ctx.db.assignments.some((a) => a.vehicleId === item.id)) throw apiError("HAS_DEPENDENCIES", 409, "Xe đã được phân công chuyến.");
  if (type === "suppliers" && ctx.db.costs.some((c) => c.supplierId === item.id)) throw apiError("HAS_DEPENDENCIES", 409, "Nhà cung cấp đã có chi phí chuyến.");
  tx((database) => {
    database[type] = database[type].filter((x) => x.id !== item.id);
    audit(ctx, `${type}.delete`, type, item.id, item, null);
  });
  return { data: { deleted: true } };
};

/* ====================== CATALOG ====================== */

const catalogList = (ctx) => {
  const type = ctx.params.type === "destinations" ? "destinations" : "categories";
  const rows = ctx.db[type].map((item) => ({
    ...item,
    tourCount: ctx.db.tours.filter((t) => (type === "destinations" ? t.destinationId : t.categoryId) === item.id).length,
  })).sort((a, b) => a.name.localeCompare(b.name));
  return { data: rows };
};

const catalogCreate = (ctx) => {
  const type = ctx.params.type === "destinations" ? "destinations" : "categories";
  const name = String(ctx.body.name || "").trim();
  if (name.length < 2) throw apiError("VALIDATION_ERROR", 422, "Tên tối thiểu 2 ký tự.", { name: "Bắt buộc." });
  if (ctx.db[type].some((x) => normalizeText(x.name) === normalizeText(name))) {
    throw apiError("VALIDATION_ERROR", 422, "Tên đã tồn tại (không phân biệt hoa thường).", { name: "Trùng tên." });
  }
  const row = tx((database) => {
    const id = (database._seq[type] = (database._seq[type] || 0) + 1);
    const item = {
      id, name, slug: uniqueSlug(database, type, slugify(ctx.body.slug || name)),
      description: ctx.body.description || "", active: ctx.body.active !== false, createdAt: nowIso(),
      ...(type === "destinations" ? {
        region: ["north", "central", "south"].includes(ctx.body.region) ? ctx.body.region : "north",
        province: ctx.body.province || "", image: ctx.body.image || null,
        lat: ctx.body.lat ? Number(ctx.body.lat) : null, lng: ctx.body.lng ? Number(ctx.body.lng) : null,
      } : {}),
    };
    database[type].push(item);
    audit(ctx, `${type}.create`, type, id, null, { name, slug: item.slug });
    return item;
  });
  return { data: row };
};

const catalogUpdate = (ctx) => {
  const type = ctx.params.type === "destinations" ? "destinations" : "categories";
  const item = ctx.db[type].find((x) => x.id === Number(ctx.params.id));
  if (!item) throw apiError("NOT_FOUND", 404, "Không tìm thấy bản ghi.");
  const name = String(ctx.body.name ?? item.name).trim();
  if (name.length < 2) throw apiError("VALIDATION_ERROR", 422, "Tên tối thiểu 2 ký tự.", { name: "Bắt buộc." });
  if (ctx.db[type].some((x) => x.id !== item.id && normalizeText(x.name) === normalizeText(name))) {
    throw apiError("VALIDATION_ERROR", 422, "Tên đã tồn tại.", { name: "Trùng tên." });
  }
  tx((database) => {
    const target = database[type].find((x) => x.id === item.id);
    const before = { name: target.name, active: target.active };
    target.name = name;
    if (ctx.body.description !== undefined) target.description = ctx.body.description;
    if (ctx.body.active !== undefined) target.active = Boolean(ctx.body.active);
    if (type === "destinations") {
      if (["north", "central", "south"].includes(ctx.body.region)) target.region = ctx.body.region;
      for (const field of ["province", "image", "lat", "lng"]) if (ctx.body[field] !== undefined) target[field] = ctx.body[field];
    }
    if (ctx.body.slug) target.slug = uniqueSlug(database, type, slugify(ctx.body.slug), target.id);
    audit(ctx, `${type}.update`, type, target.id, before, { name: target.name, active: target.active });
  });
  return { data: { updated: true } };
};

const catalogDelete = (ctx) => {
  const type = ctx.params.type === "destinations" ? "destinations" : "categories";
  const item = ctx.db[type].find((x) => x.id === Number(ctx.params.id));
  if (!item) throw apiError("NOT_FOUND", 404, "Không tìm thấy bản ghi.");
  const refs = ctx.db.tours.filter((t) => (type === "destinations" ? t.destinationId : t.categoryId) === item.id);
  if (refs.length) throw apiError("HAS_DEPENDENCIES", 409, `Còn ${refs.length} tour tham chiếu. Bạn có thể tạm ẩn thay vì xóa.`);
  tx((database) => {
    database[type] = database[type].filter((x) => x.id !== item.id);
    audit(ctx, `${type}.delete`, type, item.id, item, null);
  });
  return { data: { deleted: true } };
};

/* ====================== CONTENT ====================== */

const contentList = (ctx) => ({
  data: {
    pages: ctx.db.contentPages.slice(),
    banners: ctx.db.banners.slice().sort((a, b) => (a.position || 0) - (b.position || 0)),
  },
});

const contentPageUpsert = (ctx) => {
  const id = ctx.params.id ? Number(ctx.params.id) : null;
  const slug = slugify(ctx.body.slug || ctx.body.title || "");
  if (!slug) throw apiError("VALIDATION_ERROR", 422, "Nhập slug.", { slug: "Bắt buộc." });
  if (!ctx.body.title || String(ctx.body.title).trim().length < 3) throw apiError("VALIDATION_ERROR", 422, "Nhập tiêu đề.", { title: "Bắt buộc." });
  const row = tx((database) => {
    let item = id ? database.contentPages.find((p) => p.id === id) : null;
    if (item) {
      item.slug = slug;
      item.title = String(ctx.body.title).trim();
      item.body = String(ctx.body.body || "");
      item.updatedAt = nowIso();
    } else {
      if (database.contentPages.some((p) => p.slug === slug)) throw apiError("VALIDATION_ERROR", 422, "Slug đã tồn tại.", { slug: "Trùng slug." });
      item = {
        id: (database._seq.contentPages = (database._seq.contentPages || 0) + 1),
        slug, title: String(ctx.body.title).trim(), body: String(ctx.body.body || ""),
        updatedAt: nowIso(),
      };
      database.contentPages.push(item);
    }
    audit(ctx, "content.page.upsert", "contentPage", item.id, null, { slug: item.slug, title: item.title });
    return item;
  });
  return { data: row };
};

const contentPageDelete = (ctx) => {
  const item = ctx.db.contentPages.find((p) => p.id === Number(ctx.params.id));
  if (!item) throw apiError("NOT_FOUND", 404, "Không tìm thấy trang.");
  tx((database) => {
    database.contentPages = database.contentPages.filter((p) => p.id !== item.id);
    audit(ctx, "content.page.delete", "contentPage", item.id, item, null);
  });
  return { data: { deleted: true } };
};

const bannerUpsert = (ctx) => {
  const id = ctx.params.id ? Number(ctx.params.id) : null;
  const title = String(ctx.body.title || "").trim();
  if (title.length < 3) throw apiError("VALIDATION_ERROR", 422, "Nhập tiêu đề banner.", { title: "Bắt buộc." });
  const row = tx((database) => {
    let item = id ? database.banners.find((b) => b.id === id) : null;
    const data = {
      title, subtitle: ctx.body.subtitle || "", image: ctx.body.image || null,
      ctaLabel: ctx.body.ctaLabel || "Khám phá", ctaHref: ctx.body.ctaHref || "/tours",
      active: ctx.body.active !== false, position: Number(ctx.body.position || 1),
    };
    if (item) Object.assign(item, data);
    else {
      item = { id: (database._seq.banners = (database._seq.banners || 0) + 1), ...data };
      database.banners.push(item);
    }
    audit(ctx, "content.banner.upsert", "banner", item.id, null, data);
    return item;
  });
  return { data: row };
};

const bannerDelete = (ctx) => {
  const item = ctx.db.banners.find((b) => b.id === Number(ctx.params.id));
  if (!item) throw apiError("NOT_FOUND", 404, "Không tìm thấy banner.");
  tx((database) => {
    database.banners = database.banners.filter((b) => b.id !== item.id);
    audit(ctx, "content.banner.delete", "banner", item.id, item, null);
  });
  return { data: { deleted: true } };
};

/* ====================== USERS & ROLES ====================== */

const staffDirectory = (ctx) => ({
  data: ctx.db.users
    .filter((user) => user.roles.some((role) => role !== "customer") && user.status === "active")
    .map((user) => ({
      id: user.id, fullName: user.fullName, email: user.email, roles: user.roles,
      roleLabels: user.roles.map((role) => ROLE_LABELS[role] || role),
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName)),
});

const userList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.users.filter((u) => !u.roles.every((r) => r === "customer") || u.roles.length > 1 || query.includeCustomers === "1")
    .map((u) => ({
      id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, roles: u.roles,
      roleLabels: u.roles.map((r) => ROLE_LABELS[r] || r), status: u.status,
      emailVerified: Boolean(u.emailVerifiedAt), mfaEnabled: Boolean(u.mfaEnabled),
      createdAt: u.createdAt, lastLoginAt: db.sessions.filter((s) => s.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt || null,
    }));
  if (query.q) rows = rows.filter((r) => normalizeText(`${r.fullName} ${r.email}`).includes(normalizeText(query.q)));
  if (query.role) rows = rows.filter((r) => r.roles.includes(query.role));
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return pageRows(rows, query);
};

const userInvite = (ctx) => {
  const { db, body } = ctx;
  const email = String(body.email || "").trim().toLowerCase();
  const fullName = String(body.fullName || "").trim();
  const roles = Array.isArray(body.roles) ? body.roles.filter((r) => ROLES.includes(r) && r !== "customer") : [];
  if (!validateEmail(email)) throw apiError("VALIDATION_ERROR", 422, "Email chưa đúng.", { email: "Không hợp lệ." });
  if (fullName.length < 2) throw apiError("VALIDATION_ERROR", 422, "Nhập họ tên.", { fullName: "Bắt buộc." });
  if (!roles.length) throw apiError("VALIDATION_ERROR", 422, "Chọn ít nhất một vai trò.", { roles: "Bắt buộc." });
  if (db.users.some((u) => u.email === email)) throw apiError("EMAIL_TAKEN", 409, "Email đã được sử dụng.");
  const result = tx((database) => {
    const id = (database._seq.users = (database._seq.users || 0) + 1);
    const user = {
      id, fullName, email, phone: null, passwordHash: hashPassword(randomToken(16)), roles,
      emailVerifiedAt: null, status: "active", marketingConsent: false,
      failedLoginCount: 0, lockedUntil: null, mfaEnabled: false, createdAt: nowIso(),
      termsVersion: cfg(database, "terms.version"),
    };
    database.users.push(user);
    const token = randomToken(24);
    database.authTokens.push({
      id: (database._seq.authTokens = (database._seq.authTokens || 0) + 1),
      userId: user.id, purpose: "invite", tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), usedAt: null, createdAt: nowIso(),
    });
    database.outbox.push({
      id: (database._seq.outbox = (database._seq.outbox || 0) + 1),
      to: email, subject: "Lời mời tham gia VietTrails",
      body: `Bạn được mời vào hệ thống với vai trò ${roles.map((r) => ROLE_LABELS[r]).join(", ")}. Đặt mật khẩu để kích hoạt.`,
      link: `/reset-password?token=${token}&invite=1`, type: "invite", status: "sent",
      attempts: 1, createdAt: nowIso(), sentAt: nowIso(),
    });
    audit(ctx, "user.invite", "user", user.id, null, { email, roles });
    return user;
  });
  return { data: { id: result.id, email: result.email, roles: result.roles, invited: true } };
};

const userUpdateRoles = (ctx) => {
  requireRole(ctx, ["super_admin"]);
  const user = ctx.db.users.find((u) => u.id === Number(ctx.params.id));
  if (!user) throw apiError("NOT_FOUND", 404, "Không tìm thấy người dùng.");
  const roles = Array.isArray(ctx.body.roles) ? [...new Set(ctx.body.roles.filter((r) => ROLES.includes(r)))] : [];
  if (!roles.length) throw apiError("VALIDATION_ERROR", 422, "Người dùng cần ít nhất một vai trò.", { roles: "Bắt buộc." });
  if (user.roles.includes("super_admin") && !roles.includes("super_admin")) {
    const superAdmins = ctx.db.users.filter((u) => u.roles.includes("super_admin"));
    if (superAdmins.length <= 1) throw apiError("VALIDATION_ERROR", 422, "Không thể thu hồi vai trò super_admin cuối cùng.", { roles: "Cần ít nhất một super_admin." });
  }
  tx((database) => {
    const target = database.users.find((u) => u.id === user.id);
    target.roles = roles;
    for (const session of database.sessions) if (session.userId === user.id && !session.revokedAt) session.revokedAt = nowIso();
    audit(ctx, "user.update_roles", "user", user.id, { roles: user.roles }, { roles });
  });
  return { data: { id: user.id, roles } };
};

const userLock = (ctx) => {
  requireRole(ctx, ["super_admin"]);
  const user = ctx.db.users.find((u) => u.id === Number(ctx.params.id));
  if (!user) throw apiError("NOT_FOUND", 404, "Không tìm thấy người dùng.");
  if (user.id === ctx.user.id) throw apiError("FORBIDDEN", 403, "Bạn không thể tự khóa tài khoản của mình.");
  const status = ctx.body.status === "active" ? "active" : "locked";
  const reason = String(ctx.body.reason || "").trim();
  if (reason.length < 5) throw apiError("VALIDATION_ERROR", 422, "Nhập lý do.", { reason: "Bắt buộc." });
  tx((database) => {
    const target = database.users.find((u) => u.id === user.id);
    target.status = status;
    target.lockReason = reason;
    if (status === "locked") for (const s of database.sessions) if (s.userId === user.id && !s.revokedAt) s.revokedAt = nowIso();
    audit(ctx, "user.lock", "user", user.id, { status: user.status }, { status, reason });
  });
  return { data: { status } };
};

const roleMatrix = () => ({
  data: {
    roles: ROLES.map((role) => ({
      code: role, label: ROLE_LABELS[role], permissions: permissionsFor([role]),
    })),
    permissions: [...new Set(Object.values(ROLE_PERMISSIONS).flat())].sort(),
    labels: ROLE_LABELS,
  },
});

/* ====================== SETTINGS ====================== */

const settingsGet = (ctx) => {
  const rows = Object.values(ctx.db.settings).map((s) => ({ ...s }));
  const groups = [...new Set(rows.map((s) => s.group))];
  return { data: { settings: rows, groups, policies: ctx.db.cancellationPolicies } };
};

const settingsUpdate = (ctx) => {
  const { db, body } = ctx;
  if (!body.values || typeof body.values !== "object") throw apiError("VALIDATION_ERROR", 422, "Thiếu giá trị cần cập nhật.");
  const changes = [];
  for (const [key, value] of Object.entries(body.values)) {
    const setting = db.settings[key];
    if (!setting) continue;
    if (typeof setting.value === "boolean" && typeof value !== "boolean") {
      throw apiError("VALIDATION_ERROR", 422, `Giá trị ${key} phải là đúng/sai.`, { [key]: "Sai kiểu dữ liệu." });
    }
    if (typeof setting.value === "number" && !Number.isFinite(Number(value))) {
      throw apiError("VALIDATION_ERROR", 422, `Giá trị ${key} phải là số.`, { [key]: "Sai kiểu dữ liệu." });
    }
    if (String(setting.value) !== String(value)) changes.push({ key, before: setting.value, after: value });
  }
  if (!changes.length) return { data: { updated: 0 } };
  tx((database) => {
    for (const change of changes) {
      const setting = database.settings[change.key];
      setting.value = typeof setting.value === "number" ? Number(change.after) : typeof setting.value === "boolean" ? Boolean(change.after) : String(change.after);
      setting.updatedAt = nowIso();
      setting.updatedBy = ctx.user.id;
    }
    for (const change of changes) {
      audit(ctx, "settings.update", "setting", change.key, { value: change.before }, { value: change.after });
    }
  });
  return { data: { updated: changes.length, changes } };
};

const policyList = (ctx) => ({ data: ctx.db.cancellationPolicies.slice() });

const policyCreate = (ctx) => {
  const { body } = ctx;
  const name = String(body.name || "").trim();
  if (name.length < 3) throw apiError("VALIDATION_ERROR", 422, "Nhập tên chính sách.", { name: "Bắt buộc." });
  if (!Array.isArray(body.tiers) || !body.tiers.length) throw apiError("VALIDATION_ERROR", 422, "Cần ít nhất một bậc phí.", { tiers: "Bắt buộc." });
  const tiers = body.tiers.map((t) => ({
    minDaysBefore: Number(t.minDaysBefore), maxDaysBefore: t.maxDaysBefore === null || t.maxDaysBefore === "" ? null : Number(t.maxDaysBefore),
    feePercent: Number(t.feePercent),
  })).sort((a, b) => b.minDaysBefore - a.minDaysBefore);
  for (const t of tiers) {
    if (!Number.isFinite(t.minDaysBefore) || !Number.isFinite(t.feePercent) || t.feePercent < 0 || t.feePercent > 100) {
      throw apiError("VALIDATION_ERROR", 422, "Bậc phí không hợp lệ.", { tiers: "Kiểm tra số ngày và %." });
    }
  }
  for (let i = 0; i < tiers.length - 1; i++) {
    if (tiers[i].maxDaysBefore !== null && tiers[i + 1].minDaysBefore <= tiers[i].maxDaysBefore) {
      throw apiError("VALIDATION_ERROR", 422, "Các bậc phí bị chồng lấn.", { tiers: "Khoảng ngày chồng nhau." });
    }
  }
  const row = tx((database) => {
    const item = {
      id: (database._seq.cancellationPolicies = (database._seq.cancellationPolicies || 0) + 1),
      code: body.code ? String(body.code).toUpperCase().slice(0, 40) : `POLICY-${Date.now().toString(36).toUpperCase()}`,
      name, description: body.description || "", tiers, active: true, createdAt: nowIso(),
    };
    database.cancellationPolicies.push(item);
    audit(ctx, "cancellation_policy.create", "cancellationPolicy", item.id, null, { name, tiers });
    return item;
  });
  return { data: row };
};

const policyUpdate = (ctx) => {
  const policy = ctx.db.cancellationPolicies.find((p) => p.id === Number(ctx.params.id));
  if (!policy) throw apiError("NOT_FOUND", 404, "Không tìm thấy chính sách.");
  if (!Array.isArray(ctx.body.tiers) || !ctx.body.tiers.length) throw apiError("VALIDATION_ERROR", 422, "Cần ít nhất một bậc phí.");
  const tiers = ctx.body.tiers.map((t) => ({
    minDaysBefore: Number(t.minDaysBefore),
    maxDaysBefore: t.maxDaysBefore === null || t.maxDaysBefore === "" ? null : Number(t.maxDaysBefore),
    feePercent: Number(t.feePercent),
  })).sort((a, b) => b.minDaysBefore - a.minDaysBefore);
  for (let i = 0; i < tiers.length - 1; i++) {
    if (tiers[i].maxDaysBefore !== null && tiers[i + 1].minDaysBefore <= tiers[i].maxDaysBefore) {
      throw apiError("VALIDATION_ERROR", 422, "Các bậc phí bị chồng lấn.", { tiers: "Khoảng ngày chồng nhau." });
    }
  }
  tx((database) => {
    const target = database.cancellationPolicies.find((p) => p.id === policy.id);
    const before = structuredClone(target);
    if (ctx.body.name) target.name = String(ctx.body.name).trim();
    if (ctx.body.description !== undefined) target.description = ctx.body.description;
    target.tiers = tiers;
    if (ctx.body.active !== undefined) target.active = Boolean(ctx.body.active);
    audit(ctx, "cancellation_policy.update", "cancellationPolicy", target.id, before, { tiers, active: target.active });
  });
  return { data: { updated: true } };
};

/* ====================== REPORTS ====================== */

function reportPeriod(query) {
  const to = query.to || todayVN();
  const from = query.from || `${to.slice(0, 7)}-01`;
  return { from, to };
}

const reportRevenue = (ctx) => {
  const { from, to } = reportPeriod(ctx.query);
  const collected = revenueCollected(ctx.db, from, to);
  const recognized = revenueRecognized(ctx.db, from, to);
  const byDayMap = new Map();
  for (const p of collected.payments) {
    const day = vnDateOf(p.paidAt);
    byDayMap.set(day, (byDayMap.get(day) || 0) + p.amount);
  }
  for (const r of collected.refunds) {
    const day = vnDateOf(r.processedAt);
    byDayMap.set(day, (byDayMap.get(day) || 0) - r.amount);
  }
  const byDay = [...byDayMap.entries()].sort().map(([date, amount]) => ({ date, amount }));
  const byTour = new Map();
  for (const row of recognized.rows) {
    const tour = getTour(ctx.db, row.departure.tourId);
    const key = tour.id;
    byTour.set(key, {
      tourId: tour.id, tourName: tour.name,
      recognized: (byTour.get(key)?.recognized || 0) + row.amount,
      bookings: (byTour.get(key)?.bookings || 0) + 1,
    });
  }
  return {
    data: {
      from, to,
      collected: collected.collected, refunded: collected.refunded, net: collected.net,
      recognized: recognized.total,
      byDay,
      byTour: [...byTour.values()].sort((a, b) => b.recognized - a.recognized),
      payments: collected.payments.slice(-200),
      refunds: collected.refunds.slice(-200),
      note: "Doanh thu đã thu tính theo ngày giao dịch; doanh thu ghi nhận tính theo ngày chuyến kết thúc.",
    },
  };
};

const reportOccupancy = (ctx) => {
  const { from, to } = reportPeriod(ctx.query);
  const rows = ctx.db.departures.filter((d) => d.departureDate >= from && d.departureDate <= to && !["draft", "cancelled"].includes(d.status))
    .map((d) => adminDepartureRow(ctx.db, d));
  const totalCapacity = rows.reduce((sum, r) => sum + r.capacity, 0);
  const totalSeats = rows.reduce((sum, r) => sum + r.seatsTaken, 0);
  return {
    data: {
      from, to, rows,
      summary: { departures: rows.length, totalCapacity, totalSeats, fillRate: totalCapacity ? Math.round((totalSeats / totalCapacity) * 100) : 0 },
    },
  };
};

const reportCancellations = (ctx) => {
  const { from, to } = reportPeriod(ctx.query);
  const cancelled = ctx.db.bookings.filter((b) => b.status === "cancelled" && b.cancelledAt && vnDateOf(b.cancelledAt) >= from && vnDateOf(b.cancelledAt) <= to);
  const expired = ctx.db.bookings.filter((b) => b.status === "expired" && vnDateOf(b.updatedAt) >= from && vnDateOf(b.updatedAt) <= to);
  const confirmed = ctx.db.bookings.filter((b) => ["confirmed", "completed", "cancelled"].includes(b.status) && vnDateOf(b.createdAt) >= from && vnDateOf(b.createdAt) <= to);
  const reasons = {};
  for (const b of cancelled) reasons[b.cancelReasonCode || "other"] = (reasons[b.cancelReasonCode || "other"] || 0) + 1;
  return {
    data: {
      from, to, cancelled: cancelled.length, expired: expired.length,
      rate: confirmed.length ? Math.round((cancelled.length / confirmed.length) * 100) : 0,
      reasons: Object.entries(reasons).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      rows: cancelled.map((b) => adminBookingRow(ctx.db, b)),
    },
  };
};

const reportDebt = (ctx) => {
  const today = todayVN();
  const buckets = { inTerm: [], overdue1: [], overdue2: [], overdue3: [], overdue4: [] };
  for (const booking of ctx.db.bookings.filter((b) => b.status === "confirmed")) {
    const gross = grossPaidAmount(ctx.db, booking.id);
    const remaining = booking.totalPrice - gross;
    if (remaining <= 0) continue;
    const days = daysBetween(booking.balanceDueDate || today, today);
    const row = { ...adminBookingRow(ctx.db, booking), dueDays: days, remaining };
    if (days <= 0) buckets.inTerm.push(row);
    else if (days <= 3) buckets.overdue1.push(row);
    else if (days <= 7) buckets.overdue2.push(row);
    else buckets.overdue3.push(row);
  }
  const all = Object.values(buckets).flat();
  return {
    data: {
      today,
      total: all.reduce((sum, r) => sum + r.remaining, 0),
      buckets: [
        { key: "inTerm", label: "Trong hạn", amount: buckets.inTerm.reduce((s, r) => s + r.remaining, 0), rows: buckets.inTerm },
        { key: "overdue1", label: "Quá hạn 1–3 ngày", amount: buckets.overdue1.reduce((s, r) => s + r.remaining, 0), rows: buckets.overdue1 },
        { key: "overdue2", label: "Quá hạn 4–7 ngày", amount: buckets.overdue2.reduce((s, r) => s + r.remaining, 0), rows: buckets.overdue2 },
        { key: "overdue3", label: "Quá hạn > 7 ngày", amount: buckets.overdue3.reduce((s, r) => s + r.remaining, 0), rows: buckets.overdue3 },
      ],
      rows: all,
    },
  };
};

const reportProfit = (ctx) => {
  const { from, to } = reportPeriod(ctx.query);
  const rows = [];
  for (const dep of ctx.db.departures.filter((d) => d.status === "completed" && d.departureDate >= from && d.departureDate <= to)) {
    const bookings = ctx.db.bookings.filter((b) => b.departureId === dep.id && b.status === "completed");
    const revenue = bookings.reduce((sum, b) => sum + b.totalPrice - refundedAmount(ctx.db, b.id), 0);
    const cost = ctx.db.costs.filter((c) => c.departureId === dep.id).reduce((sum, c) => sum + c.amount, 0);
    rows.push({
      departureId: dep.id, tourName: getTour(ctx.db, dep.tourId)?.name,
      departureDate: dep.departureDate, bookings: bookings.length,
      revenue, cost, profit: revenue - cost, margin: revenue ? Math.round(((revenue - cost) / revenue) * 100) : 0,
    });
  }
  return { data: { from, to, rows, total: rows.reduce((sum, r) => ({ revenue: sum.revenue + r.revenue, cost: sum.cost + r.cost, profit: sum.profit + r.profit }), { revenue: 0, cost: 0, profit: 0 }) } };
};

const reportCoupons = (ctx) => {
  const rows = ctx.db.coupons.map((c) => {
    const usages = ctx.db.couponUsages.filter((u) => u.couponId === c.id && !u.voidedAt);
    const bookings = usages.map((u) => ctx.db.bookings.find((b) => b.id === u.bookingId)).filter(Boolean);
    return {
      id: c.id, code: c.code, name: c.name, type: c.type, value: c.value, usedCount: c.usedCount,
      usageLimit: c.usageLimit, usages: usages.length,
      discount: usages.reduce((sum, u) => sum + u.discountAmount, 0),
      revenue: bookings.reduce((sum, b) => sum + b.totalPrice, 0),
      completed: bookings.filter((b) => ["confirmed", "completed"].includes(b.status)).length,
      conversionRate: bookings.length ? Math.round((bookings.filter((b) => ["confirmed", "completed"].includes(b.status)).length / bookings.length) * 100) : 0,
      active: c.active, validTo: c.validTo,
    };
  });
  return { data: { rows } };
};

const reportChannels = (ctx) => {
  const { from, to } = reportPeriod(ctx.query);
  const bookings = ctx.db.bookings.filter((b) => vnDateOf(b.createdAt) >= from && vnDateOf(b.createdAt) <= to);
  const channels = ["web", "counter", "phone", "agent"].map((channel) => {
    const rows = bookings.filter((b) => b.channel === channel);
    return {
      channel, count: rows.length,
      confirmed: rows.filter((b) => ["confirmed", "completed"].includes(b.status)).length,
      value: rows.reduce((sum, b) => sum + b.totalPrice, 0),
    };
  });
  return { data: { from, to, channels } };
};

const reportExport = (ctx) => {
  const type = ctx.query.type || "revenue";
  const { from, to } = reportPeriod(ctx.query);
  let rows = [];
  let filename = `VietTrails-${type}-${from}-${to}.csv`;
  if (type === "revenue") {
    const collected = revenueCollected(ctx.db, from, to);
    rows = collected.payments.map((p) => {
      const booking = ctx.db.bookings.find((b) => b.id === p.bookingId);
      return {
        merchantRef: p.merchantRef, bookingCode: booking?.code, method: p.method, amount: p.amount,
        status: p.status, paidAt: p.paidAt, customer: booking?.contactName, email: booking?.contactEmail,
      };
    });
  } else if (type === "debt") {
    rows = reportDebt(ctx).data.rows.map((r) => ({
      code: r.code, customer: r.customerName, phone: r.customerPhone, tour: r.tour.name,
      departureDate: r.departureDate, total: r.total, paid: r.paid, remaining: r.remaining,
      balanceDueDate: r.balanceDueDate, dueDays: r.dueDays,
    }));
  } else if (type === "occupancy") {
    rows = reportOccupancy(ctx).data.rows.map((r) => ({
      departureDate: r.departureDate, tour: r.tourName, status: r.status,
      capacity: r.capacity, seatsTaken: r.seatsTaken, fillRate: `${r.fillRate}%`, revenue: r.revenue, collected: r.collected,
    }));
  } else if (type === "profit") {
    rows = reportProfit(ctx).data.rows;
  } else {
    throw apiError("VALIDATION_ERROR", 422, "Loại báo cáo không hỗ trợ.", { type: "Chọn loại khác." });
  }
  audit(ctx, "report.export", "report", type, null, { from, to, rows: rows.length });
  return { data: { filename, csv: toCsv(rows), rowCount: rows.length } };
};

/* ====================== BACKUPS ====================== */

const backupList = () => ({
  data: {
    backups: listBackups(),
    keep: BACKUP_KEEP,
    intervalHours: BACKUP_INTERVAL_HOURS,
  },
});

const backupCreate = (ctx) => {
  let result;
  try {
    result = createBackup(ctx.db, { reason: "manual", actorId: ctx.user.id });
  } catch (error) {
    throw apiError("INTERNAL_ERROR", 500, "Không tạo được bản sao lưu.", undefined, { detail: error.message });
  }
  audit(ctx, "system.backup.create", "backup", result.filename, null, {
    size: result.size, checksum: result.checksum, reason: result.reason,
  });
  return { data: result };
};

const backupVerify = (ctx) => {
  const result = verifyBackup(ctx.params.filename);
  if (result.size === undefined) throw apiError("NOT_FOUND", 404, "Không tìm thấy tệp sao lưu.");
  audit(ctx, "system.backup.verify", "backup", result.filename, null, {
    valid: result.valid, errors: result.errors,
  });
  return { data: result };
};

/* ====================== OUTBOX ====================== */

function outboxView(row) {
  const link = row.link ? String(row.link).replace(/([?&](?:token|invite)=)[^&]+/gi, "$1[redacted]") : null;
  return { ...row, link };
}

const outboxList = (ctx) => {
  const { query } = ctx;
  let rows = ctx.db.outbox.slice();
  if (query.status) rows = rows.filter((row) => row.status === query.status);
  if (query.q) {
    const needle = normalizeText(query.q);
    rows = rows.filter((row) => normalizeText(`${row.to} ${row.subject} ${row.type} ${row.body || ""}`).includes(needle));
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paged = pageRows(rows, query, 50);
  return { ...paged, data: paged.data.map(outboxView) };
};

const outboxRetry = (ctx) => {
  const row = ctx.db.outbox.find((item) => item.id === Number(ctx.params.id));
  if (!row) throw apiError("NOT_FOUND", 404, "Không tìm thấy thông báo.");
  const updated = tx((database) => {
    const target = database.outbox.find((item) => item.id === row.id);
    target.status = "sent";
    target.attempts = (target.attempts || 0) + 1;
    target.lastAttemptAt = nowIso();
    target.sentAt = nowIso();
    target.lastError = null;
    audit(ctx, "notification.retry", "outbox", row.id, { status: row.status, attempts: row.attempts || 0 }, { status: "sent", attempts: target.attempts });
    return target;
  });
  return { data: outboxView(updated) };
};

/* ====================== AUDIT / ALERTS ====================== */

const auditList = (ctx) => {
  const { db, query } = ctx;
  let rows = db.auditLogs.slice();
  if (query.actorId) rows = rows.filter((r) => r.actorId === Number(query.actorId));
  if (query.entity) rows = rows.filter((r) => r.entity === query.entity);
  if (query.action) rows = rows.filter((r) => r.action.includes(query.action));
  if (query.from) rows = rows.filter((r) => vnDateOf(r.createdAt) >= query.from);
  if (query.to) rows = rows.filter((r) => vnDateOf(r.createdAt) <= query.to);
  if (query.q) rows = rows.filter((r) => normalizeText(`${r.action} ${r.entity} ${r.entityId} ${staffName(db, r.actorId)}`).includes(normalizeText(query.q)));
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paged = pageRows(rows, query, 50);
  paged.data = paged.data.map((r) => ({ ...r, actorName: staffName(db, r.actorId) }));
  return paged;
};

const alertList = (ctx) => {
  const rows = ctx.db.alerts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { data: rows, meta: { open: rows.filter((r) => r.status === "open").length } };
};

const alertResolve = (ctx) => {
  const alertRow = ctx.db.alerts.find((a) => a.id === Number(ctx.params.id));
  if (!alertRow) throw apiError("NOT_FOUND", 404, "Không tìm thấy cảnh báo.");
  tx((database) => {
    const target = database.alerts.find((a) => a.id === alertRow.id);
    target.status = "resolved";
    target.resolvedAt = nowIso();
    target.resolvedBy = ctx.user.id;
    audit(ctx, "alert.resolve", "alert", alertRow.id, { status: "open" }, { status: "resolved" });
  });
  return { data: { resolved: true } };
};

/* ====================== ROUTE TABLE ====================== */

export const adminRoutes = [
  ["GET", "/admin/dashboard", "admin:access", dashboardHandler, "admin-dashboard"],

  ["GET", "/admin/tours", "tour:read", tourList, "admin-tours"],
  ["POST", "/admin/tours", "tour:create", tourCreate, "admin-tour-create"],
  ["GET", "/admin/tours/:id", "tour:read", tourDetailAdmin, "admin-tour-detail"],
  ["PUT", "/admin/tours/:id", "tour:read", tourUpdate, "admin-tour-update"],
  ["POST", "/admin/tours/:id/publish", "tour:publish", tourPublish, "admin-tour-publish"],
  ["POST", "/admin/tours/:id/hide", "tour:publish", tourStatus("hidden"), "admin-tour-hide"],
  ["POST", "/admin/tours/:id/archive", "tour:publish", tourArchive, "admin-tour-archive"],
  ["POST", "/admin/tours/:id/duplicate", "tour:create", tourDuplicate, "admin-tour-duplicate"],
  ["DELETE", "/admin/tours/:id", "tour:publish", tourArchive, "admin-tour-delete"],

  ["GET", "/admin/departures", "departure:read", departureList, "admin-departures"],
  ["POST", "/admin/departures", "departure:create", departureCreate, "admin-departure-create"],
  ["POST", "/admin/departures/bulk", "departure:create", departureBulk, "admin-departure-bulk"],
  ["GET", "/admin/departures/:id", "departure:read", departureDetail, "admin-departure-detail"],
  ["PATCH", "/admin/departures/:id", "departure:update", departureUpdate, "admin-departure-update"],
  ["POST", "/admin/departures/:id/cancel", "departure:cancel", departureCancel, "admin-departure-cancel"],
  ["POST", "/admin/departures/:id/go-no-go", "departure:update", departureGoNoGo, "admin-departure-gonogo"],
  ["POST", "/admin/departures/:id/assignment", "operations:manage", departureAssign, "admin-departure-assign"],
  ["POST", "/admin/departures/:id/costs", "operations:manage", departureCostAdd, "admin-departure-cost-add"],
  ["DELETE", "/admin/departures/:id/costs/:costId", "operations:manage", departureCostDelete, "admin-departure-cost-delete"],
  ["POST", "/admin/departures/:id/incidents", "departure:read", departureIncidentAdd, "admin-departure-incident-add"],
  ["POST", "/admin/departures/:id/incidents/:incidentId/resolve", "operations:manage", departureIncidentResolve, "admin-departure-incident-resolve"],
  ["POST", "/admin/departures/:id/checkin", "departure:read", departureCheckin, "admin-departure-checkin"],
  ["GET", "/admin/departures/:id/manifest", "manifest:read", departureManifest, "admin-departure-manifest"],

  ["GET", "/admin/bookings", "booking:read", bookingList, "admin-bookings"],
  ["POST", "/admin/bookings", "booking:update", bookingCreateAdmin, "admin-booking-create"],
  ["GET", "/admin/bookings/:code", "booking:read", bookingDetailAdmin, "admin-booking-detail"],
  ["POST", "/admin/bookings/:code/confirm", "booking:update", bookingConfirmAdmin, "admin-booking-confirm"],
  ["POST", "/admin/bookings/:code/cancel", "booking:cancel", bookingCancelAdmin, "admin-booking-cancel"],
  ["GET", "/admin/bookings/:code/cancel-quote", "booking:cancel", bookingCancelQuoteAdmin, "admin-booking-cancel-quote"],
  ["POST", "/admin/bookings/:code/extend-hold", "booking:update", bookingExtendHold, "admin-booking-extend"],
  ["POST", "/admin/bookings/:code/note", "booking:update", bookingNote, "admin-booking-note"],
  ["POST", "/admin/bookings/:code/assign", "booking:update", bookingAssign, "admin-booking-assign"],
  ["POST", "/admin/bookings/:code/payments", "payment:confirm", bookingManualPayment, "admin-booking-payment"],
  ["GET", "/admin/bookings/:code/passengers/:passengerId/document", "export:pii", bookingRevealDocument, "admin-booking-reveal"],

  ["GET", "/admin/change-requests", "booking:read", changeRequestList, "admin-change-requests"],
  ["POST", "/admin/change-requests/:id/approve", "booking:update", changeRequestApprove, "admin-change-approve"],
  ["POST", "/admin/change-requests/:id/reject", "booking:update", changeRequestReject, "admin-change-reject"],

  ["GET", "/admin/payments", "payment:read", paymentList, "admin-payments"],
  ["POST", "/admin/payments/:id/confirm", "payment:confirm", paymentConfirm, "admin-payment-confirm"],
  ["POST", "/admin/payments/:id/reject", "payment:confirm", paymentReject, "admin-payment-reject"],
  ["POST", "/admin/payments/:id/reconcile", "payment:confirm", paymentReconcile, "admin-payment-reconcile"],

  ["GET", "/admin/refunds", "refund:read", refundList, "admin-refunds"],
  ["POST", "/admin/refunds", "refund:approve", refundCreate, "admin-refund-create"],
  ["POST", "/admin/refunds/:id/approve", "refund:approve", refundApprove, "admin-refund-approve"],
  ["POST", "/admin/refunds/:id/reject", "refund:approve", refundReject, "admin-refund-reject"],
  ["POST", "/admin/refunds/:id/process", "refund:approve", refundProcess, "admin-refund-process"],
  ["POST", "/admin/refunds/:id/complete", "refund:approve", refundComplete, "admin-refund-complete"],

  ["GET", "/admin/invoices", "invoice:read", invoiceList, "admin-invoices"],
  ["POST", "/admin/invoices/:id/issue", "invoice:manage", invoiceIssue, "admin-invoice-issue"],
  ["POST", "/admin/invoices/:id/cancel", "invoice:manage", invoiceCancel, "admin-invoice-cancel"],

  ["GET", "/admin/customers", "customer:read", customerList, "admin-customers"],
  ["GET", "/admin/customers/:id", "customer:read", customerDetail, "admin-customer-detail"],
  ["POST", "/admin/customers/:id/status", "customer:update", customerLock, "admin-customer-status"],
  ["POST", "/admin/customers/:id/note", "customer:update", customerNote, "admin-customer-note"],

  ["GET", "/admin/coupons", "coupon:read", couponList, "admin-coupons"],
  ["POST", "/admin/coupons", "coupon:manage", couponCreate, "admin-coupon-create"],
  ["PUT", "/admin/coupons/:id", "coupon:manage", couponUpdate, "admin-coupon-update"],
  ["DELETE", "/admin/coupons/:id", "coupon:manage", couponDelete, "admin-coupon-delete"],

  ["GET", "/admin/reviews", "review:read", reviewList, "admin-reviews"],
  ["POST", "/admin/reviews/:id/:action", "review:moderate", reviewModerate, "admin-review-moderate"],
  ["POST", "/admin/reviews/:id/reply", "review:moderate", reviewReply, "admin-review-reply"],

  ["GET", "/admin/tickets", "ticket:handle", ticketList, "admin-tickets"],
  ["GET", "/admin/tickets/:id", "ticket:handle", ticketDetail, "admin-ticket-detail"],
  ["POST", "/admin/tickets/:id/reply", "ticket:handle", ticketReply, "admin-ticket-reply"],
  ["POST", "/admin/tickets/:id/update", "ticket:handle", ticketUpdate, "admin-ticket-update"],

  ["GET", "/admin/resources/:type", "operations:manage", resourceList, "admin-resources"],
  ["POST", "/admin/resources/:type", "operations:manage", resourceCreate, "admin-resource-create"],
  ["PUT", "/admin/resources/:type/:id", "operations:manage", resourceUpdate, "admin-resource-update"],
  ["DELETE", "/admin/resources/:type/:id", "operations:manage", resourceDelete, "admin-resource-delete"],

  ["GET", "/admin/catalog/:type", "tour:read", catalogList, "admin-catalog"],
  ["POST", "/admin/catalog/:type", "tour:update", catalogCreate, "admin-catalog-create"],
  ["PUT", "/admin/catalog/:type/:id", "tour:update", catalogUpdate, "admin-catalog-update"],
  ["DELETE", "/admin/catalog/:type/:id", "tour:update", catalogDelete, "admin-catalog-delete"],

  ["GET", "/admin/content", "content:manage", contentList, "admin-content"],
  ["POST", "/admin/content/pages", "content:manage", contentPageUpsert, "admin-content-page-create"],
  ["PUT", "/admin/content/pages/:id", "content:manage", contentPageUpsert, "admin-content-page-update"],
  ["DELETE", "/admin/content/pages/:id", "content:manage", contentPageDelete, "admin-content-page-delete"],
  ["POST", "/admin/content/banners", "content:manage", bannerUpsert, "admin-banner-create"],
  ["PUT", "/admin/content/banners/:id", "content:manage", bannerUpsert, "admin-banner-update"],
  ["DELETE", "/admin/content/banners/:id", "content:manage", bannerDelete, "admin-banner-delete"],

  ["GET", "/admin/users", "user:manage", userList, "admin-users"],
  ["GET", "/admin/staff", "admin:access", staffDirectory, "admin-staff"],
  ["POST", "/admin/users/invite", "user:manage", userInvite, "admin-user-invite"],
  ["POST", "/admin/users/:id/roles", "role:manage", userUpdateRoles, "admin-user-roles"],
  ["POST", "/admin/users/:id/status", "user:manage", userLock, "admin-user-status"],
  ["GET", "/admin/roles", "role:manage", roleMatrix, "admin-roles"],

  ["GET", "/admin/settings", "settings:manage", settingsGet, "admin-settings"],
  ["GET", "/admin/policies", "tour:read", policyList, "admin-policies"],
  ["PUT", "/admin/settings", "settings:manage", settingsUpdate, "admin-settings-update"],
  ["POST", "/admin/settings/policies", "settings:manage", policyCreate, "admin-policy-create"],
  ["PUT", "/admin/settings/policies/:id", "settings:manage", policyUpdate, "admin-policy-update"],

  ["GET", "/admin/backups", "settings:manage", backupList, "admin-backups"],
  ["POST", "/admin/backups", "settings:manage", backupCreate, "admin-backup-create"],
  ["POST", "/admin/backups/:filename/verify", "settings:manage", backupVerify, "admin-backup-verify"],

  ["GET", "/admin/reports/revenue", "report:view", reportRevenue, "admin-report-revenue"],
  ["GET", "/admin/reports/occupancy", "report:view", reportOccupancy, "admin-report-occupancy"],
  ["GET", "/admin/reports/cancellations", "report:view", reportCancellations, "admin-report-cancellations"],
  ["GET", "/admin/reports/debt", "report:financial", reportDebt, "admin-report-debt"],
  ["GET", "/admin/reports/profit", "report:financial", reportProfit, "admin-report-profit"],
  ["GET", "/admin/reports/coupons", "report:view", reportCoupons, "admin-report-coupons"],
  ["GET", "/admin/reports/channels", "report:view", reportChannels, "admin-report-channels"],
  ["GET", "/admin/reports/export", "report:view", reportExport, "admin-report-export"],

  ["GET", "/admin/audit-logs", "audit:view", auditList, "admin-audit"],
  ["GET", "/admin/outbox", "audit:view", outboxList, "admin-outbox"],
  ["POST", "/admin/outbox/:id/retry", "audit:view", outboxRetry, "admin-outbox-retry"],
  ["GET", "/admin/alerts", "admin:access", alertList, "admin-alerts"],
  ["POST", "/admin/alerts/:id/resolve", "admin:access", alertResolve, "admin-alert-resolve"],
];

void maskDocument;
void endOfDayVN;
void roundUpTo;
void computeChangeQuote;
void addDays;
