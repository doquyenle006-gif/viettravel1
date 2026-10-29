import {
  addDays, ageOn, classifyPassenger, daysBetween, deepClone, maskDocument, money,
  normalizeCoupon, nowIso, roundUpTo, todayVN,
} from "./util.mjs";
import { apiError } from "./errors.mjs";

export const BOOKING_ACTIONS = [
  "pay_deposit", "pay_balance", "cancel", "request_cancel", "request_change",
  "edit_passengers", "download_voucher", "request_invoice", "review",
];

export function cfg(db, key) {
  const entry = db.settings?.[key];
  return entry ? entry.value : undefined;
}

export function cfgNumber(db, key, fallback = 0) {
  const value = Number(cfg(db, key));
  return Number.isFinite(value) ? value : fallback;
}

export function getTour(db, tourId) {
  return db.tours.find((t) => t.id === Number(tourId)) || null;
}

export function getDeparture(db, departureId) {
  return db.departures.find((d) => d.id === Number(departureId)) || null;
}

export function getBooking(db, code) {
  return db.bookings.find((b) => b.code === String(code)) || null;
}

export function getPolicy(db, tour) {
  return db.cancellationPolicies.find((p) => p.id === tour?.cancellationPolicyId)
    || db.cancellationPolicies.find((p) => p.active)
    || { name: "Tiêu chuẩn", tiers: [{ minDaysBefore: 0, maxDaysBefore: null, feePercent: 100 }] };
}

export function tourCard(db, tour) {
  const destination = db.destinations.find((d) => d.id === tour.destinationId);
  const category = db.categories.find((c) => c.id === tour.categoryId);
  const openDepartures = db.departures
    .filter((d) => d.tourId === tour.id && (d.status === "open" || d.status === "full"))
    .sort((a, b) => a.departureDate.localeCompare(b.departureDate));
  const upcoming = openDepartures.filter((d) => d.departureDate >= todayVN());
  const next = upcoming[0] || null;
  const lowest = upcoming.reduce((min, d) => (min === null || d.priceAdult < min ? d.priceAdult : min), null);
  return {
    id: tour.id, slug: tour.slug, name: tour.name, summary: tour.summary,
    destinationName: destination?.name || "", destinationSlug: destination?.slug || "",
    region: destination?.region || "", category: category?.name || "", categorySlug: category?.slug || "",
    durationDays: tour.durationDays, durationNights: tour.durationNights,
    cover: tour.cover, images: tour.images,
    priceFrom: lowest, nextDeparture: next?.departureDate || null,
    seatsLeftNext: next ? Math.max(0, next.capacity - next.seatsTaken) : null,
    ratingAvg: tour.ratingAvg, ratingCount: tour.ratingCount,
    status: tour.status,
  };
}

export function tourDetail(db, tour) {
  const card = tourCard(db, tour);
  const destination = db.destinations.find((d) => d.id === tour.destinationId);
  const policy = getPolicy(db, tour);
  return {
    ...card,
    description: tour.description,
    highlights: tour.highlights,
    itinerary: tour.itinerary,
    inclusions: tour.inclusions,
    exclusions: tour.exclusions,
    notes: tour.notes,
    meetingPointDefault: tour.meetingPointDefault,
    ageInfantMax: tour.ageInfantMax,
    ageChildMax: tour.ageChildMax,
    requiresIdDocument: tour.requiresIdDocument,
    requiresPassport: tour.requiresPassport,
    depositPercent: tour.depositPercent,
    minPax: tour.minPax, maxPax: tour.maxPax,
    seoTitle: tour.seoTitle, seoDescription: tour.seoDescription,
    destination: destination || null,
    cancellationPolicy: policy,
  };
}

