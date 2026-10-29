import crypto from "node:crypto";
import {
  addDays, bookingCode, deepClone, escapeHtml, hashPassword, hmac, maskDocument, normalizeCoupon,
  normalizePhone, normalizeText, nowIso, paginate, parsePage, randomToken, sha256, stableStringify,
  todayVN, validateEmail, validatePhone, timingSafeEqual,
} from "./util.mjs";
import {
  addAudit, addHistory, allowedActionsFor, cfg, cfgNumber, computeCancellationQuote, computeChangeQuote,
  computeQuote, getBooking, getDeparture, getPolicy, getTour, grossPaidAmount, holdExpiryFor,
  notify, paymentStatusFor, publicDeparture, recalcBookingMoney, refundedAmount, sanitizeMoney, tourCard,
  tourDetail,
} from "./business.mjs";
import { ApiError, apiError } from "./errors.mjs";
import { flushDb, getDb, saveDb, tx } from "./db.mjs";
import {
  authSecret, checkUserPassword, createSession, isCommonPassword, newTotpSecret, revokeAllSessions,
  revokeSession, rotateRefresh, sanitizeUser, signAccess, totpCode, verifyAccessToken, verifyTotp,
} from "./auth.mjs";
import { hasPermission, permissionsFor, ROLES, ROLE_LABELS, ROLE_PERMISSIONS } from "./permissions.mjs";
import {
  applyPaymentSuccess, approveChangeRequest, cancelBookingNow, companyCancelDeparture, sweepDb,
} from "./domain.mjs";
import { manifestHtml, voucherHtml } from "./documents.mjs";
import { adminRoutes } from "./admin-routes.mjs";

const API_PREFIX = "/api/v1";
const COOKIE_NAME = "vt_refresh";
const BODY_LIMIT = 4 * 1024 * 1024;
const routes = [];
const rateBuckets = new Map();
let lastSweep = 0;

const isDev = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_OUTBOX === "1";

function add(method, path, handler, opts = {}) {
  routes.push({
    method,
    parts: path.split("/").filter(Boolean),
    handler,
    perm: opts.perm || null,
    verified: Boolean(opts.verified),
    rate: opts.rate || null,
    handlerName: opts.name || handler.name,
  });
}

for (const route of adminRoutes) {
  add(route[0], route[1], route[3], { perm: route[2], name: route[4] });
}

function json(res, status, payload, requestId, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...extraHeaders,
  });
  res.end(body);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

const SESSION_HINT_COOKIE = "vt_has_session";

function setRefreshCookie(res, token, maxAgeSeconds = 30 * 24 * 3600) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const flags = `Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
  // The hint is intentionally readable by the client so it only calls
  // /auth/refresh when a refresh cookie may exist (no 401 noise on first visit).
  res.setHeader("Set-Cookie", [
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; ${flags}`,
    `${SESSION_HINT_COOKIE}=1; ${flags}`,
  ]);
}

