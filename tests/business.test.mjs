import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../server/seed.mjs";
import {
  computeCancellationQuote, computeChangeQuote, computeQuote, paymentStatusFor,
  allowedActionsFor, getPolicy, cfgNumber,
} from "../server/business.mjs";
import { addDays, todayVN, roundUpTo, classifyPassenger } from "../server/util.mjs";
import { sweepDb } from "../server/domain.mjs";

function buildFixture() {
  const db = createSeed();
  const tour = db.tours[0];
  const today = todayVN();
  const departure = {
    id: 9001, tourId: tour.id, departureDate: addDays(today, 20), returnDate: addDays(today, 22),
    capacity: 20, seatsTaken: 0, minPaxToRun: 8, priceAdult: 3000000, priceChild: 2100000,
    priceInfant: 900000, singleSupplement: 750000, bookingCutoffAt: `${addDays(today, 18)}T00:00:00.000Z`,
    balanceDueDate: addDays(today, 13), goNogoDate: addDays(today, 13),
    meetingPoint: "Văn phòng VietTrails", meetingTime: "06:30", isGuaranteed: false, status: "open",
    cancelReason: null, version: 1, createdAt: new Date().toISOString(),
  };
  db.departures.push(departure);
  const nearDeparture = {
    ...departure, id: 9002, departureDate: addDays(today, 10), returnDate: addDays(today, 12),
    balanceDueDate: addDays(today, 3), bookingCutoffAt: `${addDays(today, 8)}T00:00:00.000Z`,
  };
  db.departures.push(nearDeparture);
  const farDeparture = {
    ...departure, id: 9003, departureDate: addDays(today, 30), returnDate: addDays(today, 32),
    balanceDueDate: addDays(today, 23), bookingCutoffAt: `${addDays(today, 28)}T00:00:00.000Z`,
  };
  db.departures.push(farDeparture);
  return { db, tour, departure, nearDeparture, farDeparture, today };
}

test("phân loại khách theo ngày sinh tại ngày khởi hành", () => {
  assert.equal(classifyPassenger("2024-10-29", "2026-10-30", 2, 12), "child");
  assert.equal(classifyPassenger("2024-10-31", "2026-10-30", 2, 12), "infant");
  assert.equal(classifyPassenger("2014-10-31", "2026-10-30", 2, 12), "child");
  assert.equal(classifyPassenger("2014-10-30", "2026-10-30", 2, 12), "adult");
  assert.equal(classifyPassenger("1990-01-01", "2026-10-30", 2, 12), "adult");
});

test("báo giá tính đúng theo loại khách và làm tròn cọc 1.000đ", () => {
  const { db, tour, departure } = buildFixture();
  const quote = computeQuote(db, {
    tour, departure,
    input: { adults: 2, children: 1, infants: 0, singles: 1 },
    userId: null,
  });
  assert.equal(quote.subtotal, 3000000 * 2 + 2100000 + 750000);
  assert.equal(quote.total, quote.subtotal);
  assert.equal(quote.deposit.percent, tour.depositPercent);
  assert.equal(quote.deposit.amount, roundUpTo((quote.total * tour.depositPercent) / 100, 1000));
  assert.equal(quote.deposit.amount % 1000, 0);
  assert.equal(quote.fullPaymentRequired, false);
  assert.equal(quote.balanceDueDate, departure.balanceDueDate);
});

test("báo giá bắt buộc trả toàn bộ khi sát ngày khởi hành", () => {
  const { db, tour, departure } = buildFixture();
  const near = { ...departure, departureDate: addDays(todayVN(), 5) };
  const quote = computeQuote(db, { tour, departure: near, input: { adults: 1, children: 0, infants: 0 }, userId: null });
  assert.equal(quote.fullPaymentRequired, true);
  assert.equal(quote.deposit.amount, quote.total);
  assert.equal(quote.deposit.percent, 100);
});

test("mã giảm giá hợp lệ bị chặn bởi mức giảm tối đa", () => {
  const { db, tour, departure } = buildFixture();
  const quote = computeQuote(db, {
    tour, departure, input: { adults: 4, children: 0, infants: 0, couponCode: "SUMMER10" }, userId: null,
  });
  assert.equal(quote.coupon.valid, true);
  assert.equal(quote.discountTotal, 500000);
  assert.equal(quote.total, quote.subtotal - 500000);
});

