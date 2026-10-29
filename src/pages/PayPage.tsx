import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { BookingDetail, Payment } from "../types";
import { api, isApiError } from "../lib/api";
import { useApi } from "../lib/hooks";
import { usePublicConfig } from "../lib/config";
import { diffDays, formatDate, formatDateTime, formatVnd, todayIso } from "../lib/format";
import { Seo } from "../components/Seo";
import { Icon } from "../components/Icon";
import { BankTransferPanel, HoldCountdown, PaymentMethodPicker, PriceSummary } from "../components/booking";
import { EmptyState, ErrorState, Notice, PageLoader, StatusChip } from "../components/ui";
import { useToast } from "../components/Toast";

interface BankInfo {
  bank: string;
  bin?: string;
  accountName: string;
  accountNumber: string;
  branch: string;
  amount: number;
  content: string;
}

interface PaymentInit {
  payment: Payment;
  gatewayUrl?: string | null;
  bankInfo?: BankInfo | null;
  settled?: boolean;
}

export default function PayPage() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const config = usePublicConfig();
  const toast = useToast();
  const bookingState = useApi<BookingDetail>(code ? `/me/bookings/${encodeURIComponent(code)}` : null, [code]);
  const booking = bookingState.data;
  const initialPurpose = params.get("purpose") === "full" ? "full" : "deposit";
  const [purpose, setPurpose] = useState<"deposit" | "full" | "balance">(initialPurpose);
  const [method, setMethod] = useState("vnpay");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [bankInfo, setBankInfo] = useState<BankInfo | null>(null);
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remaining = booking ? Math.max(0, booking.grossPaid >= booking.total ? 0 : booking.total - booking.grossPaid) : 0;
  const depositDue = booking ? Math.min(remaining, Math.max(0, booking.depositRequired - booking.grossPaid)) : 0;
  const fullRequired = booking ? diffDays(todayIso(), booking.departure.departureDate) <= config.fullRequiredDays : false;
  const daysToDeparture = booking ? diffDays(todayIso(), booking.departure.departureDate) : 0;
  const dueNow = purpose === "full" ? remaining : purpose === "deposit" ? (fullRequired ? remaining : depositDue) : remaining;
  const existingBankPayment = useMemo(
    () => booking?.payments.find((item) => item.method === "bank_transfer" && ["initiated", "pending"].includes(item.status)) || null,
    [booking],
  );

  useEffect(() => {
    if (!booking) return;
    if (booking.status === "confirmed" && remaining > 0) setPurpose("balance");
    else if (booking.status === "pending") setPurpose(fullRequired ? "full" : initialPurpose === "full" ? "full" : "deposit");
    const firstEnabled = config.paymentMethods.find((item) => item.enabled);
    if (firstEnabled && !config.paymentMethods.find((item) => item.id === method)?.enabled) setMethod(firstEnabled.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.code, booking?.status, fullRequired]);

  useEffect(() => {
    if (existingBankPayment) {
      setPayment(existingBankPayment);
      setMethod("bank_transfer");
      setBankInfo((current) => current || {
        bank: config.bank.name, bin: config.bank.bin, accountName: config.bank.accountName, accountNumber: config.bank.accountNumber,
        branch: config.bank.branch, amount: existingBankPayment.amount, content: booking?.code || "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingBankPayment?.id]);

  const startPayment = async () => {
    if (!booking) return;
    setStarting(true);
    setError(null);
    try {
      const result = await api<PaymentInit>(`/bookings/${booking.code}/payments`, {
        method: "POST",
        body: { purpose, method },
        timeoutMs: 20000,
      });
      if (result.settled) {
        toast.success("Đã ghi nhận thanh toán.");
        bookingState.reload();
        return;
      }
      setPayment(result.payment);
      if (result.bankInfo) {
        setBankInfo(result.bankInfo);
        toast.info("Đã tạo yêu cầu chuyển khoản. Vui lòng chuyển đúng số tiền và nội dung.");
      }
      if (result.gatewayUrl) {
        navigate(result.gatewayUrl);
      }
    } catch (err) {
      if (isApiError(err)) {
        setError(err.message);
        if (err.code === "PAYMENT_ALREADY_SETTLED") bookingState.reload();
        if (err.code === "HOLD_EXPIRED" || err.code === "INVALID_STATE_TRANSITION") bookingState.reload();
      } else {
        setError("Không kết nối được cổng thanh toán. Vui lòng thử lại.");
      }
    } finally {
      setStarting(false);
    }
  };

  const uploadProof = async (dataUrl: string) => {
    if (!payment) return;
    setProofPreview(dataUrl);
    setUploading(true);
    try {
      await api(`/payments/${payment.id}/proof`, { method: "POST", body: { proofUrl: dataUrl }, timeoutMs: 30000 });
      toast.success("Đã gửi chứng từ. Kế toán sẽ đối chiếu và xác nhận.");
      bookingState.reload();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Chưa tải được chứng từ.");
    } finally {
      setUploading(false);
    }
  };

  if (bookingState.loading && !booking) return <div className="container narrow-page"><PageLoader label="Đang tải đơn" /></div>;
  if (bookingState.error) return <div className="container narrow-page"><ErrorState error={bookingState.error} onRetry={bookingState.reload} /></div>;
  if (!booking) return null;

  const payable = ["pending", "confirmed"].includes(booking.status) && remaining > 0;
  const showBank = method === "bank_transfer" && payment && bankInfo;
  const wasExpired = booking.status === "expired";

  return (
    <>
      <Seo title={`Thanh toán đơn ${booking.code}`} noindex />
      <div className="container checkout-layout">
        <div className="checkout-main">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Thanh toán</p>
              <h1 style={{ color: "var(--green)", fontSize: 30 }}>Đơn {booking.code}</h1>
              <div className="booking-chips" style={{ marginTop: 8 }}>
                <StatusChip status={booking.status} kind="booking" />
                <StatusChip status={booking.paymentStatus} kind="payment" />
              </div>
            </div>
            <Link to={`/account/bookings/${booking.code}`} className="btn btn-ghost btn-sm">Chi tiết đơn</Link>
          </div>

          {booking.holdExpiresAt && booking.status === "pending" ? (
            <div style={{ marginBottom: 16 }}>
              <HoldCountdown expiresAt={booking.holdExpiresAt} onExpire={bookingState.reload} />
            </div>
          ) : null}

          {error ? <Notice tone="danger" title="Chưa thể thanh toán">{error}</Notice> : null}

          {wasExpired ? (
            <Notice tone="danger" title="Đơn đã hết hạn giữ chỗ">
              Chỗ đã được trả lại. Nếu tiền đã về, hệ thống sẽ ghi nhận và xử lý hoàn tiền nếu không còn chỗ.{" "}
              <Link to={`/tours/${booking.tour.slug}`} className="text-link">Kiểm tra còn chỗ & đặt lại</Link>
            </Notice>
          ) : null}
          {booking.status === "cancelled" ? (
            <Notice tone="danger" title="Đơn đã hủy">Không thể thanh toán đơn đã hủy. Xem chi tiết hoàn tiền trong đơn.</Notice>
          ) : null}

          {!payable && !wasExpired && booking.status !== "cancelled" ? (
            <Notice tone="success" title="Đơn đã thanh toán đủ">
              Không cần thanh toán thêm. Bạn có thể tải voucher trong <Link to={`/account/bookings/${booking.code}`} className="text-link">chi tiết đơn</Link>.
            </Notice>
          ) : null}

          {payable ? (
            <>
              <div className="checkout-section">
                <h2>Số tiền cần thanh toán</h2>
                <div className="summary-list" style={{ marginTop: 10 }}>
                  <div><span>Tổng giá trị đơn</span><strong>{formatVnd(booking.total)}</strong></div>
                  <div><span>Đã thanh toán</span><strong>{formatVnd(booking.grossPaid)}</strong></div>
                  <div><span>Còn lại</span><strong style={{ color: "var(--green)" }}>{formatVnd(remaining)}</strong></div>
                </div>
                {booking.status === "pending" ? (
                  <>
                    {!fullRequired ? (
                      <label className="radio-card" style={{ marginTop: 14 }}>
                        <input type="radio" name="pay-purpose" checked={purpose === "deposit"} onChange={() => setPurpose("deposit")} />
                        <span><strong>Đặt cọc {Math.min(100, Math.round((booking.depositRequired / booking.total) * 100))}% — {formatVnd(depositDue)}</strong><span>Phần còn lại trước {formatDate(booking.balanceDueDate)}</span></span>
                      </label>
                    ) : <Notice tone="warning" title="Cần thanh toán toàn bộ">Chuyến khởi hành trong {daysToDeparture} ngày tới.</Notice>}
                    <label className="radio-card">
                      <input type="radio" name="pay-purpose" checked={purpose === "full" || fullRequired} onChange={() => setPurpose("full")} />
                      <span><strong>Thanh toán toàn bộ — {formatVnd(remaining)}</strong><span>Đơn được xác nhận ngay khi cổng báo thành công</span></span>
                    </label>
                  </>
                ) : <p className="field-hint">Thanh toán phần còn lại {formatVnd(remaining)}.</p>}
              </div>

              <div className="checkout-section">
                <h2>Phương thức thanh toán</h2>
                <p>Chọn phương thức phù hợp. Số tiền do máy chủ xác định, bạn không thể sửa.</p>
                <PaymentMethodPicker methods={config.paymentMethods} value={method} onChange={(value) => { setMethod(value); setPayment(null); setBankInfo(null); }} />
                {method === "bank_transfer" ? (
                  <p className="field-hint">Sau khi chuyển khoản, tải ảnh chứng từ để kế toán xác nhận. Đơn sẽ được xác nhận sau khi đối chiếu.</p>
                ) : null}
                <div className="checkout-actions">
                  <Link to="/account/bookings" className="btn btn-ghost">Thanh toán sau</Link>
                  <button type="button" className="btn btn-primary btn-lg" onClick={startPayment} disabled={starting || dueNow <= 0}>
                    {starting ? "Đang kết nối…" : `Thanh toán ${formatVnd(dueNow)}`}
                  </button>
                </div>
              </div>

              {showBank ? (
                <div className="checkout-section">
                  <h2>Thông tin chuyển khoản</h2>
                  <BankTransferPanel
                    bankInfo={bankInfo}
                    bookingCode={booking.code}
                    onProof={uploadProof}
                    uploading={uploading}
                    proofPreview={proofPreview || payment?.proofUrl}
                  />
                  {payment?.status === "pending" ? <Notice tone="info">Chứng từ đã được gửi. Trạng thái: chờ kế toán xác nhận.</Notice> : null}
                  <button type="button" className="btn btn-outline" onClick={bookingState.reload} style={{ marginTop: 10 }}>Làm mới trạng thái</button>
                </div>
              ) : null}
            </>
          ) : null}

          {booking.payments.length ? (
            <div className="checkout-section">
              <h2>Giao dịch của đơn</h2>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Mã giao dịch</th><th>Mục đích</th><th>Số tiền</th><th>Trạng thái</th><th>Thời điểm</th></tr></thead>
                  <tbody>
                    {booking.payments.map((item) => (
                      <tr key={item.id}>
                        <td><span className="row-title" style={{ fontFamily: "monospace", fontSize: 12 }}>{item.merchantRef}</span></td>
                        <td>{item.purpose === "deposit" ? "Đặt cọc" : item.purpose === "full" ? "Toàn bộ" : "Phần còn lại"}</td>
                        <td>{formatVnd(item.amount)}</td>
                        <td><StatusChip status={item.status} kind="txn" size="sm" /></td>
                        <td>{formatDateTime(item.paidAt || item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="checkout-aside">
          <div className="summary-card">
            <div className="summary-tour">
              <Icon name="ticket" size={28} />
              <div><strong>{booking.tour.name}</strong><span>{formatDate(booking.departure.departureDate)} · {booking.tour.destinationName}</span></div>
            </div>
            <PriceSummary
              quote={{
                departureId: booking.departure.id, departure: booking.departure, lines: booking.priceSnapshot,
                subtotal: booking.subtotal, discountTotal: booking.discountTotal, total: booking.total,
                coupon: booking.couponCode ? { code: booking.couponCode, valid: true } : null,
                deposit: { percent: 0, amount: booking.depositRequired, dueNow, balance: Math.max(0, booking.total - booking.depositRequired) },
                balanceDueDate: booking.balanceDueDate || "", fullPaymentRequired: fullRequired, daysToDeparture: diffDays(todayIso(), booking.departure.departureDate),
                adults: booking.adults, children: booking.children, infants: booking.infants, singles: booking.singles,
                seatsRequired: 0, seatsLeft: booking.departure.seatsLeft, reclassified: [], notices: [], existingPending: null, serverTime: "",
              }}
              compact
            />
            <div className="summary-divider" />
            <div className="summary-list">
              <div><span>Cần trả bây giờ</span><strong style={{ color: "var(--green)", fontSize: 17 }}>{formatVnd(dueNow)}</strong></div>
              <div><span>Hạn thanh toán phần còn lại</span><strong>{formatDate(booking.balanceDueDate)}</strong></div>
            </div>
          </div>
          <div className="trust-note" style={{ justifyContent: "center" }}><Icon name="shield" size={14} /> Giao dịch được xác thực từ máy chủ</div>
        </aside>
      </div>

      {booking.status === "expired" && booking.payments.length === 0 ? (
        <div className="container">
          <EmptyState icon="clock" title="Không có giao dịch nào" description="Đơn hết hạn trước khi thanh toán." action={<Link to={`/tours/${booking.tour.slug}`} className="btn btn-primary">Đặt lại</Link>} />
        </div>
      ) : null}
    </>
  );
}