function clearRefreshCookie(res) {
  res.setHeader("Set-Cookie", [
    `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
    `${SESSION_HINT_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`,
  ]);
}

async function readJson(req) {
  if (req.method === "GET" || req.method === "HEAD") return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw apiError("VALIDATION_ERROR", 413, "Dữ liệu gửi lên quá lớn.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw apiError("VALIDATION_ERROR", 400, "Dữ liệu gửi lên không phải JSON hợp lệ.");
  }
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket.remoteAddress || "127.0.0.1";
}

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > max) {
    throw apiError("RATE_LIMITED", 429, "Bạn thao tác quá nhanh, vui lòng thử lại sau ít giây.", undefined, {
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    });
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt < now) rateBuckets.delete(key);
}, 60000).unref?.();

/** Resolve a session from the refresh cookie (used for document navigation when no bearer is available). */
function userFromRefresh(db, req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token || !token.includes(".")) return null;
  const [sid, secret] = token.split(".");
  const session = db.sessions.find((s) => s.id === sid && !s.revokedAt);
  if (!session) return null;
  if (!timingSafeEqual(session.refreshHash, sha256(secret))) return null;
  const user = db.users.find((u) => u.id === session.userId && u.status === "active");
  return user ? { user, session } : null;
}

function requireUser(ctx) {
  if (!ctx.user) throw apiError("UNAUTHENTICATED", 401, "Vui lòng đăng nhập để tiếp tục.");
  return ctx.user;
}

function requireEmailVerified(ctx) {
  const user = requireUser(ctx);
  if (!user.emailVerifiedAt) {
    throw apiError("EMAIL_NOT_VERIFIED", 403, "Vui lòng xác minh email trước khi đặt tour.", undefined, {
      email: user.email,
    });
  }
  return user;
}

function requirePerm(ctx, perm) {
  const user = requireUser(ctx);
  if (!hasPermission(user, perm)) {
    throw apiError("FORBIDDEN", 403, "Bạn không có quyền thực hiện thao tác này.");
  }
  return user;
}

function validateContact(contact) {
  const fields = {};
  if (!contact || typeof contact !== "object") throw apiError("VALIDATION_ERROR", 422, "Thiếu thông tin liên hệ.", { contact: "Bắt buộc" });
  const fullName = String(contact.fullName || "").trim();
  if (fullName.length < 2 || fullName.length > 100) fields.fullName = "Họ tên từ 2 đến 100 ký tự.";
  const email = String(contact.email || "").trim().toLowerCase();
  if (!validateEmail(email)) fields.email = "Email chưa đúng định dạng.";
  const phone = normalizePhone(contact.phone);
  if (!validatePhone(phone)) fields.phone = "Số điện thoại chưa đúng định dạng Việt Nam.";
  if (Object.keys(fields).length) {
    throw apiError("VALIDATION_ERROR", 422, "Vui lòng kiểm tra lại thông tin liên hệ.", fields);
  }
  return { fullName, email, phone };
}

function validatePassengers(db, tour, departure, passengers) {
  if (!Array.isArray(passengers) || passengers.length === 0) {
    throw apiError("VALIDATION_ERROR", 422, "Vui lòng nhập danh sách hành khách.", { passengers: "Cần ít nhất một hành khách." });
  }
  if (passengers.length > cfgNumber(db, "booking.max_pax_online", 10)) {
    throw apiError("VALIDATION_ERROR", 422, `Mỗi đơn online tối đa ${cfgNumber(db, "booking.max_pax_online", 10)} khách.`);
  }
  const fields = {};
  const today = todayVN();
  const cleaned = passengers.map((p, index) => {
    const prefix = `passengers.${index}`;
    const fullName = String(p.fullName || "").trim();
    if (fullName.length < 2 || fullName.length > 100) fields[`${prefix}.fullName`] = "Họ tên từ 2 đến 100 ký tự.";
    const gender = ["male", "female", "other"].includes(p.gender) ? p.gender : null;
    if (!gender) fields[`${prefix}.gender`] = "Chọn giới tính.";
    const dob = String(p.dateOfBirth || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || dob > today) {
      fields[`${prefix}.dateOfBirth`] = "Ngày sinh không hợp lệ hoặc ở tương lai.";
    }
    const specialRequest = p.specialRequest ? String(p.specialRequest).slice(0, 300) : null;
    let idNumber = p.idNumber ? String(p.idNumber).replace(/\s/g, "").toUpperCase() : null;
    let passportNumber = p.passportNumber ? String(p.passportNumber).replace(/\s/g, "").toUpperCase() : null;
    if (tour.requiresIdDocument && !/^\d{9}$|^\d{12}$/.test(idNumber || "")) {
      fields[`${prefix}.idNumber`] = "Số CCCD/CMND gồm 9 hoặc 12 chữ số.";
    }
    if (tour.requiresPassport && !/^[A-Z0-9]{6,9}$/.test(passportNumber || "")) {
      fields[`${prefix}.passportNumber`] = "Số hộ chiếu gồm 6–9 ký tự chữ và số.";
    }
    return {
      fullName, gender, dateOfBirth: dob,
      idNumber: idNumber || null, passportNumber: passportNumber || null,
      nationality: p.nationality ? String(p.nationality).slice(0, 60) : "Việt Nam",
      specialRequest, isLead: index === 0,
    };
  });
  if (Object.keys(fields).length) {
    throw apiError("VALIDATION_ERROR", 422, "Vui lòng kiểm tra thông tin hành khách.", fields);
  }
  // BR-12: at least one adult
  const types = cleaned.map((p) => {
    const age = Number(p.dateOfBirth.slice(0, 4));
    void age;
    return null;
  });
  void types;
  return cleaned;
}

function createAuthToken(db, userId, purpose, { ttlMs, email = null, newEmail = null } = {}) {
  const raw = randomToken(24);
  db.authTokens.push({
    id: (db._seq.authTokens = (db._seq.authTokens || 0) + 1),
    userId, purpose, tokenHash: sha256(raw), email, newEmail,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(), usedAt: null, createdAt: nowIso(),
  });
  return raw;
}

function consumeAuthToken(db, raw, purposes) {
  const hash = sha256(raw || "");
  const token = db.authTokens.find((t) => t.tokenHash === hash && purposes.includes(t.purpose));
  if (!token) return null;
  if (token.usedAt) return null;
  if (new Date(token.expiresAt).getTime() < Date.now()) return null;
  token.usedAt = nowIso();
  return token;
}

function sendVerificationEmail(db, user) {
  const token = createAuthToken(db, user.id, "verify", { ttlMs: 24 * 3600 * 1000, email: user.email });
  db.outbox.push({
    id: (db._seq.outbox = (db._seq.outbox || 0) + 1),
    to: user.email, subject: "Xác minh email tài khoản VietTrails",
    body: "Nhấn vào liên kết bên dưới để xác minh email. Liên kết có hiệu lực 24 giờ.",
    link: `/verify-email?token=${token}`, type: "verify_email", status: "sent",
    attempts: 1, createdAt: nowIso(), sentAt: nowIso(),
  });
  notify(db, {
    userId: user.id, type: "account.verify", title: "Xác minh email của bạn",
    content: "Chúng tôi đã gửi liên kết xác minh tới email đăng ký. Liên kết có hiệu lực 24 giờ.",
    channel: "email",
  });
  return token;
}

function sendPasswordResetEmail(db, user) {
  const token = createAuthToken(db, user.id, "reset", { ttlMs: 30 * 60 * 1000, email: user.email });
  db.outbox.push({
    id: (db._seq.outbox = (db._seq.outbox || 0) + 1),
    to: user.email, subject: "Đặt lại mật khẩu VietTrails",
    body: "Nhấn vào liên kết bên dưới để đặt lại mật khẩu. Liên kết có hiệu lực 30 phút và chỉ dùng một lần.",
    link: `/reset-password?token=${token}`, type: "reset_password", status: "sent",
    attempts: 1, createdAt: nowIso(), sentAt: nowIso(),
  });
  return token;
}

function bookingRow(db, booking, user) {
  const departure = getDeparture(db, booking.departureId);
  const tour = getTour(db, departure.tourId);
  const destination = db.destinations.find((d) => d.id === tour.destinationId);
  const gross = grossPaidAmount(db, booking.id);
  return {
    code: booking.code,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    tour: { id: tour.id, slug: tour.slug, name: tour.name, cover: tour.cover, destinationName: destination?.name || "" },
    departure: publicDeparture(departure),
    adults: booking.adults, children: booking.children, infants: booking.infants,
    total: booking.totalPrice, paidAmount: booking.paidAmount, grossPaid: gross,
    remaining: Math.max(0, booking.totalPrice - gross),
    holdExpiresAt: booking.holdExpiresAt,
    balanceDueDate: booking.balanceDueDate,
    channel: booking.channel,
    createdAt: booking.createdAt,
    allowedActions: user ? allowedActionsFor(db, booking, departure, user) : [],
  };
}

function publicBookingDetail(db, booking, user, options) {
  const departure = getDeparture(db, booking.departureId);
  const tour = getTour(db, departure.tourId);
  return {
    code: booking.code,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    tour: {
      id: tour.id, slug: tour.slug, name: tour.name, cover: tour.cover,
      destinationName: db.destinations.find((d) => d.id === tour.destinationId)?.name || "",
      durationDays: tour.durationDays,
    },
    departure: publicDeparture(departure),
    contact: { fullName: booking.contactName, email: booking.contactEmail, phone: booking.contactPhone },
    adults: booking.adults, children: booking.children, infants: booking.infants, singles: booking.singles,
    priceSnapshot: booking.priceSnapshot,
    subtotal: booking.subtotal, discountTotal: booking.discountTotal, couponCode: booking.couponCode,
    total: booking.totalPrice, depositRequired: booking.depositRequired,
    paidAmount: booking.paidAmount, refundedAmount: booking.refundedAmount,
    grossPaid: grossPaidAmount(db, booking.id),
    remaining: Math.max(0, booking.totalPrice - grossPaidAmount(db, booking.id)),
    balanceDueDate: booking.balanceDueDate, holdExpiresAt: booking.holdExpiresAt,
    customerNote: booking.customerNote,
    channel: booking.channel,
    cancelBy: booking.cancelBy,
    cancelReasonCode: booking.cancelReasonCode,
    cancelledAt: booking.cancelledAt,
    createdAt: booking.createdAt, version: booking.version,
    passengers: db.passengers.filter((p) => p.bookingId === booking.id).map((p) => ({
      ...p,
      idNumber: maskDocument(p.idNumber),
      passportNumber: maskDocument(p.passportNumber),
    })),
    payments: db.payments.filter((p) => p.bookingId === booking.id),
    refunds: db.refunds.filter((r) => r.bookingId === booking.id),
    history: db.bookingHistory.filter((h) => h.bookingId === booking.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    changeRequests: db.changeRequests.filter((c) => c.bookingId === booking.id),
    invoice: db.invoices.find((i) => i.bookingId === booking.id) || null,
    review: db.reviews.find((r) => r.bookingId === booking.id) || null,
    allowedActions: allowedActionsFor(db, booking, departure, user),
    cancellationPolicy: getPolicy(db, tour),
    serverTime: nowIso(),
  };
}

function isBookableTour(db, tour) {
  return db.departures.some((d) => d.tourId === tour.id
    && d.departureDate >= todayVN()
    && ["open", "full"].includes(d.status)
    && d.seatsTaken < d.capacity);
}

function tourMatchesQuery(db, tour, params) {
  const destination = db.destinations.find((d) => d.id === tour.destinationId);
  const category = db.categories.find((c) => c.id === tour.categoryId);
  if (params.q) {
    const hay = `${tour.name} ${tour.summary} ${destination?.name || ""} ${destination?.province || ""} ${category?.name || ""}`;
    if (!normalizeText(hay).includes(normalizeText(params.q))) return false;
  }
  if (params.category && category?.slug !== params.category) return false;
  if (params.region && destination?.region !== params.region) return false;
  if (params.destination && destination?.slug !== params.destination) return false;
  if (params.durationMin && tour.durationDays < Number(params.durationMin)) return false;
  if (params.durationMax && tour.durationDays > Number(params.durationMax)) return false;
  return true;
}

function filterDeparturesForQuery(db, tour, params) {
  const pax = Math.max(1, Number(params.pax) || 1);
  const from = params.dateFrom || todayVN();
  const to = params.dateTo || null;
  return db.departures.filter((d) => {
    if (d.tourId !== tour.id) return false;
    if (!["open", "full"].includes(d.status)) return false;
    if (d.departureDate < from) return false;
    if (to && d.departureDate > to) return false;
    if (d.capacity - d.seatsTaken < pax) return false;
    return true;
  }).sort((a, b) => a.departureDate.localeCompare(b.departureDate));
}

/* ====================== PUBLIC ====================== */

add("GET", "/config/public", (ctx) => {
  const { db } = ctx;
  const bank = {
    name: cfg(db, "bank.name"), bin: cfg(db, "bank.bin") || "970407",
    accountName: cfg(db, "bank.accountName"),
    accountNumber: cfg(db, "bank.accountNumber"), branch: cfg(db, "bank.branch"),
  };
  const paymentMethods = [
    { id: "vnpay", label: "VNPay", description: "Thẻ ATM, QR ngân hàng, thẻ quốc tế", enabled: Boolean(cfg(db, "payment.vnpay_enabled")) },
    { id: "momo", label: "MoMo", description: "Ví điện tử MoMo", enabled: Boolean(cfg(db, "payment.momo_enabled")) },
    { id: "zalopay", label: "ZaloPay", description: "Ví ZaloPay", enabled: Boolean(cfg(db, "payment.zalopay_enabled")) },
    { id: "bank_transfer", label: "Chuyển khoản / VietQR", description: "Chuyển khoản ngân hàng, kế toán xác nhận", enabled: Boolean(cfg(db, "payment.bank_transfer_enabled")) },
  ];
  return {
    data: {
      appName: "VietTrails",
      hotline: cfg(db, "hotline"),
      supportEmail: cfg(db, "support_email"),
      bank,
      paymentMethods,
      termsVersion: cfg(db, "terms.version"),
      maxPaxOnline: cfgNumber(db, "booking.max_pax_online", 10),
      depositDefaultPercent: cfgNumber(db, "deposit.default_percent", 30),
      fullRequiredDays: cfgNumber(db, "payment.full_required_days", 7),
      balanceDueDays: cfgNumber(db, "payment.balance_due_days", 7),
      selfServiceMinDays: cfgNumber(db, "cancel.self_service_min_days", 4),
      passengerEditCutoffDays: cfgNumber(db, "passenger.edit_cutoff_days", 3),
      reviewWindowDays: cfgNumber(db, "review.window_days", 60),
      invoiceDeadlineDays: cfgNumber(db, "invoice.request_deadline_days", 7),
      refundSlaDays: cfgNumber(db, "refund.sla_days", 7),
      holdMinPaymentMinutes: cfgNumber(db, "hold.min_payment_minutes", 30),
      devOutbox: isDev,
      serverTime: nowIso(),
    },
  };
}, { name: "public-config" });

add("GET", "/home", (ctx) => {
  const { db } = ctx;
  const published = db.tours.filter((t) => t.status === "published" && isBookableTour(db, t));
  const cards = published.map((t) => tourCard(db, t)).sort((a, b) => {
    const rating = (b.ratingAvg || 0) - (a.ratingAvg || 0);
    if (rating !== 0) return rating;
    return (a.nextDeparture || "9999").localeCompare(b.nextDeparture || "9999");
  });
  const destinations = db.destinations.filter((d) => d.active).map((d) => {
    const tours = published.filter((t) => t.destinationId === d.id);
    return { ...d, tourCount: tours.length, fromPrice: Math.min(...tours.map((t) => tourCard(db, t).priceFrom).filter((n) => n !== null).concat([Infinity])) };
  }).filter((d) => d.tourCount > 0);
  const categories = db.categories.filter((c) => c.active).map((c) => ({
    ...c, tourCount: published.filter((t) => t.categoryId === c.id).length,
  }));
  const banners = db.banners.filter((b) => b.active).sort((a, b) => (a.position || 0) - (b.position || 0));
  const completed = db.bookings.filter((b) => b.status === "completed").length;
  const approvedReviews = db.reviews.filter((r) => r.status === "approved");
  const ratingAvg = approvedReviews.length
    ? Math.round((approvedReviews.reduce((sum, review) => sum + review.rating, 0) / approvedReviews.length) * 10) / 10
    : null;
  return {
    data: {
      banners,
      featured: cards.slice(0, 6),
      tours: cards.slice(0, 9),
      destinations,
      categories,
      stats: { tours: published.length, destinations: destinations.length, completedBookings: completed, ratingAvg, reviewCount: approvedReviews.length },
      reviews: db.reviews.filter((r) => r.status === "approved").slice(-3).map((r) => ({
        id: r.id, rating: r.rating, comment: r.comment,
        user: db.users.find((u) => u.id === r.userId)?.fullName || "Khách VietTrails",
        tour: db.tours.find((t) => t.id === r.tourId)?.name || "",
        reply: r.reply,
      })),
    },
  };
}, { name: "home" });

add("GET", "/tours", (ctx) => {
  const { db, query } = ctx;
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(24, Math.max(1, Number(query.perPage) || 12));
  const published = db.tours.filter((t) => t.status === "published");
  const rows = [];
  for (const tour of published) {
    if (!tourMatchesQuery(db, tour, query)) continue;
    const deps = filterDeparturesForQuery(db, tour, query);
    if (!deps.length) continue;
    const priceFrom = Math.min(...deps.map((d) => d.priceAdult));
    const next = deps[0];
    const card = tourCard(db, tour);
    card.priceFrom = priceFrom;
    card.nextDeparture = next.departureDate;
    card.seatsLeftNext = next.capacity - next.seatsTaken;
    if (query.priceMin && priceFrom < Number(query.priceMin)) continue;
    if (query.priceMax && priceFrom > Number(query.priceMax)) continue;
    rows.push(card);
  }
  const sort = query.sort || "featured";
  rows.sort((a, b) => {
    if (sort === "price_asc") return (a.priceFrom || 0) - (b.priceFrom || 0);
    if (sort === "price_desc") return (b.priceFrom || 0) - (a.priceFrom || 0);
    if (sort === "date") return (a.nextDeparture || "9999").localeCompare(b.nextDeparture || "9999");
    if (sort === "rating") return (b.ratingAvg || 0) - (a.ratingAvg || 0);
    return (b.ratingAvg || 0) - (a.ratingAvg || 0) || (a.nextDeparture || "9999").localeCompare(b.nextDeparture || "9999");
  });
  const paged = paginate(rows, page, perPage);
  const facets = {
    categories: db.categories.filter((c) => c.active).map((c) => ({
      slug: c.slug, name: c.name, count: rows.filter((r) => r.categorySlug === c.slug).length,
    })),
    regions: [
      { value: "north", label: "Miền Bắc" },
      { value: "central", label: "Miền Trung" },
      { value: "south", label: "Miền Nam" },
    ].map((r) => ({ ...r, count: rows.filter((row) => row.region === r.value).length })),
    priceRange: rows.length ? { min: Math.min(...rows.map((r) => r.priceFrom)), max: Math.max(...rows.map((r) => r.priceFrom)) } : null,
  };
  return { data: paged.rows, meta: { ...paged.meta, facets, serverTime: nowIso() } };
}, { name: "tours-list" });

add("GET", "/tours/:slug", (ctx) => {
  const { db, params } = ctx;
  const tour = db.tours.find((t) => t.slug === params.slug);
  if (!tour || tour.status !== "published") throw apiError("NOT_FOUND", 404, "Không tìm thấy tour.");
  const departures = db.departures
    .filter((d) => d.tourId === tour.id && d.departureDate >= todayVN() && d.status !== "draft")
    .sort((a, b) => a.departureDate.localeCompare(b.departureDate))
    .map(publicDeparture);
  const related = db.tours
    .filter((t) => t.id !== tour.id && t.status === "published" && (t.categoryId === tour.categoryId || t.destinationId === tour.destinationId))
    .slice(0, 3)
    .map((t) => tourCard(db, t));
  const reviews = db.reviews
    .filter((r) => r.tourId === tour.id && r.status === "approved")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((r) => ({
      id: r.id, rating: r.rating, comment: r.comment, reply: r.reply, createdAt: r.createdAt,
      user: db.users.find((u) => u.id === r.userId)?.fullName || "Khách VietTrails",
    }));
  return { data: { ...tourDetail(db, tour), departures, related, reviews } };
}, { name: "tour-detail" });

add("GET", "/tours/:id/departures", (ctx) => {
  const { db, params, query } = ctx;
  const tour = getTour(db, params.id);
  if (!tour) throw apiError("NOT_FOUND", 404, "Không tìm thấy tour.");
  if (tour.status !== "published") throw apiError("NOT_FOUND", 404, "Tour đang ẩn.");
  const from = query.from || todayVN();
  const to = query.to || addDays(todayVN(), 210);
  const rows = db.departures
    .filter((d) => d.tourId === tour.id && d.departureDate >= from && d.departureDate <= to && d.status !== "draft")
    .sort((a, b) => a.departureDate.localeCompare(b.departureDate))
    .map(publicDeparture);
  return { data: rows };
}, { name: "tour-departures" });

add("GET", "/departures/:id", (ctx) => {
  const { db, params } = ctx;
  const departure = getDeparture(db, params.id);
  if (!departure) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  const tour = getTour(db, departure.tourId);
  if (!tour || tour.status !== "published") throw apiError("NOT_FOUND", 404, "Tour đang ẩn.");
  return { data: { departure: publicDeparture(departure), tour: tourDetail(db, tour) } };
}, { name: "departure-lookup" });

add("GET", "/tours/:id/reviews", (ctx) => {
  const { db, params, query } = ctx;
  const { page, perPage } = parsePage(query, 5);
  const tour = getTour(db, params.id);
  if (!tour) throw apiError("NOT_FOUND", 404, "Không tìm thấy tour.");
  const rows = db.reviews
    .filter((r) => r.tourId === tour.id && r.status === "approved")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({
      id: r.id, rating: r.rating, comment: r.comment, reply: r.reply, createdAt: r.createdAt,
      user: db.users.find((u) => u.id === r.userId)?.fullName || "Khách VietTrails",
    }));
  const paged = paginate(rows, page, perPage);
  return { data: paged.rows, meta: paged.meta };
}, { name: "tour-reviews" });

add("GET", "/destinations", (ctx) => {
  const { db } = ctx;
  const rows = db.destinations.filter((d) => d.active).map((d) => {
    const tours = db.tours.filter((t) => t.destinationId === d.id && t.status === "published");
    return {
      ...d,
      tourCount: tours.length,
      cover: tours[0]?.cover || `art:${d.slug}`,
      priceFrom: tours.length ? Math.min(...tours.map((t) => tourCard(db, t).priceFrom).filter((n) => n !== null)) : null,
    };
  }).filter((d) => d.tourCount > 0);
  return { data: rows };
}, { name: "destinations" });

add("GET", "/destinations/:slug", (ctx) => {
  const { db, params } = ctx;
  const destination = db.destinations.find((d) => d.slug === params.slug && d.active);
  if (!destination) throw apiError("NOT_FOUND", 404, "Không tìm thấy điểm đến.");
  const tours = db.tours.filter((t) => t.destinationId === destination.id && t.status === "published").map((t) => tourCard(db, t));
  return { data: { ...destination, tours } };
}, { name: "destination-detail" });

add("GET", "/categories", (ctx) => {
  const { db } = ctx;
  const rows = db.categories.filter((c) => c.active).map((c) => ({
    ...c, tourCount: db.tours.filter((t) => t.categoryId === c.id && t.status === "published").length,
  }));
  return { data: rows };
}, { name: "categories" });

add("GET", "/categories/:slug", (ctx) => {
  const { db, params } = ctx;
  const category = db.categories.find((c) => c.slug === params.slug && c.active);
  if (!category) throw apiError("NOT_FOUND", 404, "Không tìm thấy danh mục.");
  const tours = db.tours.filter((t) => t.categoryId === category.id && t.status === "published").map((t) => tourCard(db, t));
  return { data: { ...category, tours } };
}, { name: "category-detail" });

add("GET", "/policies/:slug", (ctx) => {
  const page = ctx.db.contentPages.find((p) => p.slug === ctx.params.slug);
  if (!page) throw apiError("NOT_FOUND", 404, "Không tìm thấy trang.");
  return { data: page };
}, { name: "policy" });

add("POST", "/inquiries", (ctx) => {
  const { db, body, ip } = ctx;
  rateLimit(`inquiry:${ip}`, 8, 10 * 60 * 1000);
  if (body.website) return { data: { received: true } };
  const fields = {};
  const fullName = String(body.fullName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = normalizePhone(body.phone || "");
  const message = String(body.message || "").trim();
  if (fullName.length < 2 || fullName.length > 100) fields.fullName = "Họ tên từ 2 đến 100 ký tự.";
  if (!validateEmail(email)) fields.email = "Email chưa đúng định dạng.";
  if (phone && !validatePhone(phone)) fields.phone = "Số điện thoại chưa đúng định dạng.";
  if (message.length < 10 || message.length > 3000) fields.message = "Nội dung từ 10 đến 3000 ký tự.";
  if (Object.keys(fields).length) throw apiError("VALIDATION_ERROR", 422, "Vui lòng kiểm tra lại biểu mẫu.", fields);
  const ticket = tx((database) => {
    const id = (database._seq.tickets = (database._seq.tickets || 0) + 1);
    const slaHours = cfgNumber(database, "ticket.first_response_hours", 8);
    const row = {
      id, code: `INQ-${String(id).padStart(4, "0")}`, userId: ctx.user?.id || null,
      fullName, email, phone, subject: String(body.subject || "Yêu cầu tư vấn").slice(0, 200),
      message, bookingId: null,
      type: ["support", "complaint", "custom_tour"].includes(body.type) ? body.type : "custom_tour",
      status: "open", priority: body.type === "complaint" ? "high" : "normal",
      assignedTo: database.users.find((u) => u.roles.includes("sales"))?.id || null,
      slaDueAt: new Date(Date.now() + slaHours * 3600 * 1000).toISOString(),
      interestedTour: body.interestedTour ? String(body.interestedTour).slice(0, 200) : null,
      people: body.people ? Number(body.people) : null,
      expectedDate: body.expectedDate || null,
      budget: body.budget ? Number(body.budget) : null,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    database.tickets.push(row);
    database.ticketMessages.push({
      id: (database._seq.ticketMessages = (database._seq.ticketMessages || 0) + 1),
      ticketId: id, userId: ctx.user?.id || null, actorType: "customer", message, createdAt: nowIso(),
    });
    database.outbox.push({
      id: (database._seq.outbox = (database._seq.outbox || 0) + 1),
      to: email, subject: `VietTrails đã nhận yêu cầu ${row.code}`,
      body: "Cảm ơn bạn đã liên hệ. Chúng tôi sẽ phản hồi trong thời gian sớm nhất.",
      type: "inquiry_ack", status: "sent", attempts: 1, createdAt: nowIso(), sentAt: nowIso(),
    });
    return row;
  });
  return { data: { code: ticket.code, receivedAt: ticket.createdAt, responseWithinHours: cfgNumber(db, "ticket.first_response_hours", 8) } };
}, { name: "inquiry-create", rate: true });

/* ====================== AUTH ====================== */

add("POST", "/auth/register", (ctx) => {
  const { db, body, ip } = ctx;
  rateLimit(`register:${ip}`, 6, 15 * 60 * 1000);
  const fields = {};
  const fullName = String(body.fullName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = normalizePhone(body.phone || "");
  const password = String(body.password || "");
  if (fullName.length < 2 || fullName.length > 100) fields.fullName = "Họ tên từ 2 đến 100 ký tự.";
  if (!validateEmail(email)) fields.email = "Email chưa đúng định dạng.";
  if (phone && !validatePhone(phone)) fields.phone = "Số điện thoại chưa đúng định dạng.";
  if (password.length < 8) fields.password = "Mật khẩu tối thiểu 8 ký tự.";
  else if (isCommonPassword(password)) fields.password = "Mật khẩu quá phổ biến, vui lòng chọn mật khẩu khác.";
  if (!body.termsAccepted) fields.termsAccepted = "Bạn cần đồng ý điều khoản để đăng ký.";
  if (Object.keys(fields).length) throw apiError("VALIDATION_ERROR", 422, "Vui lòng kiểm tra lại biểu mẫu.", fields);
  if (db.users.some((u) => u.email === email)) throw apiError("EMAIL_TAKEN", 409, "Email này đã được đăng ký. Bạn thử đăng nhập nhé.");
  const result = tx((database) => {
    const user = {
      id: (database._seq.users = (database._seq.users || 0) + 1),
      fullName, email, phone: phone || null,
      passwordHash: hashPasswordValue(password), roles: ["customer"], emailVerifiedAt: null,
      status: "active", marketingConsent: Boolean(body.marketingConsent),
      failedLoginCount: 0, lockedUntil: null, mfaEnabled: false, mfaSecret: null, pendingMfaSecret: null,
      createdAt: nowIso(), termsVersion: cfg(database, "terms.version"),
    };
    database.users.push(user);
    const session = createSession(database, user, { ip, userAgent: ctx.ua });
    sendVerificationEmail(database, user);
    addAudit(database, {
      actorId: user.id, actorRole: "customer", action: "auth.register", entity: "user", entityId: user.id,
      before: null, after: { email: user.email }, ip, userAgent: ctx.ua,
    });
    return { user: sanitizeUser(database, user), accessToken: session.accessToken, refreshToken: session.refreshToken };
  });
  setRefreshCookie(ctx.res, result.refreshToken);
  return { data: { user: result.user, accessToken: result.accessToken, requiresVerification: true } };
}, { name: "register", rate: true });

function hashPasswordValue(password) {
  return hashPassword(password);
}

add("POST", "/auth/login", (ctx) => {
  const { db, body, ip } = ctx;
  rateLimit(`login:${ip}`, 50, 15 * 60 * 1000);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = db.users.find((u) => u.email === email);
  if (!user) {
    throw apiError("UNAUTHENTICATED", 401, "Email hoặc mật khẩu chưa đúng.");
  }
  if (user.status === "locked") {
    throw apiError("ACCOUNT_LOCKED", 423, "Tài khoản đang bị khóa. Vui lòng liên hệ hỗ trợ.");
  }
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    throw apiError("ACCOUNT_LOCKED", 423, "Tài khoản tạm khóa do nhập sai nhiều lần.", undefined, {
      lockedUntil: user.lockedUntil,
      remainingMinutes: Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000),
    });
  }
  if (!checkUserPassword(user, password)) {
    tx((database) => {
      const target = database.users.find((u) => u.id === user.id);
      target.failedLoginCount = (target.failedLoginCount || 0) + 1;
      if (target.failedLoginCount >= cfgNumber(database, "auth.max_failed_attempts", 5)) {
        target.lockedUntil = new Date(Date.now() + cfgNumber(database, "auth.lock_minutes", 15) * 60000).toISOString();
        target.failedLoginCount = 0;
      }
    });
    throw apiError("UNAUTHENTICATED", 401, "Email hoặc mật khẩu chưa đúng.");
  }
  if (user.mfaEnabled) {
    if (!body.totp) {
      throw apiError("VALIDATION_ERROR", 422, "Nhập mã xác thực hai yếu tố.", { totp: "Mã 2FA bắt buộc." }, { mfaRequired: true });
    }
    if (!verifyTotp(user.mfaSecret, body.totp)) {
      throw apiError("VALIDATION_ERROR", 422, "Mã xác thực hai yếu tố không đúng.", { totp: "Mã 2FA không đúng." }, { mfaRequired: true });
    }
  }
  const result = tx((database) => {
    const target = database.users.find((u) => u.id === user.id);
    target.failedLoginCount = 0;
    target.lockedUntil = null;
    const session = createSession(database, target, { ip, userAgent: ctx.ua });
    addAudit(database, {
      actorId: target.id, actorRole: target.roles[0], action: "auth.login", entity: "user", entityId: target.id,
      before: null, after: { ip }, ip, userAgent: ctx.ua,
    });
    return { user: sanitizeUser(database, target), accessToken: session.accessToken, refreshToken: session.refreshToken };
  });
  setRefreshCookie(ctx.res, result.refreshToken);
  return { data: { user: result.user, accessToken: result.accessToken, expiresIn: 900 } };
}, { name: "login", rate: true });

add("POST", "/auth/refresh", (ctx) => {
  const { db, req } = ctx;
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) throw apiError("UNAUTHENTICATED", 401, "Chưa có phiên đăng nhập.");
  const rotated = tx((database) => rotateRefresh(database, token, { ip: ctx.ip, userAgent: ctx.ua }));
  if (!rotated) {
    clearRefreshCookie(ctx.res);
    throw apiError("UNAUTHENTICATED", 401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }
  setRefreshCookie(ctx.res, rotated.refreshToken);
  return { data: { user: sanitizeUser(getDb(), rotated.user), accessToken: rotated.accessToken, expiresIn: 900 } };
}, { name: "refresh" });

add("POST", "/auth/logout", (ctx) => {
  const refresh = parseCookies(ctx.req)[COOKIE_NAME];
  const sid = refresh?.split(".")[0];
  if (sid) {
    tx((database) => revokeSession(database, sid));
  }
  clearRefreshCookie(ctx.res);
  return { data: { loggedOut: true } };
}, { name: "logout" });

add("POST", "/auth/logout-all", (ctx) => {
  const user = requireUser(ctx);
  tx((database) => revokeAllSessions(database, user.id));
  clearRefreshCookie(ctx.res);
  return { data: { loggedOutAll: true } };
}, { name: "logout-all" });

add("POST", "/auth/verify-email", (ctx) => {
  const token = String(ctx.body.token || "");
  const result = tx((database) => {
    const row = consumeAuthToken(database, token, ["verify", "email_change"]);
    if (!row) throw apiError("VALIDATION_ERROR", 422, "Liên kết xác minh không hợp lệ hoặc đã hết hạn.", { token: "Liên kết không còn hiệu lực." });
    const user = database.users.find((u) => u.id === row.userId);
    if (!user) throw apiError("NOT_FOUND", 404, "Không tìm thấy tài khoản.");
    if (row.purpose === "email_change" && row.newEmail) {
      if (database.users.some((u) => u.email === row.newEmail && u.id !== user.id)) {
        throw apiError("EMAIL_TAKEN", 409, "Email mới đã được sử dụng.");
      }
      user.email = row.newEmail;
    }
    user.emailVerifiedAt = user.emailVerifiedAt || nowIso();
    addAudit(database, {
      actorId: user.id, actorRole: "customer", action: "auth.verify_email", entity: "user", entityId: user.id,
      before: null, after: { email: user.email },
    });
    return { email: user.email };
  });
  return { data: { verified: true, email: result.email } };
}, { name: "verify-email" });

add("POST", "/auth/resend-verification", (ctx) => {
  const { db, body, ip } = ctx;
  rateLimit(`resend:${ip}`, 5, 15 * 60 * 1000);
  const email = String(body.email || "").trim().toLowerCase();
  const user = db.users.find((u) => u.email === email);
  if (user && !user.emailVerifiedAt) {
    tx((database) => {
      sendVerificationEmail(database, database.users.find((u) => u.id === user.id));
    });
  }
  return { data: { message: "Nếu email tồn tại và chưa xác minh, chúng tôi đã gửi lại liên kết." } };
}, { name: "resend-verification", rate: true });

add("POST", "/auth/forgot-password", (ctx) => {
  const { db, body, ip } = ctx;
  rateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000);
  const email = String(body.email || "").trim().toLowerCase();
  const user = db.users.find((u) => u.email === email && u.status === "active");
  if (user) {
    tx((database) => sendPasswordResetEmail(database, user));
  }
  return { data: { message: "Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu." } };
}, { name: "forgot-password", rate: true });

add("POST", "/auth/reset-password", (ctx) => {
  const token = String(ctx.body.token || "");
  const password = String(ctx.body.password || "");
  if (password.length < 8 || isCommonPassword(password)) {
    throw apiError("VALIDATION_ERROR", 422, "Mật khẩu mới chưa đạt yêu cầu.", {
      password: password.length < 8 ? "Mật khẩu tối thiểu 8 ký tự." : "Mật khẩu quá phổ biến.",
    });
  }
  const result = tx((database) => {
    const row = consumeAuthToken(database, token, ["reset", "invite"]);
    if (!row) throw apiError("VALIDATION_ERROR", 422, "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", { token: "Liên kết không còn hiệu lực." });
    const user = database.users.find((u) => u.id === row.userId);
    if (!user) throw apiError("NOT_FOUND", 404, "Không tìm thấy tài khoản.");
    user.passwordHash = hashPassword(password);
    if (row.purpose === "invite") {
      user.emailVerifiedAt = user.emailVerifiedAt || nowIso();
      user.status = "active";
    }
    revokeAllSessions(database, user.id);
    database.outbox.push({
      id: (database._seq.outbox = (database._seq.outbox || 0) + 1),
      to: user.email, subject: "Mật khẩu VietTrails đã được thay đổi",
      body: "Mật khẩu tài khoản của bạn vừa được thay đổi. Nếu không phải bạn, vui lòng liên hệ hotline ngay.",
      type: "password_changed", status: "sent", attempts: 1, createdAt: nowIso(), sentAt: nowIso(),
    });
    addAudit(database, {
      actorId: user.id, actorRole: "customer", action: "auth.reset_password", entity: "user", entityId: user.id,
      before: null, after: { sessionsRevoked: true },
    });
    return { email: user.email };
  });
  clearRefreshCookie(ctx.res);
  return { data: { reset: true, email: result.email } };
}, { name: "reset-password" });

add("GET", "/dev/outbox", (ctx) => {
  if (!isDev) throw apiError("NOT_FOUND", 404, "Không tìm thấy nội dung bạn yêu cầu.");
  return {
    data: ctx.db.outbox.slice(-30).reverse().map((mail) => ({
      id: mail.id, to: mail.to, subject: mail.subject, body: mail.body, link: mail.link,
      type: mail.type, createdAt: mail.createdAt,
    })),
  };
}, { name: "dev-outbox" });

/* ====================== ME ====================== */

add("GET", "/me", (ctx) => ({ data: { user: sanitizeUser(ctx.db, requireUser(ctx)) } }), { name: "me" });

add("PATCH", "/me", (ctx) => {
  const user = requireUser(ctx);
  const fields = {};
  const fullName = ctx.body.fullName !== undefined ? String(ctx.body.fullName).trim() : user.fullName;
  const phone = ctx.body.phone !== undefined ? normalizePhone(ctx.body.phone) : user.phone;
  if (fullName.length < 2 || fullName.length > 100) fields.fullName = "Họ tên từ 2 đến 100 ký tự.";
  if (phone && !validatePhone(phone)) fields.phone = "Số điện thoại chưa đúng định dạng.";
  if (Object.keys(fields).length) throw apiError("VALIDATION_ERROR", 422, "Vui lòng kiểm tra lại.", fields);
  tx((database) => {
    const target = database.users.find((u) => u.id === user.id);
    const before = { fullName: target.fullName, phone: target.phone, marketingConsent: target.marketingConsent };
    target.fullName = fullName;
    target.phone = phone || null;
    if (ctx.body.marketingConsent !== undefined) target.marketingConsent = Boolean(ctx.body.marketingConsent);
    addAudit(database, {
      actorId: user.id, actorRole: user.roles[0], action: "me.update", entity: "user", entityId: user.id,
      before, after: { fullName, phone: target.phone, marketingConsent: target.marketingConsent },
    });
  });
  return { data: { user: sanitizeUser(getDb(), getDb().users.find((u) => u.id === user.id)) } };
}, { name: "update-me" });

add("POST", "/me/password", (ctx) => {
  const user = requireUser(ctx);
  const currentPassword = String(ctx.body.currentPassword || "");
  const newPassword = String(ctx.body.newPassword || "");
  if (!checkUserPassword(user, currentPassword)) {
    throw apiError("VALIDATION_ERROR", 422, "Mật khẩu hiện tại chưa đúng.", { currentPassword: "Mật khẩu hiện tại chưa đúng." });
  }
  if (newPassword.length < 8 || isCommonPassword(newPassword)) {
    throw apiError("VALIDATION_ERROR", 422, "Mật khẩu mới chưa đạt yêu cầu.", {
      newPassword: newPassword.length < 8 ? "Mật khẩu tối thiểu 8 ký tự." : "Mật khẩu quá phổ biến.",
    });
  }
  tx((database) => {
    const target = database.users.find((u) => u.id === user.id);
    target.passwordHash = hashPassword(newPassword);
    for (const session of database.sessions) {
      if (session.userId === user.id && session.id !== ctx.session?.id && !session.revokedAt) session.revokedAt = nowIso();
    }
    addAudit(database, {
      actorId: user.id, actorRole: user.roles[0], action: "me.change_password", entity: "user", entityId: user.id,
      before: null, after: { sessionsRevoked: true },
    });
  });
  return { data: { changed: true } };
}, { name: "change-password" });

add("POST", "/me/email", (ctx) => {
  const user = requireUser(ctx);
  const password = String(ctx.body.password || "");
  const newEmail = String(ctx.body.newEmail || "").trim().toLowerCase();
  if (!checkUserPassword(user, password)) {
    throw apiError("VALIDATION_ERROR", 422, "Mật khẩu chưa đúng.", { password: "Mật khẩu chưa đúng." });
  }
  if (!validateEmail(newEmail)) throw apiError("VALIDATION_ERROR", 422, "Email mới chưa đúng.", { newEmail: "Email chưa đúng định dạng." });
  if (ctx.db.users.some((u) => u.email === newEmail && u.id !== user.id)) throw apiError("EMAIL_TAKEN", 409, "Email này đã được sử dụng.");
  tx((database) => {
    const token = createAuthToken(database, user.id, "email_change", {
      ttlMs: 24 * 3600 * 1000, email: user.email, newEmail,
    });
    database.outbox.push({
      id: (database._seq.outbox = (database._seq.outbox || 0) + 1),
      to: newEmail, subject: "Xác minh email mới VietTrails",
      body: "Nhấn vào liên kết để xác minh địa chỉ email mới.", link: `/verify-email?token=${token}&change=1`,
      type: "email_change", status: "sent", attempts: 1, createdAt: nowIso(), sentAt: nowIso(),
    });
  });
  return { data: { message: "Đã gửi liên kết xác minh tới email mới." } };
}, { name: "change-email" });

add("GET", "/me/sessions", (ctx) => {
  const user = requireUser(ctx);
  const rows = ctx.db.sessions
    .filter((s) => s.userId === user.id && !s.revokedAt)
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .map((s) => ({
      id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt, expiresAt: s.expiresAt, current: s.id === ctx.session?.id,
    }));
  return { data: rows };
}, { name: "my-sessions" });

add("DELETE", "/me/sessions/:id", (ctx) => {
  const user = requireUser(ctx);
  const ok = tx((database) => revokeSession(database, ctx.params.id, user.id));
  if (!ok) throw apiError("NOT_FOUND", 404, "Không tìm thấy phiên.");
  if (ctx.session?.id === ctx.params.id) clearRefreshCookie(ctx.res);
  return { data: { revoked: true } };
}, { name: "revoke-session" });

add("POST", "/me/sessions/revoke-all", (ctx) => {
  const user = requireUser(ctx);
  const count = tx((database) => revokeAllSessions(database, user.id));
  clearRefreshCookie(ctx.res);
  return { data: { revoked: count } };
}, { name: "revoke-all-sessions" });

add("POST", "/me/delete-request", (ctx) => {
  const user = requireUser(ctx);
  const active = ctx.db.bookings.some((b) => b.userId === user.id && ["pending", "confirmed"].includes(b.status));
  if (active) {
    throw apiError("HAS_DEPENDENCIES", 409, "Bạn còn đơn đang hiệu lực. Vui lòng hoàn tất hoặc hủy đơn trước khi yêu cầu xóa tài khoản.", undefined, {
      activeBookings: ctx.db.bookings.filter((b) => b.userId === user.id && ["pending", "confirmed"].includes(b.status)).map((b) => b.code),
    });
  }
  tx((database) => {
    const target = database.users.find((u) => u.id === user.id);
    target.deletionRequestedAt = nowIso();
    addAudit(database, {
      actorId: user.id, actorRole: "customer", action: "me.delete_request", entity: "user", entityId: user.id,
      before: null, after: { deletionRequestedAt: target.deletionRequestedAt },
    });
  });
  return { data: { message: "Yêu cầu xóa tài khoản đã được ghi nhận. Dữ liệu cá nhân sẽ được ẩn danh hoá trong 30 ngày, trừ dữ liệu tài chính phải lưu theo quy định." } };
}, { name: "delete-request" });

add("GET", "/me/mfa", (ctx) => {
  const user = requireUser(ctx);
  return { data: { enabled: Boolean(user.mfaEnabled) } };
}, { name: "mfa-status" });

add("POST", "/me/mfa/setup", (ctx) => {
  const user = requireUser(ctx);
  const secret = newTotpSecret();
  tx((database) => {
    database.users.find((u) => u.id === user.id).pendingMfaSecret = secret;
  });
  const label = encodeURIComponent(`VietTrails:${user.email}`);
  return {
    data: {
      secret,
      otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=VietTrails&algorithm=SHA1&digits=6&period=30`,
      codePreview: totpCode(secret),
    },
  };
}, { name: "mfa-setup" });