export function publicDeparture(dep) {
  return {
    id: dep.id, tourId: dep.tourId, departureDate: dep.departureDate, returnDate: dep.returnDate,
    status: dep.status, seatsLeft: Math.max(0, dep.capacity - dep.seatsTaken),
    capacity: dep.capacity, seatsTaken: dep.seatsTaken, isGuaranteed: dep.isGuaranteed,
    priceAdult: dep.priceAdult, priceChild: dep.priceChild, priceInfant: dep.priceInfant,
    singleSupplement: dep.singleSupplement, meetingPoint: dep.meetingPoint,
    meetingTime: dep.meetingTime, bookingCutoffAt: dep.bookingCutoffAt,
    balanceDueDate: dep.balanceDueDate, minPaxToRun: dep.minPaxToRun, cancelReason: dep.cancelReason,
  };
}

export function normalizePax(db, input) {
  const adults = Math.max(0, Number(input.adults) || 0);
  let children = Math.max(0, Number(input.children) || 0);
  let infants = Math.max(0, Number(input.infants) || 0);
  const singles = Math.max(0, Number(input.singles) || 0);
  const notices = [];
  if (infants > adults) {
    const extra = infants - adults;
    children += extra;
    infants -= extra;
    notices.push("Mỗi người lớn chỉ đi kèm tối đa một em bé; số em bé vượt được tính như trẻ em.");
  }
  const infantTakesSeat = Boolean(cfg(db, "seat.infant_takes_seat"));
  const seats = adults + children + (infantTakesSeat ? infants : 0);
  return { adults, children, infants, singles, seats, notices };
}

export function classifyFromDobs(db, tour, departure, dobs) {
  return dobs.map((dob) => classifyPassenger(dob, departure.departureDate, tour.ageInfantMax, tour.ageChildMax));
}

export function couponCheck(db, coupon, subtotal, tour, userId) {
  if (!coupon) return { valid: false, reason: "not_found" };
  if (!coupon.active) return { valid: false, reason: "inactive" };
  const today = todayVN();
  if (coupon.validFrom && today < coupon.validFrom) return { valid: false, reason: "not_started" };
  if (coupon.validTo && today > coupon.validTo) return { valid: false, reason: "expired" };
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return { valid: false, reason: "used_up" };
  if (coupon.minOrder && subtotal < coupon.minOrder) return { valid: false, reason: "min_order", minOrder: coupon.minOrder };
  if (coupon.appliesTo?.type === "tour" && !coupon.appliesTo.tourIds?.includes(tour.id)) return { valid: false, reason: "not_applicable" };
  if (coupon.appliesTo?.type === "category" && !coupon.appliesTo.categoryIds?.includes(tour.categoryId)) return { valid: false, reason: "not_applicable" };
  if (userId) {
    const uses = db.couponUsages.filter((u) => u.couponId === coupon.id && u.userId === userId && !u.voidedAt);
    if (coupon.perUserLimit && uses.length >= coupon.perUserLimit) return { valid: false, reason: "already_used" };
  }
  let discount = coupon.type === "percent"
    ? Math.floor((subtotal * Number(coupon.value)) / 100)
    : Number(coupon.value);
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, subtotal);
  const minTotal = cfgNumber(db, "price.min_total_after_discount", 0);
  if (subtotal - discount < minTotal) discount = Math.max(0, subtotal - minTotal);
  return { valid: true, discount, coupon };
}

