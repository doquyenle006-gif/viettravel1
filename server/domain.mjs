import {
  addDays, daysBetween, nowIso, todayVN, endOfDayVN, roundUpTo,
} from "./util.mjs";
import {
  addAudit, addHistory, adjustSeats, alert, cfgNumber, computeCancellationQuote, computeChangeQuote,
  getDeparture, getPolicy, getTour, grossPaidAmount, notify, paymentStatusFor, recalcBookingMoney,
  refundedAmount, releaseCoupon,
} from "./business.mjs";
import { apiError } from "./errors.mjs";

export function bookingSeats(db, booking) {
  const infantSeat = Boolean(db.settings["seat.infant_takes_seat"]?.value);
  return booking.adults + booking.children + (infantSeat ? booking.infants : 0);
}

export function pushHistory(db, booking, from, to, actorType = "system", actorId = null, note = null) {
  addHistory(db, booking.id, from, to, { actorType, actorId, note });
}

export function confirmBooking(db, booking, { actorType = "system", actorId = null, note = "Đã xác nhận đơn." } = {}) {
  if (booking.status !== "pending") {
    throw apiError("INVALID_STATE_TRANSITION", 409, "Chỉ đơn đang giữ chỗ mới có thể xác nhận.");
  }
  booking.status = "confirmed";
  booking.holdExpiresAt = null;
  booking.updatedAt = nowIso();
  pushHistory(db, booking, "pending", "confirmed", actorType, actorId, note);
  notify(db, {
    userId: booking.userId, type: "booking.confirmed",
    title: `Đơn ${booking.code} đã được xác nhận`,
    content: "Voucher và thông tin chuyến đi đã sẵn sàng trong mục Đơn của tôi.",
    email: booking.contactEmail, link: `/account/bookings/${booking.code}`, priority: "high",
  });
  addAudit(db, {
    actorId, actorRole: actorType, action: "booking.confirm", entity: "booking", entityId: booking.code,
    before: { status: "pending" }, after: { status: "confirmed" },
  });
  return booking;
}