add("POST", "/me/mfa/enable", (ctx) => {
  const user = requireUser(ctx);
  const pending = ctx.db.users.find((u) => u.id === user.id)?.pendingMfaSecret;
  if (!pending) throw apiError("INVALID_STATE_TRANSITION", 409, "Chưa khởi tạo 2FA.");
  if (!verifyTotp(pending, ctx.body.code)) {
    throw apiError("VALIDATION_ERROR", 422, "Mã 2FA chưa đúng.", { code: "Nhập mã 6 chữ số từ ứng dụng xác thực." });
  }
  tx((database) => {
    const target = database.users.find((u) => u.id === user.id);
    target.mfaEnabled = true;
    target.mfaSecret = target.pendingMfaSecret;
    target.pendingMfaSecret = null;
    addAudit(database, {
      actorId: user.id, actorRole: user.roles[0], action: "me.mfa_enable", entity: "user", entityId: user.id,
      before: { mfaEnabled: false }, after: { mfaEnabled: true },
    });
  });
  return { data: { enabled: true } };
}, { name: "mfa-enable" });

add("POST", "/me/mfa/disable", (ctx) => {
  const user = requireUser(ctx);
  if (!checkUserPassword(user, ctx.body.password)) {
    throw apiError("VALIDATION_ERROR", 422, "Mật khẩu chưa đúng.", { password: "Mật khẩu chưa đúng." });
  }
  if (!verifyTotp(user.mfaSecret, ctx.body.code)) {
    throw apiError("VALIDATION_ERROR", 422, "Mã 2FA chưa đúng.", { code: "Nhập mã 6 chữ số từ ứng dụng xác thực." });
  }
  tx((database) => {
    const target = database.users.find((u) => u.id === user.id);
    target.mfaEnabled = false;
    target.mfaSecret = null;
    addAudit(database, {
      actorId: user.id, actorRole: user.roles[0], action: "me.mfa_disable", entity: "user", entityId: user.id,
      before: { mfaEnabled: true }, after: { mfaEnabled: false },
    });
  });
  return { data: { enabled: false } };
}, { name: "mfa-disable" });