export function computeQuote(db, { tour, departure, input, userId = null }) {
  if (!departure) throw apiError("NOT_FOUND", 404, "Không tìm thấy lịch khởi hành.");
  if (departure.status === "closed" || departure.status === "cancelled" || departure.status === "departed" || departure.status === "completed") {
    throw apiError("DEPARTURE_CLOSED", 409, "Chuyến này đã đóng bán.", undefined, { status: departure.status });
  }
  const normalized = normalizePax(db, input);
  const { adults, children, infants, singles, seats, notices } = normalized;
  if (adults < 1) {
    throw apiError("VALIDATION_ERROR", 422, "Đơn cần ít nhất 1 người lớn.", { adults: "Cần ít nhất 1 người lớn" });
  }
  if (seats < 1) {
    throw apiError("VALIDATION_ERROR", 422, "Vui lòng chọn số khách.", { adults: "Chọn số khách" });
  }
  const maxPax = cfgNumber(db, "booking.max_pax_online", 10);
  if (adults + children + infants > maxPax) {
    throw apiError("VALIDATION_ERROR", 422, `Mỗi đơn online tối đa ${maxPax} khách. Vui lòng liên hệ để đặt đoàn lớn.`, {
      adults: `Tổng số khách vượt ${maxPax}`,
    });
  }
  const seatsLeft = Math.max(0, departure.capacity - departure.seatsTaken);
  if (seats > seatsLeft) {
    throw apiError("SEAT_UNAVAILABLE", 409, `Rất tiếc, chuyến này chỉ còn ${seatsLeft} chỗ.`, undefined, { seatsLeft });
  }

  let finalAdults = adults;
  let finalChildren = children;
  let finalInfants = infants;
  let finalSingles = singles;
  let reclassified = [];
  const dobs = Array.isArray(input.passengerDobs) ? input.passengerDobs : null;
  if (dobs) {
    if (dobs.length !== adults + children + infants) {
      throw apiError("VALIDATION_ERROR", 422, "Số hành khách chưa khớp với số lượng đã chọn.", {
        passengers: "Số hành khách không khớp",
      });
    }
    const classes = classifyFromDobs(db, tour, departure, dobs);
    finalAdults = classes.filter((c) => c === "adult").length;
    finalChildren = classes.filter((c) => c === "child").length;
    finalInfants = classes.filter((c) => c === "infant").length;
    const declaredTypes = [
      ...Array.from({ length: adults }, () => "adult"),
      ...Array.from({ length: children }, () => "child"),
      ...Array.from({ length: infants }, () => "infant"),
    ];
    reclassified = classes
      .map((type, index) => declaredTypes[index] !== type ? { index: index + 1, from: declaredTypes[index], to: type } : null)
      .filter(Boolean);
    if (finalAdults < 1) {
      throw apiError("VALIDATION_ERROR", 422, "Cần ít nhất một hành khách là người lớn.", { passengers: "Cần người lớn đi cùng" });
    }
    const normalizedFinal = normalizePax(db, { adults: finalAdults, children: finalChildren, infants: finalInfants, singles });
    finalChildren = normalizedFinal.children;
    finalInfants = normalizedFinal.infants;
    if (normalizedFinal.seats > seatsLeft) {
      throw apiError("SEAT_UNAVAILABLE", 409, `Rất tiếc, chuyến này chỉ còn ${seatsLeft} chỗ.`, undefined, { seatsLeft });
    }
  }

  const lines = [];
  if (finalAdults) lines.push({ type: "adult", qty: finalAdults, unitPrice: departure.priceAdult, amount: finalAdults * departure.priceAdult });
  if (finalChildren) lines.push({ type: "child", qty: finalChildren, unitPrice: departure.priceChild, amount: finalChildren * departure.priceChild });
  if (finalInfants) lines.push({ type: "infant", qty: finalInfants, unitPrice: departure.priceInfant, amount: finalInfants * departure.priceInfant });
  if (finalSingles) lines.push({ type: "single_supplement", qty: finalSingles, unitPrice: departure.singleSupplement, amount: finalSingles * departure.singleSupplement });
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);

  let couponResult = null;
  let discountTotal = 0;
  const couponCode = normalizeCoupon(input.couponCode);
  if (couponCode) {
    const coupon = db.coupons.find((c) => c.code === couponCode);
    const check = couponCheck(db, coupon, subtotal, tour, userId);
    couponResult = { code: couponCode, valid: check.valid };
    if (check.valid) {
      couponResult.discount = check.discount;
      discountTotal = check.discount;
    } else {
      couponResult.reason = check.reason;
      if (check.minOrder) couponResult.minOrder = check.minOrder;
    }
  }
  const total = Math.max(0, subtotal - discountTotal);
  const daysToDeparture = daysBetween(todayVN(), departure.departureDate);
  const fullRequiredDays = cfgNumber(db, "payment.full_required_days", 7);
  const fullPaymentRequired = daysToDeparture <= fullRequiredDays;
  const percent = Math.min(100, Math.max(20, Number(tour.depositPercent) || cfgNumber(db, "deposit.default_percent", 30)));
  const depositAmount = fullPaymentRequired ? total : Math.min(total, roundUpTo((total * percent) / 100, 1000));
  const balanceDueDate = addDays(departure.departureDate, -cfgNumber(db, "payment.balance_due_days", 7));
  const existingPending = userId
    ? db.bookings.find((b) => b.userId === userId && b.departureId === departure.id && b.status === "pending")
    : null;

  return {
    departureId: departure.id,
    departure: publicDeparture(departure),
    lines,
    subtotal,
    discountTotal,
    total,
    coupon: couponResult,
    deposit: {
      percent: fullPaymentRequired ? 100 : percent,
      amount: depositAmount,
      dueNow: depositAmount,
      balance: Math.max(0, total - depositAmount),
    },
    balanceDueDate,
    fullPaymentRequired,
    daysToDeparture,
    adults: finalAdults, children: finalChildren, infants: finalInfants, singles: finalSingles,
    seatsRequired: normalizePax(db, { adults: finalAdults, children: finalChildren, infants: finalInfants, singles }).seats,
    seatsLeft,
    reclassified,
    notices,
    existingPending: existingPending ? { code: existingPending.code, holdExpiresAt: existingPending.holdExpiresAt } : null,
  };
}

