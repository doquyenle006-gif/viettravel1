import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addDays, todayVN } from "../server/util.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEBHOOK_SECRET = "integration-test-webhook-secret";
const PORT = 19000 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
let dataDir;
let child;
let customerToken;
let adminToken;
let user2Token;
let bookingCode;
let farDeparture;
let tourId;

function waitForServer(proc) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("API server did not start in time")), 20000);
    const onData = (chunk) => {
      if (String(chunk).includes("VietTrails API")) {
        clearTimeout(timer);
        proc.stdout.off("data", onData);
        resolve();
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", (chunk) => {
      const text = String(chunk);
      if (text.includes("Error")) {
        clearTimeout(timer);
        reject(new Error(text));
      }
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`API server exited with ${code}`));
    });
  });
}

async function call(method, endpoint, { token, body, headers } = {}) {
  const response = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  return { status: response.status, body: payload, headers: response.headers };
}

async function login(email, password = "Demo@1234") {
  const result = await call("POST", "/auth/login", { body: { email, password } });
  assert.equal(result.status, 200, `login ${email}: ${JSON.stringify(result.body)}`);
  return result.body.data.accessToken;
}

function bookingPayload(departureId, name, email, phone) {
  return {
    departureId,
    contact: { fullName: name, email, phone },
    passengers: [{ fullName: name, gender: "female", dateOfBirth: "1990-05-12" }],
    termsAccepted: true,
    termsVersion: "2026-01",
    payment: { purpose: "deposit" },
  };
}

function webhookBody(eventId, merchantRef, amount, status = "success") {
  const signature = crypto.createHmac("sha256", WEBHOOK_SECRET)
    .update(`vnpay|${eventId}|${merchantRef}|${amount}|${status}`).digest("hex");
  return { eventId, merchantRef, providerTxnId: `PG-${eventId}`, amount, status, signature };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "viettrails-test-"));
  child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      VIETTRAILS_DB_DRIVER: "json",
      VIETTRAILS_DATA_DIR: dataDir,
      PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
      AUTH_SECRET: "integration-test-auth-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(child);
});