add("GET", "/me/notifications", (ctx) => {
  const user = requireUser(ctx);
  const rows = ctx.db.notifications
    .filter((n) => n.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);
  return { data: rows, meta: { unread: rows.filter((n) => !n.readAt).length } };
}, { name: "my-notifications" });

add("POST", "/me/notifications/read", (ctx) => {
  const user = requireUser(ctx);
  tx((database) => {
    for (const n of database.notifications) {
      if (n.userId === user.id && !n.readAt) n.readAt = nowIso();
    }
  });
  return { data: { read: true } };
}, { name: "read-notifications" });

/* ====================== QUOTE & BOOKINGS ====================== */

add("POST", "/bookings/quote", (ctx) => {
  const { db, body } = ctx;
  const departure = getDeparture(db, body.departureId);
  if (!departure) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  const tour = getTour(db, departure.tourId);
  if (tour.status !== "published") throw apiError("NOT_FOUND", 404, "Tour đang ẩn.");
  const quote = computeQuote(db, {
    tour, departure,
    input: {
      adults: body.adults, children: body.children, infants: body.infants, singles: body.singles,
      couponCode: body.couponCode, passengerDobs: body.passengerDobs,
    },
    userId: ctx.user?.id || null,
  });
  return { data: { ...quote, serverTime: nowIso() } };
}, { name: "quote" });