export function computeCancellationQuote(db, { booking, departure, tour, asOf = todayVN() }) {
  if (!["pending", "confirmed"].includes(booking.status)) {
    throw apiError("CANCEL_NOT_ALLOWED", 409, "Đơn ở trạng thái này không thể hủy.");
  }
  const days = daysBetween(asOf, departure.departureDate);
  const grossPaid = grossPaidAmount(db, booking.id);
  if (days < 0) {
    throw apiError("CANCEL_NOT_ALLOWED", 409, "Chuyến đã khởi hành, không thể hủy.");
  }
  const policy = getPolicy(db, tour);
  const tier = policy.tiers.find((t) => days >= t.minDaysBefore && (t.maxDaysBefore === null || days <= t.maxDaysBefore))
    || policy.tiers[policy.tiers.length - 1];
  const feePercent = booking.status === "pending" && grossPaid === 0 ? 0 : tier.feePercent;
  const feeRaw = Math.round((booking.totalPrice * feePercent) / 100);
  const fee = Math.min(feeRaw, grossPaid);
  const refund = Math.max(0, grossPaid - fee);
  const selfServiceDays = cfgNumber(db, "cancel.self_service_min_days", 4);
  const autoApprove = booking.status === "pending" || days >= selfServiceDays;
  return {
    bookingCode: booking.code,
    daysToDeparture: days,
    feePercent,
    fee,
    feeRaw,
    policyName: policy.name,
    grossPaid,
    paidAmount: booking.paidAmount,
    refund,
    refundMethod: "Đúng phương thức đã thanh toán",
    refundSlaDays: cfgNumber(db, "refund.sla_days", 7),
    autoApprove,
    requiresApproval: !autoApprove,
    cancelledAt: nowIso(),
    tiers: policy.tiers,
    notice: grossPaid > 0 && fee > 0 ? `Phí hủy ${feePercent}% giá trị đơn, không vượt quá số tiền đã thanh toán.` : null,
  };
}