export function createRefundRequest(db, booking, {
  amount, type = "cash_back", reasonCode = "customer_request", policyApplied = "", requestedBy = null,
  paymentId = null, note = null,
}) {
  const gross = grossPaidAmount(db, booking.id);
  const existingOpen = db.refunds
    .filter((r) => r.bookingId === booking.id && ["requested", "approved", "processing"].includes(r.status))
    .reduce((sum, r) => sum + r.amount, 0);
  const alreadyRefunded = refundedAmount(db, booking.id);
  const available = Math.max(0, gross - alreadyRefunded - existingOpen);
  const safeAmount = Math.min(Math.round(amount), available);
  if (safeAmount <= 0) return null;
  const refund = {
    id: (db._seq.refunds = (db._seq.refunds || 0) + 1),
    bookingId: booking.id,
    paymentId: paymentId || db.payments.find((p) => p.bookingId === booking.id && p.status === "succeeded")?.id || null,
    amount: safeAmount,
    type,
    reasonCode,
    policyApplied,
    status: "requested",
    requestedBy,
    approvedBy: null,
    approvals: [],
    processedAt: null,
    providerRefundId: null,
    note,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.refunds.push(refund);
  notify(db, {
    userId: booking.userId, type: "refund.requested",
    title: `Đã tiếp nhận yêu cầu hoàn tiền cho đơn ${booking.code}`,
    content: `Số tiền dự kiến hoàn: ${safeAmount.toLocaleString("vi-VN")} đ. Chúng tôi sẽ xử lý trong tối đa ${cfgNumber(db, "refund.sla_days", 7)} ngày làm việc.`,
    email: booking.contactEmail, link: `/account/bookings/${booking.code}`,
  });
  return refund;
}

export function cancelBookingNow(db, booking, {
  cancelBy = "customer", reasonCode = "customer_request", note = null, actorId = null, actorType = "customer",
  force = false,
}) {
  if (!["pending", "confirmed"].includes(booking.status)) {
    throw apiError("INVALID_STATE_TRANSITION", 409, "Đơn ở trạng thái này không thể hủy.");
  }
  const departure = getDeparture(db, booking.departureId);
  const tour = getTour(db, departure.tourId);
  const quote = force
    ? {
      feePercent: 0, fee: 0, refund: grossPaidAmount(db, booking.id), grossPaid: grossPaidAmount(db, booking.id),
      daysToDeparture: daysBetween(todayVN(), departure.departureDate), policyName: getPolicy(db, tour).name,
      autoApprove: true, requiresApproval: false,
    }
    : computeCancellationQuote(db, { booking, departure, tour });

  const gross = grossPaidAmount(db, booking.id);
  const fee = Math.min(quote.fee, gross);
  const refundAmount = Math.max(0, gross - fee);
  const before = { status: booking.status, departureId: booking.departureId };

  booking.status = "cancelled";
  booking.cancelBy = cancelBy;
  booking.cancelReasonCode = reasonCode;
  booking.cancelledAt = nowIso();
  booking.cancelNote = note;
  booking.holdExpiresAt = null;
  booking.updatedAt = nowIso();
  adjustSeats(db, departure, -bookingSeats(db, booking));

  if (gross === 0 || cancelBy === "company") releaseCoupon(db, booking);

  let refund = null;
  if (refundAmount > 0) {
    refund = createRefundRequest(db, booking, {
      amount: refundAmount, type: "cash_back", reasonCode, requestedBy: actorId,
      policyApplied: quote.policyName ? `${quote.policyName} — phí ${quote.feePercent}%` : "",
      note: `Hủy đơn: ${reasonCode}. Đã thu ${gross.toLocaleString("vi-VN")} đ, phí ${fee.toLocaleString("vi-VN")} đ.`,
    });
  }
  recalcBookingMoney(db, booking);
  pushHistory(db, booking, before.status, "cancelled", actorType, actorId,
    `Hủy đơn (${reasonCode})${fee ? ` — phí ${fee.toLocaleString("vi-VN")} đ` : ""}${refund ? ` — hoàn ${refund.amount.toLocaleString("vi-VN")} đ` : ""}`);
  notify(db, {
    userId: booking.userId, type: "booking.cancelled",
    title: `Đơn ${booking.code} đã được hủy`,
    content: refund
      ? `Số tiền hoàn dự kiến ${refund.amount.toLocaleString("vi-VN")} đ, về đúng phương thức đã thanh toán trong tối đa ${cfgNumber(db, "refund.sla_days", 7)} ngày làm việc.`
      : "Đơn đã hủy. Không phát sinh khoản hoàn tiền.",
    email: booking.contactEmail, link: `/account/bookings/${booking.code}`, priority: "high",
  });
  addAudit(db, {
    actorId, actorRole: actorType, action: "booking.cancel", entity: "booking", entityId: booking.code,
    before, after: { status: "cancelled", cancelBy, reasonCode, fee, refundAmount },
  });
  return { booking, quote, refund };
}

export function applyPaymentSuccess(db, payment, { providerTxnId = null, paidAt = nowIso(), actorId = null, source = "webhook" } = {}) {
  if (payment.status === "succeeded") return { alreadyProcessed: true, payment };
  const booking = db.bookings.find((b) => b.id === payment.bookingId);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn của giao dịch.");
  const departure = getDeparture(db, booking.departureId);

  payment.status = "succeeded";
  payment.providerTxnId = providerTxnId || payment.providerTxnId;
  payment.paidAt = paidAt;
  payment.updatedAt = nowIso();
  payment.flag = null;

  let outcome = "recorded";
  const gross = grossPaidAmount(db, booking.id);

  if (booking.status === "expired") {
    const seatsNeeded = bookingSeats(db, booking);
    const seatsLeft = departure.capacity - departure.seatsTaken;
    if (departure.status !== "cancelled" && departure.departureDate >= todayVN() && seatsLeft >= seatsNeeded) {
      adjustSeats(db, departure, seatsNeeded);
      booking.status = "pending";
      booking.holdExpiresAt = new Date(Date.now() + 30 * 60000).toISOString();
      pushHistory(db, booking, "expired", "pending", "system", actorId, "Thanh toán muộn — mở lại đơn do còn chỗ");
      outcome = "reopened";
    } else {
      createRefundRequest(db, booking, {
        amount: payment.amount, type: "cash_back", reasonCode: "operational",
        policyApplied: "Thanh toán muộn khi chuyến đã hết chỗ — hoàn 100%",
        note: "Không thể mở lại đơn vì không còn đủ chỗ.",
      });
      alert(db, {
        type: "late_payment_no_seat", severity: "danger",
        message: `Thanh toán muộn cho đơn ${booking.code} nhưng chuyến đã hết chỗ. Cần hoàn tiền và liên hệ khách.`,
        entity: "booking", entityId: booking.code,
      });
      outcome = "refund_requested";
    }
  } else if (booking.status === "cancelled") {
    createRefundRequest(db, booking, {
      amount: payment.amount, type: "cash_back", reasonCode: "operational",
      policyApplied: "Đơn đã hủy — hoàn 100% khoản thu sau thời điểm hủy",
      note: "Giao dịch đến sau khi đơn đã hủy.",
    });
    alert(db, {
      type: "payment_after_cancel", severity: "danger",
      message: `Giao dịch ${payment.merchantRef} đến sau khi đơn ${booking.code} đã hủy.`,
      entity: "payment", entityId: payment.merchantRef,
    });
    outcome = "refund_requested";
  } else if (booking.status === "pending" && gross >= booking.depositRequired) {
    confirmBooking(db, booking, { actorType: "system", note: "Đã nhận đủ tiền cọc" });
    outcome = "confirmed";
  } else if (booking.status === "confirmed" && gross < booking.totalPrice) {
    outcome = "partial";
  }

  recalcBookingMoney(db, booking);
  notify(db, {
    userId: booking.userId, type: "payment.received",
    title: `Đã nhận thanh toán ${payment.amount.toLocaleString("vi-VN")} đ cho đơn ${booking.code}`,
    content: "Biên nhận điện tử đã được ghi nhận trong Đơn của tôi.",
    email: booking.contactEmail, link: `/account/bookings/${booking.code}`, priority: "high",
  });
  addAudit(db, {
    actorId, actorRole: source, action: "payment.succeeded", entity: "payment", entityId: payment.merchantRef,
    before: { status: "pending", amount: payment.amount }, after: { status: "succeeded", outcome },
  });
  return { alreadyProcessed: false, payment, booking, outcome };
}

export function companyCancelDeparture(db, departure, {
  reasonCode = "operational", note = "", actorId = null, actorType = "staff",
}) {
  if (["cancelled", "completed"].includes(departure.status)) {
    throw apiError("INVALID_STATE_TRANSITION", 409, "Chuyến đã kết thúc hoặc đã hủy.");
  }
  const tour = getTour(db, departure.tourId);
  departure.status = "cancelled";
  departure.cancelReason = note || reasonCode;
  departure.cancelledAt = nowIso();
  departure.version = (departure.version || 1) + 1;
  const affected = [];
  for (const booking of db.bookings) {
    if (booking.departureId !== departure.id) continue;
    if (!["pending", "confirmed"].includes(booking.status)) continue;
    const gross = grossPaidAmount(db, booking.id);
    adjustSeats(db, departure, -bookingSeats(db, booking));
    booking.status = "cancelled";
    booking.cancelBy = "company";
    booking.cancelReasonCode = reasonCode;
    booking.cancelledAt = nowIso();
    booking.holdExpiresAt = null;
    releaseCoupon(db, booking);
    if (gross > 0) {
      createRefundRequest(db, booking, {
        amount: gross, type: "cash_back", reasonCode: reasonCode === "force_majeure" ? "force_majeure" : "min_pax_not_met",
        policyApplied: "Công ty hủy chuyến — hoàn 100%, không phí",
        requestedBy: actorId, note: note || "Công ty hủy chuyến",
      });
    }
    recalcBookingMoney(db, booking);
    pushHistory(db, booking, "confirmed", "cancelled", "system", actorId,
      `Công ty hủy chuyến: ${note || reasonCode}. Hoàn 100% khoản đã thu.`);
    notify(db, {
      userId: booking.userId, type: "departure.cancelled",
      title: `Chuyến ${tour.name} ngày ${departure.departureDate.split("-").reverse().join("/")} đã bị hủy`,
      content: `Rất tiếc chuyến đi phải hủy với lý do: ${note || reasonCode}. Bạn được chọn chuyển lịch miễn phí, hoàn 100% hoặc bảo lưu. Vui lòng liên hệ hotline để được hỗ trợ.`,
      email: booking.contactEmail, link: `/account/bookings/${booking.code}`, priority: "urgent",
    });
    affected.push(booking.code);
  }
  for (const request of db.changeRequests) {
    if (request.status === "submitted" && db.bookings.find((b) => b.id === request.bookingId)?.departureId === departure.id) {
      request.status = "rejected";
      request.decisionNote = "Chuyến bị hủy";
      request.updatedAt = nowIso();
    }
  }
  addAudit(db, {
    actorId, actorRole: actorType, action: "departure.cancel", entity: "departure", entityId: departure.id,
    before: { status: departure.status }, after: { reasonCode, note, affectedBookings: affected.length },
  });
  return { departure, affected };
}

export function approveChangeRequest(db, request, { actorId = null, actorType = "staff", note = null } = {}) {
  const booking = db.bookings.find((b) => b.id === request.bookingId);
  if (!booking) throw apiError("NOT_FOUND", 404, "Không tìm thấy đơn.");
  if (request.status !== "submitted") throw apiError("INVALID_STATE_TRANSITION", 409, "Yêu cầu đã được xử lý.");
  const oldDep = getDeparture(db, booking.departureId);
  const tour = getTour(db, oldDep.tourId);
  const newDep = getDeparture(db, request.payload?.newDepartureId);
  if (!newDep || newDep.tourId !== tour.id) {
    throw apiError("VALIDATION_ERROR", 422, "Lịch mới không hợp lệ.", { newDepartureId: "Chọn lịch cùng tour" });
  }
  const quote = computeChangeQuote(db, { booking, oldDeparture: oldDep, tour, newDeparture: newDep });
  const seats = bookingSeats(db, booking);
  adjustSeats(db, oldDep, -seats);
  adjustSeats(db, newDep, seats);
  booking.departureId = newDep.id;
  booking.priceSnapshot = [
    ...(booking.adults ? [{ type: "adult", qty: booking.adults, unitPrice: newDep.priceAdult, amount: booking.adults * newDep.priceAdult }] : []),
    ...(booking.children ? [{ type: "child", qty: booking.children, unitPrice: newDep.priceChild, amount: booking.children * newDep.priceChild }] : []),
    ...(booking.infants ? [{ type: "infant", qty: booking.infants, unitPrice: newDep.priceInfant, amount: booking.infants * newDep.priceInfant }] : []),
    ...(booking.singles ? [{ type: "single_supplement", qty: booking.singles, unitPrice: newDep.singleSupplement, amount: booking.singles * newDep.singleSupplement }] : []),
  ];
  booking.subtotal = booking.priceSnapshot.reduce((sum, line) => sum + line.amount, 0);
  booking.totalPrice = Math.max(0, quote.newTotal);
  booking.balanceDueDate = newDep.balanceDueDate;
  booking.depositRequired = Math.ceil((booking.totalPrice * (tour.depositPercent / 100)) / 1000) * 1000;
  booking.changeCount = (booking.changeCount || 0) + 1;
  booking.updatedAt = nowIso();
  recalcBookingMoney(db, booking);
  request.status = "completed";
  request.decisionNote = note;
  request.decidedBy = actorId;
  request.updatedAt = nowIso();
  request.feeQuote = quote;
  pushHistory(db, booking, "confirmed", "confirmed", actorType, actorId,
    `Đổi ngày sang ${newDep.departureDate.split("-").reverse().join("/")} — phí ${quote.fee.toLocaleString("vi-VN")} đ, chênh lệch ${quote.difference.toLocaleString("vi-VN")} đ`);
  notify(db, {
    userId: booking.userId, type: "booking.changed",
    title: `Yêu cầu đổi ngày đơn ${booking.code} đã được duyệt`,
    content: `Chuyến mới khởi hành ${newDep.departureDate.split("-").reverse().join("/")}. ${quote.amountDue > 0 ? `Cần thanh toán thêm ${quote.amountDue.toLocaleString("vi-VN")} đ.` : "Không phát sinh khoản thu thêm."}`,
    email: booking.contactEmail, link: `/account/bookings/${booking.code}`, priority: "high",
  });
  addAudit(db, {
    actorId, actorRole: actorType, action: "booking.change.approve", entity: "booking", entityId: booking.code,
    before: { departureId: oldDep.id, totalPrice: booking.totalPrice },
    after: { departureId: newDep.id, totalPrice: booking.totalPrice, fee: quote.fee },
  });
  return { booking, quote };
}

export function sweepDb(db) {
  const now = new Date();
  const today = todayVN(now);
  let changed = false;

  // Expire holds and auto-cancel unpaid confirmed bookings
  for (const booking of db.bookings) {
    const departure = getDeparture(db, booking.departureId);
    if (!departure) continue;
    if (booking.status === "pending" && booking.holdExpiresAt && new Date(booking.holdExpiresAt) < now) {
      const gross = grossPaidAmount(db, booking.id);
      booking.status = "expired";
      booking.holdExpiresAt = null;
      booking.updatedAt = nowIso();
      adjustSeats(db, departure, -bookingSeats(db, booking));
      releaseCoupon(db, booking);
      if (gross > 0) {
        createRefundRequest(db, booking, {
          amount: gross, type: "cash_back", reasonCode: "customer_request",
          policyApplied: "Đơn hết hạn giữ chỗ — hoàn 100% khoản đã thu", requestedBy: null,
        });
      }
      recalcBookingMoney(db, booking);
      pushHistory(db, booking, "pending", "expired", "system", null, "Quá hạn giữ chỗ");
      notify(db, {
        userId: booking.userId, type: "booking.expired",
        title: `Đơn ${booking.code} đã hết hạn giữ chỗ`,
        content: "Chỗ đã được trả lại. Bạn có thể kiểm tra lịch còn chỗ và đặt lại.",
        email: booking.contactEmail, link: `/account/bookings/${booking.code}`,
      });
      changed = true;
      continue;
    }
    if (booking.status === "confirmed" && booking.balanceDueDate) {
      const graceHours = cfgNumber(db, "payment.grace_hours", 12);
      const deadline = new Date(new Date(endOfDayVN(booking.balanceDueDate)).getTime() + graceHours * 3600000);
      const gross = grossPaidAmount(db, booking.id);
      const remaining = booking.totalPrice - gross;
      const daysUntilDue = daysBetween(today, booking.balanceDueDate);
      if (remaining > 0 && daysUntilDue >= 0 && daysUntilDue <= 3
        && departure.departureDate >= today && booking.paymentRemindedAt !== today) {
        notify(db, {
          userId: booking.userId, type: "booking.payment_reminder",
          title: `Đơn ${booking.code} sắp đến hạn thanh toán`,
          content: `Còn ${remaining.toLocaleString("vi-VN")} đ cần thanh toán trước ngày ${booking.balanceDueDate.split("-").reverse().join("/")}.`,
          email: booking.contactEmail, link: `/account/bookings/${booking.code}`,
          priority: daysUntilDue <= 1 ? "high" : "normal",
        });
        booking.paymentRemindedAt = today;
        changed = true;
      }
      if (now > deadline && gross < booking.totalPrice && departure.departureDate >= today) {
        try {
          cancelBookingNow(db, booking, {
            cancelBy: "system", reasonCode: "unpaid", actorId: null, actorType: "system",
            note: `Tự hủy do chưa thanh toán đủ trước hạn ${booking.balanceDueDate}`,
          });
          alert(db, {
            type: "booking.auto_cancelled", severity: "warning",
            message: `Đơn ${booking.code} tự hủy do chưa thanh toán đủ trước hạn.`,
            entity: "booking", entityId: booking.code,
          });
          changed = true;
        } catch {
          /* ignore state races */
        }
      }
    }
  }

  // Departure lifecycle transitions
  for (const departure of db.departures) {
    if (departure.status === "draft" || departure.status === "cancelled") continue;
    if (departure.seatsTaken >= departure.minPaxToRun && !departure.isGuaranteed) {
      departure.isGuaranteed = true;
      changed = true;
    }
    if (departure.status === "open" && departure.seatsTaken >= departure.capacity) {
      departure.status = "full";
      changed = true;
    } else if (departure.status === "full" && departure.seatsTaken < departure.capacity) {
      departure.status = "open";
      changed = true;
    }
    if (departure.returnDate < today && departure.status !== "completed") {
      departure.status = "completed";
      changed = true;
      for (const booking of db.bookings) {
        if (booking.departureId === departure.id && booking.status === "confirmed") {
          booking.status = "completed";
          booking.updatedAt = nowIso();
          pushHistory(db, booking, "confirmed", "completed", "system", null, "Chuyến đã kết thúc");
          notify(db, {
            userId: booking.userId, type: "booking.completed",
            title: `Chuyến ${booking.code} đã kết thúc — chia sẻ cảm nhận nhé!`,
            content: "Cảm ơn bạn đã đồng hành cùng VietTrails. Đánh giá của bạn giúp chúng tôi hoàn thiện hơn.",
            email: booking.contactEmail, link: `/account/bookings/${booking.code}`,
          });
        }
      }
      continue;
    }
    if (departure.departureDate <= today && departure.status !== "departed" && departure.status !== "completed") {
      departure.status = "departed";
      changed = true;
    } else if (departure.bookingCutoffAt && new Date(departure.bookingCutoffAt) <= now && ["open", "full"].includes(departure.status)) {
      departure.status = "closed";
      changed = true;
    }
  }

  // Resolved tickets auto-close after 7 days
  for (const ticket of db.tickets) {
    if (ticket.status === "resolved" && ticket.updatedAt && daysBetween(ticket.updatedAt.slice(0, 10), today) >= 7) {
      ticket.status = "closed";
      ticket.updatedAt = nowIso();
      changed = true;
    }
  }

  return changed;
}