add("POST", "/bookings", (ctx) => {
  const user = requireEmailVerified(ctx);
  const { body } = ctx;
  const idempotencyKey = String(ctx.req.headers["idempotency-key"] || body.idempotencyKey || "").trim();
  if (idempotencyKey.length < 8) {
    throw apiError("VALIDATION_ERROR", 422, "Thiếu khóa chống trùng cho yêu cầu đặt chỗ.", { idempotencyKey: "Idempotency-Key bắt buộc." });
  }
  if (!body.termsAccepted) {
    throw apiError("VALIDATION_ERROR", 422, "Bạn cần đồng ý điều khoản và chính sách hủy.", { termsAccepted: "Bắt buộc đồng ý." });
  }
  const termsVersion = String(body.termsVersion || "");
  if (termsVersion !== String(cfg(ctx.db, "terms.version"))) {
    throw apiError("VALIDATION_ERROR", 422, "Điều khoản đã được cập nhật, vui lòng tải lại trang.", { termsVersion: "Phiên bản điều khoản không khớp." });
  }
  const contact = validateContact(body.contact);
  const departureId = Number(body.departureId);
  if (!departureId) throw apiError("VALIDATION_ERROR", 422, "Chọn lịch khởi hành.", { departureId: "Bắt buộc." });
  const initialDeparture = getDeparture(ctx.db, departureId);
  if (!initialDeparture) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  const initialTour = getTour(ctx.db, initialDeparture.tourId);
  const passengers = validatePassengers(ctx.db, initialTour, initialDeparture, body.passengers);
  const dobs = passengers.map((p) => p.dateOfBirth);
  const payloadHash = sha256(stableStringify({
    departureId, contact, passengers, couponCode: normalizeCoupon(body.couponCode),
    continueExisting: Boolean(body.continueExisting), paymentPurpose: body.payment?.purpose || "deposit",
  }));

  const result = tx((database) => {
    // idempotency
    const existingKey = database.idempotency.find((row) => row.key === idempotencyKey && row.userId === user.id);
    if (existingKey) {
      if (existingKey.payloadHash !== payloadHash) {
        throw apiError("IDEMPOTENCY_CONFLICT", 409, "Yêu cầu này không khớp với yêu cầu trước đó. Vui lòng tải lại trang.");
      }
      return { ...deepClone(existingKey.response), replayed: true };
    }
    const currentUser = database.users.find((u) => u.id === user.id);
    if (!currentUser.emailVerifiedAt) throw apiError("EMAIL_NOT_VERIFIED", 403, "Vui lòng xác minh email trước khi đặt tour.");
    const departure = getDeparture(database, departureId);
    const tour = getTour(database, departure.tourId);
    if (!["open", "full"].includes(departure.status)) {
      throw apiError("DEPARTURE_CLOSED", 409, "Chuyến này đã đóng bán.", undefined, { status: departure.status });
    }
    if (departure.bookingCutoffAt && new Date(departure.bookingCutoffAt).getTime() < Date.now()) {
      throw apiError("DEPARTURE_CLOSED", 409, "Chuyến này đã đóng bán.");
    }
    const classes = dobs.map((dob) => classifyDob(dob, departure.departureDate, tour.ageInfantMax, tour.ageChildMax));
    const adults = classes.filter((c) => c === "adult").length;
    const children = classes.filter((c) => c === "child").length;
    const infants = classes.filter((c) => c === "infant").length;
    if (adults < 1) throw apiError("VALIDATION_ERROR", 422, "Cần ít nhất một hành khách là người lớn.", { passengers: "Cần người lớn đi cùng." });
    const quote = computeQuote(database, {
      tour, departure,
      input: { adults, children, infants, singles: body.singles || 0, couponCode: body.couponCode, passengerDobs: dobs },
      userId: user.id,
    });
    const pending = database.bookings.find((b) => b.userId === user.id && b.departureId === departure.id && b.status === "pending");
    if (pending && !body.continueExisting) {
      throw apiError("VALIDATION_ERROR", 422, "Bạn đang có một đơn chờ thanh toán cho chuyến này.", {
        duplicate: "Tiếp tục đơn cũ hoặc hủy đơn cũ trước khi tạo đơn mới.",
      }, { existingPending: { code: pending.code, holdExpiresAt: pending.holdExpiresAt }, code: "DUPLICATE_PENDING" });
    }
    if (departure.seatsTaken + quote.seatsRequired > departure.capacity) {
      throw apiError("SEAT_UNAVAILABLE", 409, `Rất tiếc, chuyến này chỉ còn ${departure.capacity - departure.seatsTaken} chỗ.`, undefined, {
        seatsLeft: departure.capacity - departure.seatsTaken,
      });
    }
    const code = uniqueBookingCode(database);
    const booking = {
      id: (database._seq.bookings = (database._seq.bookings || 0) + 1),
      code, userId: user.id, departureId: departure.id,
      contactName: contact.fullName, contactEmail: contact.email, contactPhone: contact.phone,
      adults: quote.adults, children: quote.children, infants: quote.infants, singles: quote.singles,
      priceSnapshot: quote.lines, subtotal: quote.subtotal, discountTotal: quote.discountTotal,
      couponCode: quote.coupon?.valid ? quote.coupon.code : null,
      totalPrice: quote.total, depositRequired: quote.deposit.amount,
      paidAmount: 0, refundedAmount: 0, balanceDueDate: quote.balanceDueDate,
      status: "pending", paymentStatus: "unpaid",
      holdExpiresAt: holdExpiryFor(database, departure),
      channel: "web", createdByUserId: user.id, customerNote: body.customerNote ? String(body.customerNote).slice(0, 500) : null,
      internalNote: null, cancelBy: null, cancelReasonCode: null, cancelledAt: null,
      termsVersion, changeCount: 0, version: 1, createdAt: nowIso(), updatedAt: nowIso(),
      paymentPurpose: quote.fullPaymentRequired ? "full" : (body.payment?.purpose === "full" ? "full" : "deposit"),
    };
    database.bookings.push(booking);
    departure.seatsTaken += quote.seatsRequired;
    if (departure.seatsTaken >= departure.capacity) departure.status = "full";
    if (departure.seatsTaken >= departure.minPaxToRun) departure.isGuaranteed = true;
    departure.version = (departure.version || 1) + 1;
    let remainingInfants = quote.infants;
    for (const [index, p] of passengers.entries()) {
      let type = classes[index];
      if (type === "infant" && remainingInfants > 0) remainingInfants -= 1;
      else if (type === "infant") type = "child";
      database.passengers.push({
        id: (database._seq.passengers = (database._seq.passengers || 0) + 1),
        bookingId: booking.id, ...p,
        type,
      });
    }
    if (quote.coupon?.valid) {
      const coupon = database.coupons.find((c) => c.code === quote.coupon.code);
      coupon.usedCount = (coupon.usedCount || 0) + 1;
      database.couponUsages.push({
        id: (database._seq.couponUsages = (database._seq.couponUsages || 0) + 1),
        couponId: coupon.id, userId: user.id, bookingId: booking.id,
        discountAmount: quote.discountTotal, usedAt: nowIso(), voidedAt: null,
      });
    }
    addHistory(database, booking.id, null, "pending", {
      actorType: "customer", actorId: user.id, note: "Khách tạo đơn trên website",
    });
    notify(database, {
      userId: user.id, type: "booking.created",
      title: `Đã nhận đơn ${booking.code}`,
      content: `Chỗ của bạn được giữ đến ${new Date(booking.holdExpiresAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}. Vui lòng hoàn tất thanh toán để xác nhận.`,
      email: contact.email, link: `/booking/${booking.code}/pay`, priority: "high",
    });
    addAudit(database, {
      actorId: user.id, actorRole: "customer", action: "booking.create", entity: "booking", entityId: booking.code,
      before: null, after: { departureId: departure.id, total: booking.totalPrice, adults, children, infants },
      ip: ctx.ip, userAgent: ctx.ua,
    });
    const response = {
      code: booking.code,
      booking: publicBookingDetail(database, booking, currentUser),
      quote,
      serverTime: nowIso(),
    };
    database.idempotency.push({
      id: (database._seq.idempotency = (database._seq.idempotency || 0) + 1),
      key: idempotencyKey, userId: user.id, payloadHash, response: deepClone(response), createdAt: nowIso(),
    });
    return response;
  });
  return { data: result };
}, { name: "create-booking", verified: true });