export function computeChangeQuote(db, { booking, oldDeparture, tour, newDeparture, asOf = todayVN() }) {
  if (booking.status !== "confirmed") {
    throw apiError("CANCEL_NOT_ALLOWED", 409, "Chỉ đơn đã xác nhận mới được đổi ngày.");
  }
  if (!newDeparture || newDeparture.tourId !== booking.departureId && newDeparture.tourId !== oldDeparture.tourId) {
    throw apiError("VALIDATION_ERROR", 422, "Lịch mới không hợp lệ.", { newDepartureId: "Chọn lịch khác cùng tour" });
  }
  const days = daysBetween(asOf, oldDeparture.departureDate);
  if (days < 4) {
    throw apiError("CANCEL_NOT_ALLOWED", 409, "Không thể đổi ngày khi còn dưới 4 ngày tới khởi hành. Vui lòng hủy và đặt lại.");
  }
  if (booking.changeCount >= cfgNumber(db, "change.max_times", 1)) {
    throw apiError("CANCEL_NOT_ALLOWED", 409, "Đơn này đã dùng hết số lần đổi ngày.");
  }
  if (newDeparture.status !== "open") {
    throw apiError("DEPARTURE_CLOSED", 409, "Lịch mới không nhận đặt chỗ.");
  }
  const seatsNeeded = booking.adults + booking.children + (Boolean(cfg(db, "seat.infant_takes_seat")) ? booking.infants : 0);
  const seatsLeft = Math.max(0, newDeparture.capacity - newDeparture.seatsTaken);
  if (seatsLeft < seatsNeeded) {
    throw apiError("SEAT_UNAVAILABLE", 409, `Lịch mới chỉ còn ${seatsLeft} chỗ.`, undefined, { seatsLeft });
  }
  const feePercent = days >= 15 ? 0 : days >= 8 ? 10 : 30;
  const fee = Math.round((booking.totalPrice * feePercent) / 100);
  const newLines = [
    ...(booking.adults ? [{ type: "adult", qty: booking.adults, unitPrice: newDeparture.priceAdult, amount: booking.adults * newDeparture.priceAdult }] : []),
    ...(booking.children ? [{ type: "child", qty: booking.children, unitPrice: newDeparture.priceChild, amount: booking.children * newDeparture.priceChild }] : []),
    ...(booking.infants ? [{ type: "infant", qty: booking.infants, unitPrice: newDeparture.priceInfant, amount: booking.infants * newDeparture.priceInfant }] : []),
    ...(booking.singles ? [{ type: "single_supplement", qty: booking.singles, unitPrice: newDeparture.singleSupplement, amount: booking.singles * newDeparture.singleSupplement }] : []),
  ];
  const newTotal = newLines.reduce((sum, line) => sum + line.amount, 0) - (booking.discountTotal || 0);
  const difference = newTotal - booking.totalPrice;
  const amountDue = Math.max(0, difference) + fee;
  return {
    bookingCode: booking.code,
    oldDeparture: publicDeparture(oldDeparture),
    newDeparture: publicDeparture(newDeparture),
    newTotal: Math.max(0, newTotal),
    difference,
    feePercent,
    fee,
    amountDue,
    refund: 0,
    seatsNeeded,
    seatsLeft,
    note: difference < 0
      ? "Theo chính sách khách tự đổi, chênh lệch thấp hơn không được hoàn lại; phí đổi vẫn được ghi nhận trên đơn."
      : "Phí đổi và phần chênh lệch sẽ được ghi nhận trên đơn sau khi nhân viên duyệt.",
  };
}

export function grossPaidAmount(db, bookingId) {
  return db.payments
    .filter((p) => p.bookingId === bookingId && p.status === "succeeded")
    .reduce((sum, p) => sum + p.amount, 0);
}

export function refundedAmount(db, bookingId) {
  return db.refunds
    .filter((r) => r.bookingId === bookingId && r.status === "completed")
    .reduce((sum, r) => sum + r.amount, 0);
}

export function paymentStatusFor(db, booking) {
  const gross = grossPaidAmount(db, booking.id);
  const refunded = refundedAmount(db, booking.id);
  if (gross === 0) return "unpaid";
  if (refunded > 0 && refunded < gross) return "partially_refunded";
  if (refunded > 0 && refunded >= gross) return "refunded";
  if (gross >= booking.totalPrice) return "paid";
  return "deposit_paid";
}