test("mã hết hạn trả lý do cụ thể nhưng không chặn đặt chỗ", () => {
  const { db, tour, departure } = buildFixture();
  const quote = computeQuote(db, {
    tour, departure, input: { adults: 2, children: 0, infants: 0, couponCode: "OLD10" }, userId: null,
  });
  assert.equal(quote.coupon.valid, false);
  assert.equal(quote.coupon.reason, "expired");
  assert.equal(quote.discountTotal, 0);
  assert.ok(quote.total > 0);
});

test("ngày sinh được dùng để phân loại lại hành khách", () => {
  const { db, tour, departure } = buildFixture();
  const childDob = addDays(departure.departureDate, -365 * 10);
  const quote = computeQuote(db, {
    tour, departure,
    input: {
      adults: 2, children: 0, infants: 0,
      passengerDobs: ["1990-01-01", childDob],
    },
    userId: null,
  });
  assert.equal(quote.adults, 1);
  assert.equal(quote.children, 1);
  assert.equal(quote.reclassified.length, 1);
  assert.deepEqual(quote.reclassified[0], { index: 2, from: "adult", to: "child" });
  const childLine = quote.lines.find((line) => line.type === "child");
  assert.equal(childLine.amount, departure.priceChild);
});

test("em bé vượt số người lớn được tính như trẻ em", () => {
  const { db, tour, departure } = buildFixture();
  const quote = computeQuote(db, {
    tour, departure, input: { adults: 1, children: 0, infants: 2 }, userId: null,
  });
  assert.equal(quote.adults, 1);
  assert.equal(quote.children, 1);
  assert.equal(quote.infants, 1);
  assert.ok(quote.notices.length >= 1);
});

test("phí hủy theo bậc 8–14 ngày là 30% và không vượt tiền đã thu", () => {
  const { db, tour, nearDeparture } = buildFixture();
  const booking = {
    id: 5001, code: "VTTEST-0001", userId: 8, departureId: nearDeparture.id,
    status: "confirmed", totalPrice: 6000000, paidAmount: 2000000, subtotal: 6000000,
    adults: 2, children: 0, infants: 0, singles: 0, createdAt: new Date().toISOString(),
  };
  db.bookings.push(booking);
  db.payments.push({
    id: 6001, bookingId: booking.id, amount: 2000000, status: "succeeded", method: "vnpay",
    merchantRef: "TEST-1", paidAt: new Date().toISOString(),
  });
  const quote = computeCancellationQuote(db, { booking, departure: nearDeparture, tour });
  assert.equal(quote.daysToDeparture, 10);
  assert.equal(quote.feePercent, 30);
  assert.equal(quote.fee, 1800000);
  assert.equal(quote.refund, 200000);
  assert.equal(quote.requiresApproval, false);
});

test("phí hủy bị giới hạn bởi số tiền đã thu", () => {
  const { db, tour, departure } = buildFixture();
  const booking = {
    id: 5002, code: "VTTEST-0002", userId: 8, departureId: departure.id,
    status: "confirmed", totalPrice: 6000000, paidAmount: 300000, subtotal: 6000000,
    adults: 2, children: 0, infants: 0, singles: 0, createdAt: new Date().toISOString(),
  };
  db.bookings.push(booking);
  db.payments.push({ id: 6002, bookingId: booking.id, amount: 300000, status: "succeeded", method: "vnpay", merchantRef: "TEST-2", paidAt: new Date().toISOString() });
  const quote = computeCancellationQuote(db, { booking, departure, tour });
  assert.equal(quote.fee, 300000);
  assert.equal(quote.refund, 0);
});

test("đổi ngày tính phí 10% cho khoảng 8–14 ngày", () => {
  const { db, tour, nearDeparture, farDeparture } = buildFixture();
  const booking = {
    id: 5003, code: "VTTEST-0003", userId: 8, departureId: nearDeparture.id,
    status: "confirmed", totalPrice: 6000000, paidAmount: 2000000, subtotal: 6000000,
    adults: 2, children: 0, infants: 0, singles: 0, discountTotal: 0, changeCount: 0,
    createdAt: new Date().toISOString(),
  };
  db.bookings.push(booking);
  const quote = computeChangeQuote(db, { booking, oldDeparture: nearDeparture, tour, newDeparture: farDeparture });
  assert.equal(quote.feePercent, 10);
  assert.equal(quote.fee, 600000);
  assert.equal(quote.difference, 0);
  assert.equal(quote.amountDue, 600000);
  assert.equal(quote.refund, 0);
});