after(() => {
  if (child && !child.killed) child.kill("SIGTERM");
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

test("API nghiệp vụ end-to-end", async (t) => {
  await t.test("công khai: cấu hình, danh sách và chi tiết tour", async () => {
    const config = await call("GET", "/config/public");
    assert.equal(config.status, 200);
    assert.ok(config.body.data.paymentMethods.length >= 3);
    assert.equal(config.body.data.termsVersion, "2026-01");

    const origin = BASE.slice(0, -"/api/v1".length);
    const sitemap = await fetch(`${origin}/sitemap.xml`);
    assert.equal(sitemap.status, 200);
    const sitemapXml = await sitemap.text();
    assert.match(sitemapXml, /<urlset/);
    assert.match(sitemapXml, /<loc>[^<]*\/tours\/[^<]+<\/loc>/);
    const robots = await fetch(`${origin}/robots.txt`);
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /Sitemap: .*\/sitemap\.xml/);

    const tours = await call("GET", "/tours?pax=2&perPage=24");
    assert.equal(tours.status, 200);
    assert.ok(tours.body.data.length > 0);
    const slug = tours.body.data[0].slug;
    const detail = await call("GET", `/tours/${slug}`);
    assert.equal(detail.status, 200);
    assert.ok(detail.body.data.departures.length > 0);
    tourId = detail.body.data.id;
    farDeparture = detail.body.data.departures.find((departure) => departure.status === "open"
      && departure.seatsLeft >= 2 && departure.departureDate >= addDays(todayVN(), 15));
    assert.ok(farDeparture, "expected a far departure");
  });

  await t.test("đăng nhập và phân quyền cơ bản", async () => {
    customerToken = await login("customer@viettrails.vn");
    adminToken = await login("admin@viettrails.vn");
    const contentToken = await login("content@viettrails.vn");
    assert.ok(customerToken && adminToken && contentToken);

    const me = await call("GET", "/me", { token: customerToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.emailVerified, true);

    const forbidden = await call("GET", "/admin/payments", { token: customerToken });
    assert.equal(forbidden.status, 403);

    const contentTours = await call("GET", "/admin/tours", { token: contentToken });
    assert.equal(contentTours.status, 200);
    const contentConfirm = await call("POST", "/admin/payments/1/confirm", { token: contentToken, body: { receivedAmount: 1 } });
    assert.equal(contentConfirm.status, 403);
    assert.equal(contentConfirm.body.error.code, "FORBIDDEN");
  });

  await t.test("tạo đơn với Idempotency-Key không tạo đơn trùng", async () => {
    const payload = bookingPayload(farDeparture.id, "Nguyễn An Nhiên", "customer@viettrails.vn", "0912345678");
    const key = `idem-${crypto.randomUUID()}`;
    const first = await call("POST", "/bookings", { token: customerToken, body: payload, headers: { "Idempotency-Key": key } });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    bookingCode = first.body.data.code;
    const countBefore = (await call("GET", "/me/bookings", { token: customerToken })).body.meta.total;
    const second = await call("POST", "/bookings", { token: customerToken, body: payload, headers: { "Idempotency-Key": key } });
    assert.equal(second.status, 200);
    assert.equal(second.body.data.code, bookingCode);
    const countAfter = (await call("GET", "/me/bookings", { token: customerToken })).body.meta.total;
    assert.equal(countBefore, countAfter);

    const detail = await call("GET", `/me/bookings/${bookingCode}`, { token: customerToken });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.status, "pending");
    assert.equal(detail.body.data.channel, "web");
  });

  await t.test("outbox: nhân viên xem nhật ký gửi và gửi lại thông báo", async () => {
    const forbidden = await call("GET", "/admin/outbox", { token: customerToken });
    assert.equal(forbidden.status, 403);
    const list = await call("GET", "/admin/outbox", { token: adminToken });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(list.body.data.length > 0);
    const row = list.body.data[0];
    const retry = await call("POST", `/admin/outbox/${row.id}/retry`, { token: adminToken, body: {} });
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.data.status, "sent");
    assert.equal(retry.body.data.attempts, (row.attempts || 0) + 1);
    const logs = await call("GET", "/admin/audit-logs?action=notification.retry", { token: adminToken });
    assert.ok(logs.body.data.some((item) => item.entity === "outbox" && Number(item.entityId) === row.id));
  });

  await t.test("không bán vượt chỗ khi hai khách đặt đồng thời", async () => {
    const date = addDays(todayVN(), 25);
    const departure = await call("POST", "/admin/departures", {
      token: adminToken,
      body: {
        tourId, departureDate: date, capacity: 1, minPaxToRun: 1,
        priceAdult: 2500000, priceChild: 1750000, priceInfant: 0, singleSupplement: 500000,
        meetingPoint: "Văn phòng VietTrails", meetingTime: "06:30", status: "open",
      },
    });
    assert.equal(departure.status, 200, JSON.stringify(departure.body));
    const departureId = departure.body.data.departure.id;

    const email = `race-${Date.now()}@example.com`;
    const registration = await call("POST", "/auth/register", {
      body: { fullName: "Trần Thử Nghiệm", email, phone: "0987654321", password: "Test@12345", termsAccepted: true },
    });
    assert.equal(registration.status, 200, JSON.stringify(registration.body));
    user2Token = registration.body.data.accessToken;
    const outbox = await call("GET", "/dev/outbox");
    const mail = outbox.body.data.find((item) => item.to === email && item.link.includes("verify-email"));
    assert.ok(mail, "verification mail expected");
    const token = new URL(`http://x${mail.link}`).searchParams.get("token");
    const verified = await call("POST", "/auth/verify-email", { body: { token } });
    assert.equal(verified.status, 200);

    const firstPayload = bookingPayload(departureId, "Nguyễn An Nhiên", "customer@viettrails.vn", "0912345678");
    const secondPayload = bookingPayload(departureId, "Trần Thử Nghiệm", email, "0987654321");
    const [a, b] = await Promise.all([
      call("POST", "/bookings", { token: customerToken, body: firstPayload, headers: { "Idempotency-Key": crypto.randomUUID() } }),
      call("POST", "/bookings", { token: user2Token, body: secondPayload, headers: { "Idempotency-Key": crypto.randomUUID() } }),
    ]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    assert.deepEqual(statuses, [200, 409]);
    const failed = a.status === 409 ? a : b;
    assert.equal(failed.body.error.code, "SEAT_UNAVAILABLE");
    const winner = a.status === 200 ? a : b;
    const loserToken = a.status === 200 ? user2Token : customerToken;
    assert.ok(winner.body.data.code);

    const idor = await call("GET", `/me/bookings/${winner.body.data.code}`, { token: loserToken });
    assert.equal(idor.status, 404);
  });

  await t.test("webhook thanh toán idempotent theo eventId", async () => {
    const initiation = await call("POST", `/bookings/${bookingCode}/payments`, {
      token: customerToken, body: { purpose: "deposit", method: "vnpay" },
    });
    assert.equal(initiation.status, 200, JSON.stringify(initiation.body));
    const payment = initiation.body.data.payment;
    const eventId = `EV-${crypto.randomUUID()}`;
    const body = webhookBody(eventId, payment.merchantRef, payment.amount);
    const first = await call("POST", "/webhooks/payments/vnpay", { body });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.processed, true);
    const second = await call("POST", "/webhooks/payments/vnpay", { body });
    assert.equal(second.status, 200);
    assert.equal(second.body.data.duplicate, true);

    const booking = await call("GET", `/me/bookings/${bookingCode}`, { token: customerToken });
    assert.equal(booking.body.data.status, "confirmed");
    assert.equal(booking.body.data.grossPaid, payment.amount);
    assert.equal(booking.body.data.payments.filter((item) => item.status === "succeeded").length, 1);
  });

  await t.test("webhook sai số tiền bị gắn cờ, không cộng tiền", async () => {
    const targetCode = (await call("GET", "/me/bookings", { token: user2Token })).body.data[0]?.code
      || (await call("GET", "/me/bookings", { token: customerToken })).body.data.find((item) => item.status === "pending")?.code;
    assert.ok(targetCode);
    const token = (await call("GET", `/me/bookings/${targetCode}`, { token: user2Token })).status === 200 ? user2Token : customerToken;
    const initiation = await call("POST", `/bookings/${targetCode}/payments`, {
      token, body: { purpose: "deposit", method: "vnpay" },
    });
    assert.equal(initiation.status, 200, JSON.stringify(initiation.body));
    const payment = initiation.body.data.payment;
    const eventId = `EV-${crypto.randomUUID()}`;
    const body = webhookBody(eventId, payment.merchantRef, payment.amount + 1000);
    const result = await call("POST", "/webhooks/payments/vnpay", { body });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.reason, "amount_mismatch");
    const booking = await call("GET", `/me/bookings/${targetCode}`, { token });
    assert.equal(booking.body.data.grossPaid, 0);
    assert.equal(booking.body.data.payments[0].flag, "amount_mismatch");
  });

  await t.test("báo giá hủy, hủy đơn và hoàn tiền có tách nhiệm vụ", async () => {
    const quote = await call("GET", `/me/bookings/${bookingCode}/cancellation-quote`, { token: customerToken });
    assert.equal(quote.status, 200);
    assert.equal(quote.body.data.feePercent, 10);
    assert.ok(quote.body.data.refund > 0);

    const cancelled = await call("POST", `/me/bookings/${bookingCode}/cancel`, {
      token: customerToken, body: { reasonCode: "customer_request", note: "Thay đổi kế hoạch", confirm: true },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    const booking = await call("GET", `/me/bookings/${bookingCode}`, { token: customerToken });
    assert.equal(booking.body.data.status, "cancelled");
    assert.equal(booking.body.data.refundedAmount, 0);
    const refund = booking.body.data.refunds.find((item) => item.status === "requested");
    assert.ok(refund, "refund request expected");

    const selfApprove = await call("POST", `/admin/refunds/${refund.id}/approve`, { token: customerToken, body: {} });
    assert.ok([401, 403].includes(selfApprove.status));
    const approve = await call("POST", `/admin/refunds/${refund.id}/approve`, { token: adminToken, body: {} });
    assert.equal(approve.status, 200, JSON.stringify(approve.body));
    const process = await call("POST", `/admin/refunds/${refund.id}/process`, { token: adminToken, body: { providerRefundId: "RF-TEST" } });
    assert.equal(process.status, 200, JSON.stringify(process.body));
    const complete = await call("POST", `/admin/refunds/${refund.id}/complete`, { token: adminToken, body: {} });
    assert.equal(complete.status, 200, JSON.stringify(complete.body));
    const after = await call("GET", `/me/bookings/${bookingCode}`, { token: customerToken });
    assert.equal(after.body.data.paymentStatus, "partially_refunded");
    assert.ok(after.body.data.refundedAmount > 0);
  });

  await t.test("xung đột phiên bản tour bị chặn", async () => {
    const detail = await call("GET", `/admin/tours/${tourId}`, { token: adminToken });
    assert.equal(detail.status, 200);
    const version = detail.body.data.version;
    const name = detail.body.data.name;
    const first = await call("PUT", `/admin/tours/${tourId}`, { token: adminToken, body: { version, name } });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const second = await call("PUT", `/admin/tours/${tourId}`, { token: adminToken, body: { version, name } });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, "VERSION_CONFLICT");
  });

  await t.test("audit log ghi nhận thao tác tiền và trạng thái", async () => {
    const logs = await call("GET", "/admin/audit-logs?perPage=100", { token: adminToken });
    assert.equal(logs.status, 200);
    const actions = logs.body.data.map((row) => row.action);
    assert.ok(actions.includes("booking.create"));
    assert.ok(actions.includes("payment.succeeded"));
    assert.ok(actions.includes("booking.cancel"));
    assert.ok(actions.includes("refund.complete"));
    assert.ok(logs.body.data.every((row) => !("after" in row) || row.after === null || typeof row.after === "object"));
  });

  let bankBookingCode;
  await t.test("chuyển khoản: lệch tiền bị chặn, đúng tiền được xác nhận", async () => {
    const payload = bookingPayload(farDeparture.id, "Nguyễn An Nhiên", "customer@viettrails.vn", "0912345678");
    const created = await call("POST", "/bookings", { token: customerToken, body: payload, headers: { "Idempotency-Key": crypto.randomUUID() } });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    bankBookingCode = created.body.data.code;
    const initiation = await call("POST", `/bookings/${bankBookingCode}/payments`, {
      token: customerToken, body: { purpose: "deposit", method: "bank_transfer" },
    });
    assert.equal(initiation.status, 200, JSON.stringify(initiation.body));
    const payment = initiation.body.data.payment;
    assert.ok(initiation.body.data.bankInfo.accountNumber);
    const mismatch = await call("POST", `/admin/payments/${payment.id}/confirm`, {
      token: adminToken, body: { receivedAmount: payment.amount + 5000, paidAt: todayVN(), note: "Sai số tiền" },
    });
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.body.error.code, "PAYMENT_AMOUNT_MISMATCH");
    const confirmed = await call("POST", `/admin/payments/${payment.id}/confirm`, {
      token: adminToken, body: { receivedAmount: payment.amount, paidAt: todayVN(), note: "Đã đối chiếu sao kê" },
    });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    const booking = await call("GET", `/me/bookings/${bankBookingCode}`, { token: customerToken });
    assert.equal(booking.body.data.status, "confirmed");
  });

  await t.test("khách gửi đánh giá, duyệt và tính lại điểm tour", async () => {
    const completed = await call("GET", "/me/bookings?status=completed&perPage=50", { token: customerToken });
    assert.equal(completed.status, 200);
    const target = completed.body.data.find((booking) => booking.allowedActions.includes("review"));
    assert.ok(target, "expected a completed booking without review");
    const detail = await call("GET", `/me/bookings/${target.code}`, { token: customerToken });
    assert.equal(detail.body.data.review, null);
    const review = await call("POST", `/me/bookings/${target.code}/review`, {
      token: customerToken,
      body: { rating: 4, comment: "Chuyến đi tốt, hướng dẫn viên chu đáo và lịch trình hợp lý." },
    });
    assert.equal(review.status, 200, JSON.stringify(review.body));
    assert.equal(review.body.data.status, "pending");
    const approved = await call("POST", `/admin/reviews/${review.body.data.id}/approve`, { token: adminToken, body: {} });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const tour = await call("GET", `/tours/${detail.body.data.tour.slug}`);
    assert.equal(tour.status, 200);
    assert.ok(tour.body.data.ratingCount >= 1);
    assert.ok(tour.body.data.reviews.some((item) => item.comment.includes("hướng dẫn viên chu đáo")));
  });

  await t.test("yêu cầu và xuất hóa đơn điện tử", async () => {
    const request = await call("POST", `/me/bookings/${bankBookingCode}/invoice`, {
      token: customerToken,
      body: { taxCode: "0101234567", companyName: "Công ty Thử Nghiệm", address: "Hà Nội", email: "invoice@example.com" },
    });
    assert.equal(request.status, 200, JSON.stringify(request.body));
    const invoiceId = request.body.data.id;
    const issued = await call("POST", `/admin/invoices/${invoiceId}/issue`, {
      token: adminToken, body: { invoiceNo: `INV-${Date.now()}`, note: "Xuất tự động trong test" },
    });
    assert.equal(issued.status, 200, JSON.stringify(issued.body));
    const booking = await call("GET", `/me/bookings/${bankBookingCode}`, { token: customerToken });
    assert.equal(booking.body.data.invoice.status, "issued");
  });

  await t.test("guide chỉ thấy chuyến được phân công và manifest che giấy tờ", async () => {
    const guideToken = await login("guide@viettrails.vn");
    const guideDepartures = await call("GET", "/admin/departures?perPage=100", { token: guideToken });
    assert.equal(guideDepartures.status, 200);
    assert.equal(guideDepartures.body.data.length, 1);
    const assigned = guideDepartures.body.data[0];
    const manifest = await call("GET", `/admin/departures/${assigned.id}/manifest`, { token: guideToken });
    assert.equal(manifest.status, 200);
    assert.ok(manifest.body.data.html.includes("Bản che giấy tờ"));
    const all = await call("GET", "/admin/departures?perPage=100", { token: adminToken });
    const other = all.body.data.find((departure) => departure.id !== assigned.id);
    const forbidden = await call("GET", `/admin/departures/${other.id}/manifest`, { token: guideToken });
    assert.equal(forbidden.status, 403);
  });

  await t.test("cài đặt tham số có hiệu lực công khai và ghi nhật ký", async () => {
    const before = await call("GET", "/config/public");
    const updated = await call("PUT", "/admin/settings", { token: adminToken, body: { values: { hotline: "1900 9999" } } });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    const after = await call("GET", "/config/public");
    assert.equal(after.body.data.hotline, "1900 9999");
    assert.notEqual(before.body.data.hotline, after.body.data.hotline);
    const logs = await call("GET", "/admin/audit-logs?action=settings.update", { token: adminToken });
    assert.ok(logs.body.data.some((row) => row.entity === "setting" && row.entityId === "hotline"));
  });

  await t.test("sao lưu: phân quyền, tạo và kiểm thử khôi phục", async () => {
    const forbidden = await call("GET", "/admin/backups", { token: customerToken });
    assert.equal(forbidden.status, 403);

    const created = await call("POST", "/admin/backups", { token: adminToken, body: {} });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const filename = created.body.data.filename;
    assert.match(filename, /^db-\d{8}T\d{9}Z\.json$/);
    assert.ok(fs.existsSync(path.join(dataDir, "backups", filename)));
    assert.equal(created.body.data.checksum.length, 64);

    const list = await call("GET", "/admin/backups", { token: adminToken });
    assert.equal(list.status, 200);
    assert.ok(list.body.data.backups.some((row) => row.filename === filename));

    const verified = await call("POST", `/admin/backups/${encodeURIComponent(filename)}/verify`, { token: adminToken, body: {} });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.data.valid, true);
    assert.ok(verified.body.data.counts.tours > 0);
    assert.equal(verified.body.data.checksum, created.body.data.checksum);

    const traversal = await call("POST", "/admin/backups/..%2Fdb.json/verify", { token: adminToken, body: {} });
    assert.equal(traversal.status, 404);

    const logs = await call("GET", "/admin/audit-logs?action=system.backup", { token: adminToken });
    const actions = logs.body.data.map((row) => row.action);
    assert.ok(actions.includes("system.backup.create"));
    assert.ok(actions.includes("system.backup.verify"));
  });

  await t.test("hủy chuyến bởi công ty trả chỗ, hoàn 100% và thông báo", async () => {
    const booking = await call("GET", `/me/bookings/${bankBookingCode}`, { token: customerToken });
    const departureId = booking.body.data.departure.id;
    const gross = booking.body.data.grossPaid;
    const cancelled = await call("POST", `/admin/departures/${departureId}/cancel`, {
      token: adminToken, body: { reason: "Thiên tai, không thể vận hành an toàn", reasonCode: "force_majeure" },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.ok(cancelled.body.data.affected.includes(bankBookingCode));
    const after = await call("GET", `/me/bookings/${bankBookingCode}`, { token: customerToken });
    assert.equal(after.body.data.status, "cancelled");
    assert.equal(after.body.data.cancelBy, "company");
    const refund = after.body.data.refunds.find((item) => item.status === "requested");
    assert.ok(refund);
    assert.equal(refund.amount, gross);
  });

  await t.test("quên/đặt lại mật khẩu, 2FA và khóa tạm khi đăng nhập sai", async () => {
    const email = `auth-${Date.now()}@example.com`;
    const registration = await call("POST", "/auth/register", {
      body: { fullName: "Người Thử Xác Thực", email, phone: "0909999888", password: "Test@12345", termsAccepted: true },
    });
    assert.equal(registration.status, 200, JSON.stringify(registration.body));
    const outbox = await call("GET", "/dev/outbox");
    const verifyMail = outbox.body.data.find((item) => item.to === email && item.link.includes("verify-email"));
    const verifyToken = new URL(`http://x${verifyMail.link}`).searchParams.get("token");
    assert.equal((await call("POST", "/auth/verify-email", { body: { token: verifyToken } })).status, 200);

    assert.equal((await call("POST", "/auth/forgot-password", { body: { email } })).status, 200);
    const outbox2 = await call("GET", "/dev/outbox");
    const resetMail = outbox2.body.data.filter((item) => item.to === email && item.link.includes("reset-password")).at(-1);
    assert.ok(resetMail);
    const resetToken = new URL(`http://x${resetMail.link}`).searchParams.get("token");
    const reset = await call("POST", "/auth/reset-password", { body: { token: resetToken, password: "NewPass@123" } });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.equal((await call("POST", "/auth/login", { body: { email, password: "Test@12345" } })).status, 401);
    const token = await login(email, "NewPass@123");

    const setup = await call("POST", "/me/mfa/setup", { token });
    assert.equal(setup.status, 200);
    const code = setup.body.data.codePreview;
    assert.equal((await call("POST", "/me/mfa/enable", { token, body: { code } })).status, 200);
    const mfaRequired = await call("POST", "/auth/login", { body: { email, password: "NewPass@123" } });
    assert.equal(mfaRequired.status, 422);
    assert.equal(mfaRequired.body.error.mfaRequired, true);
    const mfaLogin = await call("POST", "/auth/login", { body: { email, password: "NewPass@123", totp: code } });
    assert.equal(mfaLogin.status, 200, JSON.stringify(mfaLogin.body));

    const lockEmail = `lock-${Date.now()}@example.com`;
    await call("POST", "/auth/register", {
      body: { fullName: "Người Bị Khóa", email: lockEmail, password: "Test@12345", termsAccepted: true },
    });
    for (let attempt = 0; attempt < 5; attempt++) {
      const failed = await call("POST", "/auth/login", { body: { email: lockEmail, password: "SaiMatKhau@1" } });
      assert.equal(failed.status, 401);
    }
    const locked = await call("POST", "/auth/login", { body: { email: lockEmail, password: "Test@12345" } });
    assert.equal(locked.status, 423);
    assert.equal(locked.body.error.code, "ACCOUNT_LOCKED");
  });
});