export function recalcBookingMoney(db, booking) {
  const gross = grossPaidAmount(db, booking.id);
  const refunded = refundedAmount(db, booking.id);
  booking.paidAmount = Math.max(0, gross - refunded);
  booking.refundedAmount = refunded;
  booking.paymentStatus = paymentStatusFor(db, booking);
  booking.updatedAt = nowIso();
  return booking;
}

export function holdExpiryFor(db, departure) {
  const days = daysBetween(todayVN(), departure.departureDate);
  const hours = days <= 3
    ? cfgNumber(db, "hold.hours_urgent", 2)
    : days <= 7
      ? cfgNumber(db, "hold.hours_near", 6)
      : cfgNumber(db, "hold.hours_default", 24);
  return new Date(Date.now() + hours * 3600000).toISOString();
}

export function allowedActionsFor(db, booking, departure, user) {
  const actions = [];
  const today = todayVN();
  const days = daysBetween(today, departure.departureDate);
  const gross = grossPaidAmount(db, booking.id);
  const editCutoff = cfgNumber(db, "passenger.edit_cutoff_days", 3);
  const reviewWindow = cfgNumber(db, "review.window_days", 60);
  const invoiceDeadline = cfgNumber(db, "invoice.request_deadline_days", 7);
  const hasReview = db.reviews.some((r) => r.bookingId === booking.id);

  if (booking.userId === user.id) {
    if (booking.status === "pending") {
      actions.push("pay_deposit");
      if (days >= 0) actions.push("cancel");
    }
    if (booking.status === "confirmed") {
      if (gross < booking.totalPrice) actions.push("pay_balance");
      if (days >= editCutoff) actions.push("edit_passengers");
      if (days >= 0) {
        if (days >= cfgNumber(db, "cancel.self_service_min_days", 4)) actions.push("cancel");
        else actions.push("request_cancel");
      }
      if (days >= 4 && booking.changeCount < cfgNumber(db, "change.max_times", 1)) actions.push("request_change");
      actions.push("download_voucher", "request_invoice");
    }
    if (booking.status === "completed") {
      if (!hasReview && daysBetween(departure.returnDate, today) <= reviewWindow) actions.push("review");
      if (daysBetween(departure.returnDate, today) <= invoiceDeadline) actions.push("request_invoice");
      actions.push("download_voucher");
    }
  }
  return actions.filter((a) => BOOKING_ACTIONS.includes(a));
}

export function addHistory(db, bookingId, fromStatus, toStatus, { actorId = null, actorType = "system", note = null } = {}) {
  db.bookingHistory.push({
    id: (db._seq.bookingHistory = (db._seq.bookingHistory || 0) + 1),
    bookingId, fromStatus, toStatus, actorId, actorType, note, createdAt: nowIso(),
  });
}

export function adjustSeats(db, departure, delta) {
  const next = departure.seatsTaken + delta;
  departure.seatsTaken = Math.max(0, Math.min(departure.capacity, next));
  if (departure.status === "open" && departure.seatsTaken >= departure.capacity) departure.status = "full";
  else if (departure.status === "full" && departure.seatsTaken < departure.capacity) departure.status = "open";
  if (departure.seatsTaken >= departure.minPaxToRun && !departure.isGuaranteed) departure.isGuaranteed = true;
  departure.version = (departure.version || 1) + 1;
}

export function addAudit(db, { actorId, actorRole, action, entity, entityId = null, before = null, after = null, ip = null, userAgent = null }) {
  db.auditLogs.push({
    id: (db._seq.auditLogs = (db._seq.auditLogs || 0) + 1),
    actorId: actorId ?? null, actorRole: actorRole ?? null, action, entity, entityId,
    before, after, ip, userAgent, createdAt: nowIso(),
  });
}