test("trạng thái thanh toán suy ra từ giao dịch và hoàn tiền", () => {
  const { db } = buildFixture();
  const booking = {
    id: 5004, code: "VTTEST-0004", userId: 8, totalPrice: 3000000, depositRequired: 900000,
    status: "confirmed", paymentStatus: "unpaid",
  };
  db.bookings.push(booking);
  assert.equal(paymentStatusFor(db, booking), "unpaid");
  db.payments.push({ id: 6004, bookingId: booking.id, amount: 900000, status: "succeeded", method: "vnpay", merchantRef: "TEST-4", paidAt: new Date().toISOString() });
  assert.equal(paymentStatusFor(db, booking), "deposit_paid");
  db.payments.push({ id: 6005, bookingId: booking.id, amount: 2100000, status: "succeeded", method: "vnpay", merchantRef: "TEST-5", paidAt: new Date().toISOString() });
  assert.equal(paymentStatusFor(db, booking), "paid");
  db.refunds.push({ id: 7001, bookingId: booking.id, amount: 500000, status: "completed", type: "cash_back" });
  assert.equal(paymentStatusFor(db, booking), "partially_refunded");
  db.refunds.push({ id: 7002, bookingId: booking.id, amount: 2500000, status: "completed", type: "cash_back" });
  assert.equal(paymentStatusFor(db, booking), "refunded");
});

test("hành động khách phụ thuộc trạng thái đơn và quyền sở hữu", () => {
  const { db, tour, departure } = buildFixture();
  const customer = { id: 8, roles: ["customer"], permissions: [] };
  const booking = {
    id: 5005, code: "VTTEST-0005", userId: 8, departureId: departure.id,
    status: "confirmed", totalPrice: 3000000, depositRequired: 900000, paymentStatus: "deposit_paid",
    adults: 2, children: 0, infants: 0, singles: 0, changeCount: 0, createdAt: new Date().toISOString(),
  };
  db.bookings.push(booking);
  const dep = { ...departure, departureDate: addDays(todayVN(), 12), returnDate: addDays(todayVN(), 14) };
  const actions = allowedActionsFor(db, booking, dep, customer);
  assert.ok(actions.includes("pay_balance"));
  assert.ok(actions.includes("cancel"));
  assert.ok(actions.includes("request_change"));
  assert.ok(actions.includes("edit_passengers"));
  const otherUser = allowedActionsFor(db, booking, dep, { id: 99, roles: ["customer"] });
  assert.deepEqual(otherUser, []);
});

test("cấu hình mặc định đọc đúng kiểu số", () => {
  const { db } = buildFixture();
  assert.equal(cfgNumber(db, "booking.max_pax_online", 0), 10);
  assert.equal(cfgNumber(db, "deposit.default_percent", 0), 30);
  const policy = getPolicy(db, { cancellationPolicyId: db.cancellationPolicies[0].id });
  assert.equal(policy.code, "STANDARD-DOMESTIC");
  assert.equal(policy.tiers[0].feePercent, 10);
});

test("nhắc thanh toán phần còn lại trong 3 ngày và chỉ gửi một lần mỗi ngày", () => {
  const { db, nearDeparture, today } = buildFixture();
  const customer = db.users.find((user) => user.roles.includes("customer"));
  const booking = {
    id: 9101, code: "VTTEST-9101", userId: customer.id, departureId: nearDeparture.id,
    status: "confirmed", paymentStatus: "deposit_paid", totalPrice: 5000000, paidAmount: 1500000,
    balanceDueDate: addDays(today, 2), contactName: customer.fullName, contactEmail: customer.email,
    contactPhone: "0912345678", adults: 1, children: 0, infants: 0, singles: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  db.bookings.push(booking);
  db.payments.push({
    id: 9201, bookingId: booking.id, amount: 1500000, status: "succeeded", method: "vnpay",
    purpose: "deposit", merchantRef: "VTTEST-9101-DEP", createdAt: new Date().toISOString(),
  });
  assert.equal(sweepDb(db), true);
  const reminders = db.notifications.filter((item) => item.type === "booking.payment_reminder" && item.userId === customer.id);
  assert.equal(reminders.length, 1);
  assert.match(reminders[0].content, /3\.500\.000/);
  assert.equal(booking.paymentRemindedAt, today);
  assert.equal(sweepDb(db), false);
  assert.equal(db.notifications.filter((item) => item.type === "booking.payment_reminder").length, 1);
});