function classifyDob(dob, departureDate, infantMax, childMax) {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = departureDate.split("-").map(Number);
  const age = y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
  return age < infantMax ? "infant" : age < childMax ? "child" : "adult";
}

function uniqueBookingCode(db) {
  for (let i = 0; i < 20; i++) {
    const code = bookingCode();
    if (!db.bookings.some((b) => b.code === code)) return code;
  }
  return `${bookingCode()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

add("GET", "/me/bookings", (ctx) => {
  const user = requireUser(ctx);
  const { query } = ctx;
  const { page, perPage } = parsePage(query, 10);
  let rows = ctx.db.bookings.filter((b) => b.userId === user.id);
  if (query.status) rows = rows.filter((b) => b.status === query.status);
  if (query.q) {
    const q = normalizeText(query.q);
    rows = rows.filter((b) => normalizeText(b.code).includes(q)
      || normalizeText(getTour(ctx.db, getDeparture(ctx.db, b.departureId)?.tourId)?.name || "").includes(q));
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paged = paginate(rows, page, perPage);
  return {
    data: paged.rows.map((b) => bookingRow(ctx.db, b, user)),
    meta: { ...paged.meta, serverTime: nowIso() },
  };
}, { name: "my-bookings" });

add("GET", "/me/bookings/:code", (ctx) => {
  const user = requireUser(ctx);
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking || booking.userId !== user.id) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  return { data: publicBookingDetail(ctx.db, booking, user) };
}, { name: "my-booking-detail" });

add("GET", "/me/bookings/:code/cancellation-quote", (ctx) => {
  const user = requireUser(ctx);
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking || booking.userId !== user.id) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  const departure = getDeparture(ctx.db, booking.departureId);
  const tour = getTour(ctx.db, departure.tourId);
  return { data: computeCancellationQuote(ctx.db, { booking, departure, tour }) };
}, { name: "cancellation-quote" });

add("POST", "/me/bookings/:code/change-quote", (ctx) => {
  const user = requireUser(ctx);
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking || booking.userId !== user.id) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  const departure = getDeparture(ctx.db, booking.departureId);
  const tour = getTour(ctx.db, departure.tourId);
  const newDeparture = getDeparture(ctx.db, ctx.body.newDepartureId);
  if (!newDeparture || newDeparture.tourId !== tour.id) {
    throw apiError("VALIDATION_ERROR", 422, "Chọn lịch khác cùng tour.", { newDepartureId: "Không hợp lệ." });
  }
  return { data: computeChangeQuote(ctx.db, { booking, oldDeparture: departure, tour, newDeparture }) };
}, { name: "change-quote" });

add("POST", "/me/bookings/:code/cancel", (ctx) => {
  const user = requireUser(ctx);
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking || booking.userId !== user.id) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  const reasonCode = ["customer_request", "other", "duplicate"].includes(ctx.body.reasonCode) ? ctx.body.reasonCode : "customer_request";
  const note = ctx.body.note ? String(ctx.body.note).slice(0, 500) : null;
  if (!ctx.body.confirm) throw apiError("VALIDATION_ERROR", 422, "Vui lòng xác nhận hủy đơn.", { confirm: "Bắt buộc." });
  const departure = getDeparture(ctx.db, booking.departureId);
  const tour = getTour(ctx.db, departure.tourId);
  const quote = computeCancellationQuote(ctx.db, { booking, departure, tour });
  if (quote.requiresApproval) {
    const request = tx((database) => {
      if (database.changeRequests.some((c) => c.bookingId === booking.id && c.type === "cancel" && c.status === "submitted")) {
        throw apiError("INVALID_STATE_TRANSITION", 409, "Đã có yêu cầu hủy đang chờ duyệt.");
      }
      const row = {
        id: (database._seq.changeRequests = (database._seq.changeRequests || 0) + 1),
        bookingId: booking.id, type: "cancel", payload: { reasonCode, note }, feeQuote: quote,
        status: "submitted", requestedBy: user.id, decidedBy: null, decisionNote: null,
        createdAt: nowIso(), updatedAt: nowIso(),
      };
      database.changeRequests.push(row);
      notify(database, {
        userId: user.id, type: "booking.cancel_requested",
        title: `Đã gửi yêu cầu hủy đơn ${booking.code}`,
        content: "Yêu cầu đang chờ nhân viên duyệt. Chúng tôi sẽ thông báo khi có kết quả.",
        email: booking.contactEmail, link: `/account/bookings/${booking.code}`,
      });
      for (const staff of database.users.filter((u) => u.roles.includes("sales") || u.roles.includes("tour_manager"))) {
        notify(database, {
          userId: staff.id, type: "staff.cancel_request", title: `Yêu cầu hủy chờ duyệt — ${booking.code}`,
          content: `${quote.daysToDeparture} ngày tới khởi hành, phí ${quote.feePercent}%.`,
          link: `/admin/bookings/${booking.code}`, priority: "high",
        });
      }
      return row;
    });
    return { data: { requiresApproval: true, request, quote } };
  }
  const result = tx((database) => {
    const current = database.bookings.find((b) => b.id === booking.id);
    return cancelBookingNow(database, current, {
      cancelBy: "customer", reasonCode, note, actorId: user.id, actorType: "customer",
    });
  });
  return { data: { cancelled: true, booking: publicBookingDetail(getDb(), result.booking, user), quote: result.quote, refund: result.refund } };
}, { name: "customer-cancel" });

add("POST", "/me/bookings/:code/change-request", (ctx) => {
  const user = requireUser(ctx);
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking || booking.userId !== user.id) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  const departure = getDeparture(ctx.db, booking.departureId);
  const tour = getTour(ctx.db, departure.tourId);
  const newDeparture = getDeparture(ctx.db, ctx.body.newDepartureId);
  if (!newDeparture || newDeparture.tourId !== tour.id) {
    throw apiError("VALIDATION_ERROR", 422, "Chọn lịch khác cùng tour.", { newDepartureId: "Không hợp lệ." });
  }
  const quote = computeChangeQuote(ctx.db, { booking, oldDeparture: departure, tour, newDeparture });
  const request = tx((database) => {
    if (database.changeRequests.some((c) => c.bookingId === booking.id && c.status === "submitted")) {
      throw apiError("INVALID_STATE_TRANSITION", 409, "Đã có yêu cầu thay đổi đang chờ duyệt.");
    }
    const row = {
      id: (database._seq.changeRequests = (database._seq.changeRequests || 0) + 1),
      bookingId: booking.id, type: "change_date",
      payload: { newDepartureId: newDeparture.id, from: departure.departureDate, to: newDeparture.departureDate },
      feeQuote: quote, status: "submitted", requestedBy: user.id, decidedBy: null, decisionNote: null,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    database.changeRequests.push(row);
    notify(database, {
      userId: user.id, type: "booking.change_requested",
      title: `Đã gửi yêu cầu đổi ngày đơn ${booking.code}`,
      content: `Chuyến mới ${newDeparture.departureDate.split("-").reverse().join("/")}. Yêu cầu đang chờ duyệt.`,
      email: booking.contactEmail, link: `/account/bookings/${booking.code}`,
    });
    for (const staff of database.users.filter((u) => u.roles.includes("sales") || u.roles.includes("tour_manager"))) {
      notify(database, {
        userId: staff.id, type: "staff.change_request", title: `Yêu cầu đổi ngày chờ duyệt — ${booking.code}`,
        content: `Từ ${departure.departureDate} sang ${newDeparture.departureDate}, phí ${quote.fee.toLocaleString("vi-VN")} đ.`,
        link: `/admin/bookings/${booking.code}`,
      });
    }
    return row;
  });
  return { data: { request, quote } };
}, { name: "customer-change-request" });

add("PATCH", "/me/bookings/:code/passengers", (ctx) => {
  const user = requireUser(ctx);
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking || booking.userId !== user.id) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  if (!["pending", "confirmed"].includes(booking.status)) throw apiError("INVALID_STATE_TRANSITION", 409, "Đơn không thể sửa hành khách.");
  const departure = getDeparture(ctx.db, booking.departureId);
  const tour = getTour(ctx.db, departure.tourId);
  const days = (new Date(departure.departureDate).getTime() - new Date(todayVN()).getTime()) / 86400000;
  if (days < cfgNumber(ctx.db, "passenger.edit_cutoff_days", 3)) {
    throw apiError("CANCEL_NOT_ALLOWED", 409, "Đã quá hạn tự sửa thông tin hành khách. Vui lòng liên hệ hỗ trợ.");
  }
  const incoming = ctx.body.passengers;
  if (!Array.isArray(incoming) || incoming.length !== ctx.db.passengers.filter((p) => p.bookingId === booking.id).length) {
    throw apiError("VALIDATION_ERROR", 422, "Danh sách hành khách không khớp.", { passengers: "Số lượng không đổi." });
  }
  const current = ctx.db.passengers.filter((p) => p.bookingId === booking.id);
  const fields = {};
  const updates = incoming.map((p, index) => {
    const base = current[index];
    const dob = String(p.dateOfBirth || base.dateOfBirth);
    const type = classifyDob(dob, departure.departureDate, tour.ageInfantMax, tour.ageChildMax);
    if (type !== base.type) fields[`passengers.${index}.dateOfBirth`] = "Thay đổi ngày sinh làm đổi loại khách; vui lòng gửi yêu cầu đổi số khách.";
    if (p.fullName !== undefined && (String(p.fullName).trim().length < 2 || String(p.fullName).trim().length > 100)) {
      fields[`passengers.${index}.fullName`] = "Họ tên từ 2 đến 100 ký tự.";
    }
    return { ...p, dateOfBirth: dob, type };
  });
  if (Object.keys(fields).length) throw apiError("VALIDATION_ERROR", 422, "Không thể cập nhật hành khách.", fields);
  tx((database) => {
    const rows = database.passengers.filter((p) => p.bookingId === booking.id);
    updates.forEach((p, index) => {
      const target = rows[index];
      target.fullName = p.fullName !== undefined ? String(p.fullName).trim() : target.fullName;
      target.gender = ["male", "female", "other"].includes(p.gender) ? p.gender : target.gender;
      target.idNumber = p.idNumber !== undefined ? (String(p.idNumber).replace(/\s/g, "").toUpperCase() || null) : target.idNumber;
      target.passportNumber = p.passportNumber !== undefined ? (String(p.passportNumber).replace(/\s/g, "").toUpperCase() || null) : target.passportNumber;
      target.nationality = p.nationality !== undefined ? String(p.nationality).slice(0, 60) : target.nationality;
      target.specialRequest = p.specialRequest !== undefined ? (String(p.specialRequest).slice(0, 300) || null) : target.specialRequest;
    });
    const dbBooking = database.bookings.find((b) => b.id === booking.id);
    dbBooking.version = (dbBooking.version || 1) + 1;
    dbBooking.updatedAt = nowIso();
    addHistory(database, booking.id, booking.status, booking.status, {
      actorType: "customer", actorId: user.id, note: "Cập nhật thông tin hành khách",
    });
    addAudit(database, {
      actorId: user.id, actorRole: "customer", action: "booking.passengers.update", entity: "booking", entityId: booking.code,
      before: { count: current.length }, after: { count: updates.length },
    });
  });
  return { data: publicBookingDetail(getDb(), getDb().bookings.find((b) => b.id === booking.id), user) };
}, { name: "update-passengers" });

add("POST", "/me/bookings/:code/invoice", (ctx) => {
  const user = requireUser(ctx);
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking || booking.userId !== user.id) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  if (!["confirmed", "completed"].includes(booking.status)) {
    throw apiError("INVALID_STATE_TRANSITION", 409, "Đơn chưa đủ điều kiện yêu cầu hóa đơn.");
  }
  const departure = getDeparture(ctx.db, booking.departureId);
  if (booking.status === "completed") {
    const deadline = addDays(departure.returnDate, cfgNumber(ctx.db, "invoice.request_deadline_days", 7));
    if (todayVN() > deadline) throw apiError("CANCEL_NOT_ALLOWED", 409, "Đã quá hạn yêu cầu hóa đơn cho chuyến này.");
  }
  if (ctx.db.invoices.some((i) => i.bookingId === booking.id)) {
    throw apiError("INVALID_STATE_TRANSITION", 409, "Đơn này đã có yêu cầu hóa đơn.");
  }
  const fields = {};
  const taxCode = String(ctx.body.taxCode || "").trim();
  const companyName = String(ctx.body.companyName || "").trim();
  const address = String(ctx.body.address || "").trim();
  const email = String(ctx.body.email || "").trim().toLowerCase();
  if (!/^\d{10}(-\d{3})?$/.test(taxCode)) fields.taxCode = "Mã số thuế gồm 10 chữ số, hoặc 13 ký tự dạng 10-3.";
  if (companyName.length < 2) fields.companyName = "Nhập tên công ty.";
  if (address.length < 5) fields.address = "Nhập địa chỉ.";
  if (!validateEmail(email)) fields.email = "Email nhận hóa đơn chưa đúng.";
  if (Object.keys(fields).length) throw apiError("VALIDATION_ERROR", 422, "Vui lòng kiểm tra thông tin hóa đơn.", fields);
  const invoice = tx((database) => {
    const row = {
      id: (database._seq.invoices = (database._seq.invoices || 0) + 1),
      bookingId: booking.id, taxCode, companyName, address, email,
      invoiceNo: null, issuedAt: null, status: "requested", requestedAt: nowIso(),
      note: null,
    };
    database.invoices.push(row);
    for (const staff of database.users.filter((u) => u.roles.includes("accountant"))) {
      notify(database, {
        userId: staff.id, type: "invoice.requested", title: `Yêu cầu hóa đơn mới — ${booking.code}`,
        content: `${companyName} · MST ${taxCode}`, link: "/admin/invoices", priority: "high",
      });
    }
    addHistory(database, booking.id, booking.status, booking.status, {
      actorType: "customer", actorId: user.id, note: "Yêu cầu xuất hóa đơn",
    });
    return row;
  });
  return { data: invoice };
}, { name: "request-invoice" });

add("POST", "/me/bookings/:code/review", (ctx) => {
  const user = requireUser(ctx);
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking || booking.userId !== user.id) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  const departure = getDeparture(ctx.db, booking.departureId);
  if (booking.status !== "completed") throw apiError("INVALID_STATE_TRANSITION", 409, "Chỉ đánh giá sau khi chuyến kết thúc.");
  if (new Date(departure.returnDate).getTime() > Date.now()) throw apiError("INVALID_STATE_TRANSITION", 409, "Chuyến chưa kết thúc.");
  const days = Math.floor((new Date(todayVN()).getTime() - new Date(departure.returnDate).getTime()) / 86400000);
  if (days > cfgNumber(ctx.db, "review.window_days", 60)) throw apiError("CANCEL_NOT_ALLOWED", 409, "Đã quá hạn gửi đánh giá.");
  if (ctx.db.reviews.some((r) => r.bookingId === booking.id)) throw apiError("INVALID_STATE_TRANSITION", 409, "Đơn này đã được đánh giá.");
  const rating = Number(ctx.body.rating);
  const comment = String(ctx.body.comment || "").trim();
  const fields = {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fields.rating = "Chọn từ 1 đến 5 sao.";
  if (comment.length < 20) fields.comment = "Nhận xét tối thiểu 20 ký tự.";
  if (Object.keys(fields).length) throw apiError("VALIDATION_ERROR", 422, "Vui lòng kiểm tra đánh giá.", fields);
  const review = tx((database) => {
    const row = {
      id: (database._seq.reviews = (database._seq.reviews || 0) + 1),
      bookingId: booking.id, tourId: departure.tourId, userId: user.id,
      rating, comment, status: "pending", reply: null, createdAt: nowIso(), approvedAt: null, approvedBy: null,
    };
    database.reviews.push(row);
    for (const staff of database.users.filter((u) => u.roles.includes("content_editor"))) {
      notify(database, {
        userId: staff.id, type: "review.pending", title: "Đánh giá mới chờ duyệt",
        content: `${rating} sao cho tour ${getTour(database, departure.tourId)?.name}`, link: "/admin/reviews",
      });
    }
    return row;
  });
  return { data: review };
}, { name: "create-review" });

add("GET", "/me/bookings/:code/voucher", (ctx) => {
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  const user = ctx.user || userFromRefresh(ctx.db, ctx.req)?.user;
  if (!user) throw apiError("UNAUTHENTICATED", 401, "Vui lòng đăng nhập.");
  const isOwner = booking.userId === user.id;
  const isStaff = hasPermission(user, "booking:read") && !user.roles.includes("guide");
  if (!isOwner && !isStaff) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  if (!["confirmed", "completed"].includes(booking.status)) {
    throw apiError("INVALID_STATE_TRANSITION", 409, "Voucher chỉ có sau khi đơn được xác nhận.");
  }
  const fullDocuments = isStaff && hasPermission(user, "export:pii") && ctx.query.full === "1";
  if (fullDocuments) {
    tx((database) => addAudit(database, {
      actorId: user.id, actorRole: user.roles[0], action: "voucher.export_full", entity: "booking", entityId: booking.code,
      before: null, after: { fullDocuments: true }, ip: ctx.ip, userAgent: ctx.ua,
    }));
  }
  return {
    data: {
      html: voucherHtml(ctx.db, booking, { fullDocuments }),
      filename: `Voucher${booking.code}.html`,
    },
  };
}, { name: "voucher" });

/* ====================== PAYMENTS ====================== */

add("POST", "/bookings/:code/payments", (ctx) => {
  const booking = getBooking(ctx.db, ctx.params.code);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  const owner = ctx.user && booking.userId === ctx.user.id;
  const staff = ctx.user && hasPermission(ctx.user, "payment:confirm");
  if (!owner && !staff) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  if (!["pending", "confirmed"].includes(booking.status)) {
    throw apiError("HOLD_EXPIRED", 409, "Đơn không còn ở trạng thái có thể thanh toán.", undefined, { status: booking.status });
  }
  const gross = grossPaidAmount(ctx.db, booking.id);
  if (gross >= booking.totalPrice) throw apiError("PAYMENT_ALREADY_SETTLED", 409, "Đơn này đã được thanh toán đủ.");
  let purpose = ["deposit", "balance", "full"].includes(ctx.body.purpose) ? ctx.body.purpose : (booking.status === "pending" ? "deposit" : "balance");
  const fullRequired = Boolean(ctx.db.departures.length
    && addDays(todayVN(), cfgNumber(ctx.db, "payment.full_required_days", 7)) >= getDeparture(ctx.db, booking.departureId).departureDate);
  if (fullRequired && purpose === "deposit") purpose = "full";
  let amount = purpose === "deposit"
    ? Math.max(0, booking.depositRequired - gross)
    : booking.totalPrice - gross;
  if (purpose === "deposit" && amount <= 0) amount = booking.totalPrice - gross;
  if (amount <= 0) throw apiError("PAYMENT_ALREADY_SETTLED", 409, "Đơn này đã được thanh toán đủ.");
  const method = String(ctx.body.method || "");
  const methodSettings = {
    vnpay: "payment.vnpay_enabled", momo: "payment.momo_enabled", zalopay: "payment.zalopay_enabled",
    bank_transfer: "payment.bank_transfer_enabled",
  };
  const isOnline = ["vnpay", "momo", "zalopay"].includes(method);
  const isCash = ["cash", "pos_card"].includes(method);
  if (!isOnline && method !== "bank_transfer" && !isCash) {
    throw apiError("VALIDATION_ERROR", 422, "Phương thức thanh toán không hợp lệ.", { method: "Chọn phương thức khác." });
  }
  if (methodSettings[method] && !cfg(ctx.db, methodSettings[method])) {
    throw apiError("VALIDATION_ERROR", 422, "Phương thức này đang bảo trì.", { method: "Vui lòng chọn phương thức khác." });
  }
  if (isCash && !staff) throw apiError("FORBIDDEN", 403, "Chỉ nhân viên được ghi nhận tiền mặt/POS.");
  const result = tx((database) => {
    const current = database.bookings.find((b) => b.id === booking.id);
    const currentGross = grossPaidAmount(database, booking.id);
    if (currentGross >= current.totalPrice) throw apiError("PAYMENT_ALREADY_SETTLED", 409, "Đơn này đã được thanh toán đủ.");
    const payment = {
      id: (database._seq.payments = (database._seq.payments || 0) + 1),
      bookingId: booking.id, purpose, method,
      provider: isOnline ? method : method === "bank_transfer" ? "vietqr" : "counter",
      amount: sanitizeMoney(amount), currency: "VND", status: "initiated",
      providerTxnId: null, merchantRef: `VT-${booking.code}-${Date.now().toString(36).toUpperCase()}`,
      idempotencyKey: crypto.randomUUID(), paidAt: null, proofUrl: null,
      confirmedBy: null, note: null, rawPayload: null, flag: null,
      reconciledAt: null, createdAt: nowIso(), updatedAt: nowIso(),
    };
    database.payments.push(payment);
    if (current.status === "pending" && isOnline) {
      const minHold = new Date(Date.now() + cfgNumber(database, "hold.min_payment_minutes", 30) * 60000);
      if (!current.holdExpiresAt || new Date(current.holdExpiresAt) < minHold) {
        current.holdExpiresAt = minHold.toISOString();
      }
    }
    if (isCash) {
      const applied = applyPaymentSuccess(database, payment, {
        providerTxnId: `CASH-${payment.id}`, actorId: ctx.user?.id, source: "counter",
      });
      return { payment: applied.payment, booking: publicBookingDetail(database, current, ctx.user), settled: true };
    }
    return {
      payment,
      gatewayUrl: isOnline ? `/payment/gateway/${payment.merchantRef}` : null,
      bankInfo: method === "bank_transfer" ? {
        bank: cfg(database, "bank.name"), bin: cfg(database, "bank.bin") || "970407",
        accountName: cfg(database, "bank.accountName"),
        accountNumber: cfg(database, "bank.accountNumber"), branch: cfg(database, "bank.branch"),
        amount: payment.amount, content: booking.code,
      } : null,
    };
  });
  return { data: result };
}, { name: "initiate-payment" });

add("POST", "/payments/:id/proof", (ctx) => {
  const user = requireUser(ctx);
  const payment = ctx.db.payments.find((p) => p.id === Number(ctx.params.id));
  if (!payment) throw apiError("NOT_FOUND", 404, "Không tìm thấy giao dịch.");
  const booking = ctx.db.bookings.find((b) => b.id === payment.bookingId);
  if (!booking || booking.userId !== user.id) throw apiError("NOT_FOUND", 404, "Không tìm thấy giao dịch.");
  if (payment.method !== "bank_transfer") throw apiError("VALIDATION_ERROR", 422, "Chỉ chuyển khoản mới cần chứng từ.");
  if (payment.status === "succeeded") throw apiError("PAYMENT_ALREADY_SETTLED", 409, "Giao dịch đã hoàn tất.");
  const proof = String(ctx.body.proofUrl || "");
  const match = /^data:image\/(png|jpe?g|webp);base64,/.exec(proof);
  if (!match) throw apiError("VALIDATION_ERROR", 422, "Chứng từ phải là ảnh PNG/JPG/WEBP.", { proofUrl: "Chọn ảnh hợp lệ." });
  if (proof.length > 3 * 1024 * 1024) throw apiError("VALIDATION_ERROR", 422, "Ảnh chứng từ tối đa 3MB.", { proofUrl: "Ảnh quá lớn." });
  tx((database) => {
    const target = database.payments.find((p) => p.id === payment.id);
    target.proofUrl = proof;
    target.status = "pending";
    target.updatedAt = nowIso();
    database.alerts.push({
      id: (database._seq.alerts = (database._seq.alerts || 0) + 1),
      type: "bank_transfer_waiting", severity: "info",
      message: `Chuyển khoản chờ xác nhận — đơn ${booking.code} (${payment.amount.toLocaleString("vi-VN")} đ)`,
      entity: "payment", entityId: payment.id, status: "open", createdAt: nowIso(), resolvedAt: null,
    });
    for (const staff of database.users.filter((u) => u.roles.includes("accountant") || u.roles.includes("super_admin"))) {
      notify(database, {
        userId: staff.id, type: "payment.bank_transfer", title: `Chuyển khoản chờ xác nhận — ${booking.code}`,
        content: `Số tiền ${payment.amount.toLocaleString("vi-VN")} đ. Đối chiếu chứng từ và sao kê.`,
        link: "/admin/payments?tab=confirm", priority: "high",
      });
    }
  });
  return { data: { uploaded: true, status: "pending" } };
}, { name: "payment-proof" });

add("POST", "/webhooks/payments/:provider", (ctx) => {
  const provider = ctx.params.provider;
  const body = ctx.body || {};
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || hmac("viettrails-payment", authSecret());
  const signature = String(body.signature || "");
  const signed = `${provider}|${body.eventId || ""}|${body.merchantRef || ""}|${body.amount || ""}|${body.status || ""}`;
  if (!timingSafeEqual(signature, hmac(signed, secret))) {
    throw apiError("FORBIDDEN", 403, "Chữ ký webhook không hợp lệ.");
  }
  const result = tx((database) => processWebhook(database, { provider, ...body }));
  return { data: result };
}, { name: "payment-webhook" });

function processWebhook(db, { provider, eventId, merchantRef, providerTxnId, amount, status }) {
  if (!eventId || !merchantRef) throw apiError("VALIDATION_ERROR", 422, "Thiếu mã sự kiện hoặc mã tham chiếu.");
  if (db.webhookEvents.some((e) => e.provider === provider && e.eventId === eventId)) {
    return { received: true, duplicate: true };
  }
  const event = {
    id: (db._seq.webhookEvents = (db._seq.webhookEvents || 0) + 1),
    provider, eventId, merchantRef, providerTxnId: providerTxnId || null,
    amount: Number(amount), status, processedAt: nowIso(), createdAt: nowIso(), result: null,
  };
  db.webhookEvents.push(event);
  const payment = db.payments.find((p) => p.merchantRef === merchantRef);
  if (!payment) {
    event.result = "payment_not_found";
    addAudit(db, {
      actorId: null, actorRole: "system", action: "payment.webhook", entity: "payment", entityId: merchantRef,
      before: null, after: { result: "payment_not_found" },
    });
    return { received: true, matched: false };
  }
  if (Number(amount) !== payment.amount) {
    payment.flag = "amount_mismatch";
    payment.rawPayload = JSON.stringify({ provider, eventId, amount, status });
    payment.updatedAt = nowIso();
    event.result = "amount_mismatch";
    db.alerts.push({
      id: (db._seq.alerts = (db._seq.alerts || 0) + 1),
      type: "payment_amount_mismatch", severity: "danger",
      message: `Sai số tiền giao dịch ${merchantRef}: cổng báo ${Number(amount).toLocaleString("vi-VN")} đ, hệ thống ${payment.amount.toLocaleString("vi-VN")} đ.`,
      entity: "payment", entityId: payment.id, status: "open", createdAt: nowIso(), resolvedAt: null,
    });
    addAudit(db, {
      actorId: null, actorRole: "system", action: "payment.webhook.mismatch", entity: "payment", entityId: merchantRef,
      before: { amount: payment.amount }, after: { received: Number(amount) },
    });
    return { received: true, matched: false, reason: "amount_mismatch" };
  }
  if (status === "success") {
    const applied = applyPaymentSuccess(db, payment, {
      providerTxnId: providerTxnId || `PG-${eventId}`, paidAt: nowIso(), source: "webhook",
    });
    event.result = applied.alreadyProcessed ? "already_processed" : applied.outcome;
    return { received: true, processed: true, outcome: event.result };
  }
  if (status === "failed") {
    payment.status = "failed";
    payment.updatedAt = nowIso();
    event.result = "failed";
    const booking = db.bookings.find((b) => b.id === payment.bookingId);
    notify(db, {
      userId: booking?.userId, type: "payment.failed", title: "Thanh toán không thành công",
      content: "Bạn có thể thử lại bằng phương thức khác trong Đơn của tôi.",
      email: booking?.contactEmail, link: booking ? `/booking/${booking.code}/pay` : null,
    });
    return { received: true, processed: true, outcome: "failed" };
  }
  return { received: true, processed: false };
}

add("POST", "/sandbox/payments/:merchantRef/complete", (ctx) => {
  if (!isDev) throw apiError("NOT_FOUND", 404, "Không tìm thấy nội dung bạn yêu cầu.");
  const result = ctx.body.result === "fail" ? "failed" : "success";
  const payment = ctx.db.payments.find((p) => p.merchantRef === ctx.params.merchantRef);
  if (!payment) throw apiError("NOT_FOUND", 404, "Không tìm thấy giao dịch.");
  if (!["initiated", "pending"].includes(payment.status)) {
    throw apiError("INVALID_STATE_TRANSITION", 409, "Giao dịch đã được xử lý.");
  }
  const provider = payment.provider === "vietqr" ? "bank_transfer" : payment.provider;
  const eventId = `SB-${crypto.randomUUID()}`;
  const paidAt = nowIso();
  const resultBody = tx((database) => {
    const current = database.payments.find((p) => p.id === payment.id);
    if (result === "failed") {
      current.status = "failed";
      current.updatedAt = nowIso();
      return { received: true, processed: true, outcome: "failed" };
    }
    const secret = process.env.PAYMENT_WEBHOOK_SECRET || hmac("viettrails-payment", authSecret());
    const signature = hmac(`${provider}|${eventId}|${current.merchantRef}|${current.amount}|success`, secret);
    return processWebhook(database, {
      provider, eventId, merchantRef: current.merchantRef,
      providerTxnId: `SB-${crypto.randomUUID()}`, amount: current.amount, status: "success", signature,
    });
  });
  return { data: { ...resultBody, paidAt, payment: getDb().payments.find((p) => p.id === payment.id) } };
}, { name: "sandbox-payment" });

add("GET", "/sandbox/payments/:merchantRef", (ctx) => {
  if (!isDev) throw apiError("NOT_FOUND", 404, "Không tìm thấy nội dung bạn yêu cầu.");
  const payment = ctx.db.payments.find((p) => p.merchantRef === ctx.params.merchantRef);
  if (!payment) throw apiError("NOT_FOUND", 404, "Không tìm thấy giao dịch.");
  const booking = ctx.db.bookings.find((b) => b.id === payment.bookingId);
  const tour = getTour(ctx.db, getDeparture(ctx.db, booking.departureId).tourId);
  return {
    data: {
      merchantRef: payment.merchantRef, amount: payment.amount, method: payment.method,
      status: payment.status, bookingCode: booking.code, tourName: tour.name,
      contactEmail: booking.contactEmail, createdAt: payment.createdAt,
    },
  };
}, { name: "sandbox-payment-info" });

/* ====================== EXPORT HANDLER ====================== */

export async function handleApi(req, res) {
  const requestId = String(req.headers["x-request-id"] || crypto.randomUUID());
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (!url.pathname.startsWith(API_PREFIX)) return false;
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "X-Request-Id": requestId });
    res.end();
    return true;
  }
  const pathname = url.pathname.slice(API_PREFIX.length) || "/";
  const parts = pathname.split("/").filter(Boolean);
  const db = getDb();

  // periodic domain sweep
  if (Date.now() - lastSweep > 15000) {
    lastSweep = Date.now();
    try {
      if (sweepDb(db)) saveDb();
    } catch (error) {
      console.error("[sweep]", error);
    }
  }

  const ctx = {
    req, res, db, requestId,
    url, query: Object.fromEntries(url.searchParams.entries()),
    params: {}, body: {}, user: null, session: null,
    ip: clientIp(req), ua: req.headers["user-agent"] || null,
  };
  try {
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      const resolved = verifyAccessToken(db, authHeader.slice(7));
      if (resolved) {
        ctx.user = resolved.user;
        ctx.session = resolved.session;
      }
    }
    if (!ctx.user && req.method === "GET" && req.url.includes("/documents/")) {
      const resolved = userFromRefresh(db, req);
      if (resolved) {
        ctx.user = resolved.user;
        ctx.session = resolved.session;
      }
    }
    ctx.body = await readJson(req);

    const match = routes.find((route) => route.method === req.method && route.parts.length === parts.length
      && route.parts.every((part, index) => part.startsWith(":") || part === parts[index]));
    if (!match) throw apiError("NOT_FOUND", 404, "Không tìm thấy nội dung bạn yêu cầu.");
    match.parts.forEach((part, index) => {
      if (part.startsWith(":")) ctx.params[part.slice(1)] = decodeURIComponent(parts[index]);
    });
    if (match.perm) requirePerm(ctx, match.perm);
    if (match.verified && !ctx.user?.emailVerifiedAt) requireEmailVerified(ctx);
    if (match.rate) {
      rateLimit(`${match.handlerName}:${ctx.ip}`, 60, 60 * 1000);
    }
    const output = await match.handler(ctx);
    const payload = { data: output?.data ?? null };
    if (output?.meta) payload.meta = output.meta;
    await flushDb();
    json(res, 200, payload, requestId);
    return true;
  } catch (error) {
    try {
      await flushDb();
    } catch (flushError) {
      console.error("[api-flush]", requestId, flushError);
    }
    if (error instanceof ApiError) {
      json(res, error.status, {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
          requestId,
          ...(error.extra || {}),
        },
      }, requestId);
      return true;
    }
    console.error("[api]", requestId, error);
    json(res, 500, {
      error: {
        code: "INTERNAL_ERROR",
        message: "Có lỗi hệ thống. Vui lòng thử lại sau.",
        requestId,
      },
    }, requestId);
    return true;
  }
}

export function listRoutes() {
  return routes.map((r) => `${r.method} ${API_PREFIX}/${r.parts.join("/")}`);
}