export function notify(db, { userId = null, type, title, content, channel = "in_app", email = null, link = null, priority = "normal" }) {
  const notification = {
    id: (db._seq.notifications = (db._seq.notifications || 0) + 1),
    userId, type, title, content, channel, readAt: null, link, priority, createdAt: nowIso(),
  };
  db.notifications.push(notification);
  if (email) {
    db.outbox.push({
      id: (db._seq.outbox = (db._seq.outbox || 0) + 1),
      to: email, subject: title, body: content, link, type,
      status: "sent", attempts: 1, createdAt: nowIso(), sentAt: nowIso(),
    });
  }
  return notification;
}

export function alert(db, { type, severity = "warning", message, entity = null, entityId = null, meta = null }) {
  db.alerts.push({
    id: (db._seq.alerts = (db._seq.alerts || 0) + 1),
    type, severity, message, entity, entityId, meta, status: "open", createdAt: nowIso(), resolvedAt: null,
  });
}

export function releaseCoupon(db, booking) {
  const usage = db.couponUsages.find((u) => u.bookingId === booking.id && !u.voidedAt);
  if (!usage) return;
  usage.voidedAt = nowIso();
  const coupon = db.coupons.find((c) => c.id === usage.couponId);
  if (coupon) coupon.usedCount = Math.max(0, (coupon.usedCount || 0) - 1);
}

export function recomputeTourRating(db, tourId) {
  const reviews = db.reviews.filter((r) => r.tourId === tourId && r.status === "approved");
  const tour = db.tours.find((t) => t.id === tourId);
  if (!tour) return;
  tour.ratingCount = reviews.length;
  tour.ratingAvg = reviews.length
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : 0;
}

export function bookingDetail(db, booking, user, options = {}) {
  const departure = getDeparture(db, booking.departureId);
  const tour = getTour(db, departure.tourId);
  const destination = db.destinations.find((d) => d.id === tour.destinationId);
  const passengers = db.passengers.filter((p) => p.bookingId === booking.id);
  const payments = db.payments.filter((p) => p.bookingId === booking.id);
  const refunds = db.refunds.filter((r) => r.bookingId === booking.id);
  const history = db.bookingHistory.filter((h) => h.bookingId === booking.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const changeRequests = db.changeRequests.filter((c) => c.bookingId === booking.id);
  const invoice = db.invoices.find((i) => i.bookingId === booking.id);
  const review = db.reviews.find((r) => r.bookingId === booking.id);
  const showFullDocuments = options.showFullDocuments === true;
  const maskedPassengers = passengers.map((p) => ({
    ...p,
    idNumber: showFullDocuments ? p.idNumber : maskDocument(p.idNumber),
    passportNumber: showFullDocuments ? p.passportNumber : maskDocument(p.passportNumber),
  }));
  return {
    ...booking,
    departure: publicDeparture(departure),
    tour: {
      id: tour.id, slug: tour.slug, name: tour.name, cover: tour.cover,
      destinationName: destination?.name || "", durationDays: tour.durationDays,
      cancellationPolicy: getPolicy(db, tour),
    },
    passengers: maskedPassengers,
    payments,
    refunds,
    history,
    changeRequests,
    invoice: invoice || null,
    review: review || null,
    allowedActions: user ? allowedActionsFor(db, booking, departure, user) : [],
    grossPaid: grossPaidAmount(db, booking.id),
    remaining: Math.max(0, booking.totalPrice - grossPaidAmount(db, booking.id)),
    serverTime: nowIso(),
  };
}

export function isWithinReviewWindow(db, booking, departure) {
  if (booking.status !== "completed") return false;
  return daysBetween(departure.returnDate, todayVN()) <= cfgNumber(db, "review.window_days", 60);
}

export function ageForBooking(departureDate, dob) {
  return ageOn(dob, departureDate);
}

export function cloneTourForDb(tour) {
  return deepClone(tour);
}

export function sanitizeMoney(value) {
  return money(value);
}
