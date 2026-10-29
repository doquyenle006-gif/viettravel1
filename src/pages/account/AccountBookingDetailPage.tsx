import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { BookingDetail, Departure, Passenger, Payment, Refund } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { usePublicConfig } from "../../lib/config";
import { CANCEL_REASONS } from "../../lib/errors";
import { formatDate, formatDateTime, formatPax, formatVnd, openHtmlDocument } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { Icon } from "../../components/Icon";
import { CoverArt } from "../../components/CoverArt";
import { HoldCountdown } from "../../components/booking";
import { CopyButton, EmptyState, ErrorState, Field, InfoList, Notice, PageLoader, StatusChip, Tabs, Timeline } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";

interface CancelQuote {
  daysToDeparture: number;
  feePercent: number;
  fee: number;
  refund: number;
  grossPaid: number;
  autoApprove: boolean;
  requiresApproval: boolean;
  refundSlaDays: number;
  policyName: string;
  tiers: { minDaysBefore: number; maxDaysBefore: number | null; feePercent: number }[];
}

interface ChangeQuote {
  newDeparture: Departure;
  newTotal: number;
  difference: number;
  feePercent: number;
  fee: number;
  amountDue: number;
  refund: number;
  note: string;
}

export default function AccountBookingDetailPage() {
  const { code } = useParams();
  const config = usePublicConfig();
  const toast = useToast();
  const state = useApi<BookingDetail>(code ? `/me/bookings/${encodeURIComponent(code)}` : null, [code]);
  const booking = state.data;
  const [tab, setTab] = useState("overview");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelQuote, setCancelQuote] = useState<CancelQuote | null>(null);
  const [cancelReason, setCancelReason] = useState("customer_request");
  const [cancelNote, setCancelNote] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeDepartures, setChangeDepartures] = useState<Departure[]>([]);
  const [newDepartureId, setNewDepartureId] = useState<number | null>(null);
  const [changeQuote, setChangeQuote] = useState<ChangeQuote | null>(null);
  const [changeLoading, setChangeLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editPassengers, setEditPassengers] = useState<Passenger[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ taxCode: "", companyName: "", address: "", email: booking?.contact.email || "" });
  const [invoiceErrors, setInvoiceErrors] = useState<Record<string, string>>({});
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  if (state.loading && !booking) return <div className="container narrow-page"><PageLoader label="Đang tải đơn" /></div>;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!booking) return null;

  const openCancel = async () => {
    setCancelOpen(true);
    setCancelQuote(null);
    setDialogError(null);
    setCancelReason("customer_request");
    try {
      const data = await api<CancelQuote>(`/me/bookings/${booking.code}/cancellation-quote`);
      setCancelQuote(data);
    } catch (error) {
      setDialogError(isApiError(error) ? error.message : "Chưa lấy được báo giá hủy.");
    }
  };

  const doCancel = async () => {
    setCancelLoading(true);
    setDialogError(null);
    try {
      const result = await api<{ cancelled?: boolean; requiresApproval?: boolean; quote?: CancelQuote }>(`/me/bookings/${booking.code}/cancel`, {
        method: "POST",
        body: { reasonCode: cancelReason, note: cancelNote, confirm: true },
      });
      setCancelOpen(false);
      if (result.requiresApproval) toast.success("Yêu cầu hủy đã được gửi tới nhân viên.", "Chờ duyệt");
      else toast.success("Đơn đã được hủy.");
      state.reload();
    } catch (error) {
      setDialogError(isApiError(error) ? error.message : "Chưa hủy được đơn.");
    } finally {
      setCancelLoading(false);
    }
  };

  const openChange = async () => {
    setChangeOpen(true);
    setChangeQuote(null);
    setNewDepartureId(null);
    setDialogError(null);
    try {
      const data = await api<Departure[]>(`/tours/${booking.tour.id}/departures`);
      setChangeDepartures(data.filter((item) => item.status === "open" && item.seatsLeft > 0 && item.id !== booking.departure.id));
    } catch (error) {
      setDialogError(isApiError(error) ? error.message : "Chưa tải được lịch khác.");
    }
  };

  const loadChangeQuote = async (departureId: number) => {
    setNewDepartureId(departureId);
    setChangeQuote(null);
    try {
      const data = await api<ChangeQuote>(`/me/bookings/${booking.code}/change-quote`, { method: "POST", body: { newDepartureId: departureId } });
      setChangeQuote(data);
    } catch (error) {
      setDialogError(isApiError(error) ? error.message : "Chưa lấy được báo giá đổi ngày.");
    }
  };

  const submitChange = async () => {
    if (!newDepartureId) return;
    setChangeLoading(true);
    setDialogError(null);
    try {
      await api(`/me/bookings/${booking.code}/change-request`, { method: "POST", body: { newDepartureId } });
      setChangeOpen(false);
      toast.success("Yêu cầu đổi ngày đã được gửi và đang chờ duyệt.");
      state.reload();
    } catch (error) {
      setDialogError(isApiError(error) ? error.message : "Chưa gửi được yêu cầu.");
    } finally {
      setChangeLoading(false);
    }
  };

  const openEdit = () => {
    setEditPassengers(booking.passengers.map((passenger) => ({ ...passenger })));
    setEditOpen(true);
    setDialogError(null);
  };

  const savePassengers = async () => {
    setEditSaving(true);
    setDialogError(null);
    try {
      await api(`/me/bookings/${booking.code}/passengers`, {
        method: "PATCH",
        body: {
          passengers: editPassengers.map((passenger) => ({
            fullName: passenger.fullName, gender: passenger.gender, dateOfBirth: passenger.dateOfBirth,
            idNumber: passenger.idNumber, passportNumber: passenger.passportNumber,
            nationality: passenger.nationality, specialRequest: passenger.specialRequest,
          })),
        },
      });
      setEditOpen(false);
      toast.success("Đã cập nhật thông tin hành khách.");
      state.reload();
    } catch (error) {
      setDialogError(isApiError(error) ? error.message : "Chưa lưu được thông tin.");
    } finally {
      setEditSaving(false);
    }
  };

  const downloadVoucher = async () => {
    try {
      const data = await api<{ html: string; filename: string }>(`/me/bookings/${booking.code}/voucher`);
      openHtmlDocument(data.html, data.filename);
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "Chưa tải được voucher.");
    }
  };

  const submitInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    setInvoiceSaving(true);
    setInvoiceErrors({});
    try {
      await api(`/me/bookings/${booking.code}/invoice`, { method: "POST", body: invoiceForm });
      setInvoiceOpen(false);
      toast.success("Yêu cầu xuất hóa đơn đã được gửi.");
      state.reload();
    } catch (error) {
      if (isApiError(error)) {
        setInvoiceErrors(error.fields || {});
        setDialogError(error.message);
      } else setDialogError("Chưa gửi được yêu cầu hóa đơn.");
    } finally {
      setInvoiceSaving(false);
    }
  };

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    setReviewSaving(true);
    setDialogError(null);
    try {
      await api(`/me/bookings/${booking.code}/review`, { method: "POST", body: reviewForm });
      setReviewOpen(false);
      toast.success("Cảm ơn bạn! Đánh giá sẽ hiển thị sau khi được duyệt.");
      state.reload();
    } catch (error) {
      setDialogError(isApiError(error) ? error.message : "Chưa gửi được đánh giá.");
    } finally {
      setReviewSaving(false);
    }
  };

  const todo = booking.status === "pending"
    ? booking.holdExpiresAt ? "Hoàn tất thanh toán để giữ chỗ." : null
    : booking.status === "confirmed" && booking.remaining > 0
      ? `Thanh toán phần còn lại ${formatVnd(booking.remaining)} trước ${formatDate(booking.balanceDueDate)}.`
      : booking.status === "completed" && booking.allowedActions.includes("review")
        ? "Chia sẻ cảm nhận về chuyến đi — đánh giá sẽ được duyệt trước khi hiển thị."
        : null;

  const paymentRows = (items: Payment[]) => items.map((payment) => (
    <tr key={payment.id}>
      <td><span className="row-title" style={{ fontFamily: "monospace", fontSize: 12 }}>{payment.merchantRef}</span><span className="row-sub">{payment.purpose === "deposit" ? "Đặt cọc" : payment.purpose === "full" ? "Toàn bộ" : "Phần còn lại"}</span></td>
      <td>{payment.method === "bank_transfer" ? "Chuyển khoản" : payment.method === "cash" ? "Tiền mặt" : payment.method === "pos_card" ? "POS" : payment.method.toUpperCase()}</td>
      <td>{formatVnd(payment.amount)}</td>
      <td><StatusChip status={payment.status} kind="txn" size="sm" /></td>
      <td>{formatDateTime(payment.paidAt || payment.createdAt)}</td>
    </tr>
  ));

  const refundRows = (items: Refund[]) => items.map((refund) => (
    <tr key={refund.id}>
      <td>#{refund.id}</td>
      <td>{formatVnd(refund.amount)}</td>
      <td>{refund.type === "credit" ? "Bảo lưu" : "Hoàn tiền"}</td>
      <td><StatusChip status={refund.status} kind="refund" size="sm" /></td>
      <td>{refund.processedAt ? formatDateTime(refund.processedAt) : "—"}</td>
    </tr>
  ));

  return (
    <>
      <Seo title={`Đơn ${booking.code}`} noindex />
      <div className="order-head">
        <div>
          <Link to="/account/bookings" className="text-link" style={{ fontSize: 12 }}>← Đơn của tôi</Link>
          <div className="inline-actions" style={{ marginTop: 6, gap: 10 }}>
            <span className="order-code">{booking.code} <CopyButton value={booking.code} label="Sao chép" /></span>
            <StatusChip status={booking.status} kind="booking" />
            <StatusChip status={booking.paymentStatus} kind="payment" />
          </div>
          <h1 style={{ marginTop: 8, color: "var(--green)", fontSize: 26 }}>{booking.tour.name}</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            {formatDate(booking.departure.departureDate)} – {formatDate(booking.departure.returnDate)} · {booking.tour.destinationName} · {formatPax(booking.adults, booking.children, booking.infants)}
          </p>
        </div>
        <div className="action-grid" style={{ justifyContent: "flex-end" }}>
          {booking.allowedActions.includes("pay_deposit") || booking.allowedActions.includes("pay_balance") ? (
            <Link to={`/booking/${booking.code}/pay`} className="btn btn-primary">Thanh toán ngay</Link>
          ) : null}
          {booking.allowedActions.includes("download_voucher") ? <button type="button" className="btn btn-outline" onClick={downloadVoucher}><Icon name="download" size={15} /> Voucher</button> : null}
          {booking.allowedActions.includes("edit_passengers") ? <button type="button" className="btn btn-outline" onClick={openEdit}>Sửa hành khách</button> : null}
          {booking.allowedActions.includes("request_change") ? <button type="button" className="btn btn-outline" onClick={openChange}>Đổi ngày</button> : null}
          {booking.allowedActions.includes("request_invoice") ? <button type="button" className="btn btn-outline" onClick={() => { setInvoiceForm({ ...invoiceForm, email: booking.contact.email }); setDialogError(null); setInvoiceOpen(true); }}>Yêu cầu hóa đơn</button> : null}
          {booking.allowedActions.includes("review") ? <button type="button" className="btn btn-accent" onClick={() => { setDialogError(null); setReviewOpen(true); }}>Viết đánh giá</button> : null}
          {booking.allowedActions.includes("cancel") || booking.allowedActions.includes("request_cancel") ? (
            <button type="button" className="btn btn-ghost" style={{ color: "var(--danger)" }} onClick={openCancel}>
              {booking.allowedActions.includes("request_cancel") ? "Gửi yêu cầu hủy" : "Hủy đơn"}
            </button>
          ) : null}
        </div>
      </div>

      {todo ? <div className="todo-banner"><Icon name="alert" size={17} /><span>{todo}</span></div> : null}
      {booking.status === "pending" && booking.holdExpiresAt ? (
        <div style={{ marginBottom: 14 }}><HoldCountdown expiresAt={booking.holdExpiresAt} onExpire={state.reload} /></div>
      ) : null}
      {booking.status === "expired" ? <Notice tone="danger" title="Đơn đã hết hạn giữ chỗ">Chỗ đã được trả lại. Bạn có thể <Link to={`/tours/${booking.tour.slug}`} className="text-link">kiểm tra lịch còn chỗ</Link> và đặt lại.</Notice> : null}
      {booking.status === "cancelled" ? <Notice tone="danger" title="Đơn đã hủy">Lý do: {booking.cancelBy === "company" ? "Công ty hủy chuyến" : booking.cancelBy === "system" ? "Hệ thống tự hủy" : "Khách yêu cầu"}. Khoản hoàn tiền (nếu có) được xử lý theo quy định.</Notice> : null}

      <Tabs
        items={[
          { id: "overview", label: "Tổng quan" },
          { id: "passengers", label: "Hành khách" },
          { id: "payments", label: "Thanh toán" },
          { id: "history", label: "Lịch sử" },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div style={{ marginTop: 16 }}>
        {tab === "overview" ? (
          <div className="detail-grid">
            <div>
              <div className="detail-card">
                <h2>Chuyến đi</h2>
                <div className="summary-tour" style={{ marginBottom: 14 }}>
                  <CoverArt seed={booking.tour.slug} alt={booking.tour.name} />
                  <div><strong>{booking.tour.name}</strong><span>{formatDate(booking.departure.departureDate)} · {booking.tour.durationDays} ngày</span></div>
                </div>
                <InfoList items={[
                  { label: "Mã đơn", value: booking.code },
                  { label: "Ngày khởi hành", value: formatDate(booking.departure.departureDate) },
                  { label: "Ngày kết thúc", value: formatDate(booking.departure.returnDate) },
                  { label: "Điểm đón", value: booking.departure.meetingPoint },
                  { label: "Giờ đón", value: booking.departure.meetingTime },
                  { label: "Kênh đặt", value: booking.channel === "web" ? "Website" : booking.channel === "counter" ? "Tại quầy" : booking.channel === "phone" ? "Điện thoại" : "Đại lý" },
                ]} />
              </div>
              <div className="detail-card">
                <h2>Người liên hệ</h2>
                <InfoList items={[
                  { label: "Họ tên", value: booking.contact.fullName },
                  { label: "Email", value: booking.contact.email },
                  { label: "Số điện thoại", value: booking.contact.phone },
                ]} />
                {booking.customerNote ? <p className="field-hint" style={{ marginTop: 10 }}>Ghi chú của bạn: {booking.customerNote}</p> : null}
              </div>
              <div className="detail-card">
                <h2>Chính sách hủy</h2>
                <table className="policy-table">
                  <thead><tr><th>Thời điểm</th><th>Phí</th></tr></thead>
                  <tbody>
                    {booking.cancellationPolicy.tiers.map((tier) => (
                      <tr key={`${tier.minDaysBefore}-${tier.maxDaysBefore}`}>
                        <td>{tier.maxDaysBefore === null ? `Từ ${tier.minDaysBefore} ngày` : tier.minDaysBefore === 0 ? "Ngày khởi hành / no-show" : `${tier.minDaysBefore}–${tier.maxDaysBefore} ngày`}</td>
                        <td>{tier.feePercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <aside>
              <div className="detail-card">
                <h2>Chi tiết giá</h2>
                <div className="price-lines">
                  {booking.priceSnapshot.map((line) => (
                    <div key={line.type}><span>{line.type === "adult" ? "Người lớn" : line.type === "child" ? "Trẻ em" : line.type === "infant" ? "Em bé" : "Phụ thu phòng đơn"} × {line.qty}</span><span>{formatVnd(line.amount)}</span></div>
                  ))}
                  {booking.discountTotal > 0 ? <div><span>Giảm giá {booking.couponCode}</span><span>−{formatVnd(booking.discountTotal)}</span></div> : null}
                  <div className="total"><span>Tổng cộng</span><span>{formatVnd(booking.total)}</span></div>
                  <div><span>Đã thanh toán</span><span>{formatVnd(booking.grossPaid)}</span></div>
                  {booking.refundedAmount > 0 ? <div><span>Đã hoàn</span><span>{formatVnd(booking.refundedAmount)}</span></div> : null}
                  <div><span>Còn lại</span><span><strong>{formatVnd(booking.remaining)}</strong></span></div>
                </div>
                {booking.balanceDueDate && booking.remaining > 0 ? <p className="field-hint" style={{ marginTop: 8 }}>Hạn thanh toán: {formatDate(booking.balanceDueDate)}</p> : null}
              </div>
              {booking.invoice ? (
                <div className="detail-card">
                  <h2>Hóa đơn</h2>
                  <StatusChip status={booking.invoice.status === "issued" ? "completed" : "pending"} kind="change" size="sm" />
                  <p className="field-hint" style={{ marginTop: 8 }}>{booking.invoice.companyName} · MST {booking.invoice.taxCode}{booking.invoice.invoiceNo ? ` · Số ${booking.invoice.invoiceNo}` : ""}</p>
                </div>
              ) : null}
              {booking.review ? (
                <div className="detail-card">
                  <h2>Đánh giá của bạn</h2>
                  <StatusChip status={booking.review.status} kind="review" size="sm" />
                  <p className="field-hint" style={{ marginTop: 8 }}>{booking.review.rating}/5 — {booking.review.comment}</p>
                  {booking.review.reply ? <p className="field-hint">Phản hồi: {booking.review.reply}</p> : null}
                </div>
              ) : null}
            </aside>
          </div>
        ) : null}

        {tab === "passengers" ? (
          <div className="detail-card">
            <h2>Hành khách ({booking.passengers.length})</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>Họ tên</th><th>Loại</th><th>Giới tính</th><th>Ngày sinh</th><th>Giấy tờ</th><th>Yêu cầu</th></tr></thead>
                <tbody>
                  {booking.passengers.map((passenger, index) => (
                    <tr key={passenger.id}>
                      <td>{index + 1}</td>
                      <td><span className="row-title">{passenger.fullName}</span>{passenger.isLead ? <span className="row-sub">Người đại diện</span> : null}</td>
                      <td>{passenger.type === "adult" ? "Người lớn" : passenger.type === "child" ? "Trẻ em" : "Em bé"}</td>
                      <td>{passenger.gender === "male" ? "Nam" : passenger.gender === "female" ? "Nữ" : "Khác"}</td>
                      <td>{formatDate(passenger.dateOfBirth)}</td>
                      <td>{passenger.idNumber || passenger.passportNumber || "—"}</td>
                      <td>{passenger.specialRequest || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="field-hint" style={{ marginTop: 8 }}>Số giấy tờ được che và chỉ hiển thị đầy đủ cho nhân sự có quyền.</p>
          </div>
        ) : null}

        {tab === "payments" ? (
          <>
            <div className="detail-card">
              <h2>Giao dịch</h2>
              {booking.payments.length ? (
                <div className="table-wrap">
                  <table className="data-table"><thead><tr><th>Mã</th><th>Phương thức</th><th>Số tiền</th><th>Trạng thái</th><th>Thời điểm</th></tr></thead><tbody>{paymentRows(booking.payments)}</tbody></table>
                </div>
              ) : <EmptyState icon="credit-card" title="Chưa có giao dịch" description="Các khoản thanh toán sẽ xuất hiện tại đây." />}
            </div>
            <div className="detail-card">
              <h2>Hoàn tiền</h2>
              {booking.refunds.length ? (
                <div className="table-wrap"><table className="data-table"><thead><tr><th>Mã</th><th>Số tiền</th><th>Hình thức</th><th>Trạng thái</th><th>Xử lý lúc</th></tr></thead><tbody>{refundRows(booking.refunds)}</tbody></table></div>
              ) : <p className="muted">Không có khoản hoàn tiền.</p>}
              {booking.refunds.some((refund) => refund.status === "requested") ? <p className="field-hint">Hoàn tiền dự kiến được xử lý trong tối đa {config.refundSlaDays} ngày làm việc.</p> : null}
            </div>
          </>
        ) : null}

        {tab === "history" ? (
          <div className="detail-card">
            <h2>Dòng thời gian</h2>
            <Timeline
              events={[
                ...booking.history.map((row) => ({
                  id: `h-${row.id}`, title: row.toStatus === "pending" ? "Tạo đơn / giữ chỗ" : row.toStatus === "confirmed" ? "Xác nhận đơn" : row.toStatus === "completed" ? "Hoàn thành chuyến" : row.toStatus === "cancelled" ? "Hủy đơn" : "Hết hạn giữ chỗ",
                  description: row.note || undefined, at: row.createdAt,
                  actor: row.actorType === "customer" ? "Khách hàng" : row.actorType === "staff" ? "Nhân viên" : "Hệ thống",
                  tone: row.toStatus === "confirmed" ? "ok" as const : row.toStatus === "cancelled" ? "danger" as const : row.toStatus === "pending" ? "pending" as const : "info" as const,
                })),
                ...booking.changeRequests.map((request) => ({
                  id: `c-${request.id}`, title: request.type === "cancel" ? "Yêu cầu hủy" : "Yêu cầu đổi ngày",
                  description: request.decisionNote || undefined, at: request.createdAt,
                  actor: `Trạng thái: ${request.status}`, tone: request.status === "rejected" ? "danger" as const : request.status === "completed" ? "ok" as const : "pending" as const,
                })),
              ].sort((a, b) => b.at.localeCompare(a.at))}
            />
          </div>
        ) : null}
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Hủy đơn"
        description="Hệ thống hiển thị báo giá hủy theo chính sách trước khi xác nhận."
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setCancelOpen(false)}>Giữ đơn</button>
            <button type="button" className="btn btn-danger" onClick={doCancel} disabled={!cancelQuote || cancelLoading}>
              {cancelLoading ? "Đang xử lý…" : cancelQuote?.requiresApproval ? "Gửi yêu cầu hủy" : `Hủy đơn và hoàn ${formatVnd(cancelQuote?.refund || 0)}`}
            </button>
          </>
        )}
      >
        {dialogError ? <Notice tone="danger">{dialogError}</Notice> : null}
        {!cancelQuote ? <PageLoader label="Đang tính phí hủy" /> : (
          <>
            <div className="review-summary">
              <div><span>Còn lại tới ngày khởi hành</span><strong>{cancelQuote.daysToDeparture} ngày</strong></div>
              <div><span>Phí hủy ({cancelQuote.feePercent}%)</span><strong>{formatVnd(cancelQuote.fee)}</strong></div>
              <div><span>Đã thanh toán</span><strong>{formatVnd(cancelQuote.grossPaid)}</strong></div>
              <div><span>Số tiền hoàn dự kiến</span><strong style={{ color: "var(--green)" }}>{formatVnd(cancelQuote.refund)}</strong></div>
              <div><span>Thời gian hoàn</span><span>Tối đa {cancelQuote.refundSlaDays} ngày làm việc</span></div>
            </div>
            {cancelQuote.requiresApproval ? <Notice tone="warning" title="Cần nhân viên duyệt">Đơn còn ít ngày tới khởi hành, yêu cầu sẽ chuyển cho nhân viên xử lý thay vì tự hủy.</Notice> : null}
            <Field label="Lý do hủy" htmlFor="cancel-reason" required>
              <select id="cancel-reason" className="input" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}>
                {CANCEL_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
              </select>
            </Field>
            <Field label="Ghi chú thêm" htmlFor="cancel-note">
              <textarea id="cancel-note" className="input textarea" rows={2} maxLength={500} value={cancelNote} onChange={(event) => setCancelNote(event.target.value)} />
            </Field>
            <p className="field-hint">Phí hủy không vượt quá số tiền đã thu. Hoàn tiền về đúng phương thức thanh toán ban đầu.</p>
          </>
        )}
      </Modal>

      <Modal
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        title="Đổi ngày khởi hành"
        description="Chỉ đổi sang lịch khác cùng tour. Phí đổi và chênh lệch giá được tính trước khi gửi yêu cầu."
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setChangeOpen(false)}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={submitChange} disabled={!changeQuote || changeLoading || Boolean(dialogError)}>{changeLoading ? "Đang gửi…" : "Gửi yêu cầu đổi ngày"}</button>
          </>
        )}
      >
        {dialogError ? <Notice tone="danger">{dialogError}</Notice> : null}
        <Field label="Chọn lịch mới" htmlFor="new-departure" required>
          <select id="new-departure" className="input" value={newDepartureId || ""} onChange={(event) => loadChangeQuote(Number(event.target.value))}>
            <option value="">Chọn ngày</option>
            {changeDepartures.map((departure) => (
              <option key={departure.id} value={departure.id}>{formatDate(departure.departureDate)} — còn {departure.seatsLeft} chỗ — {formatVnd(departure.priceAdult)}</option>
            ))}
          </select>
        </Field>
        {changeQuote ? (
          <div className="review-summary">
            <div><span>Giá trị đơn mới</span><strong>{formatVnd(changeQuote.newTotal)}</strong></div>
            <div><span>Chênh lệch giá</span><strong>{changeQuote.difference >= 0 ? `+${formatVnd(changeQuote.difference)}` : `−${formatVnd(Math.abs(changeQuote.difference))}`}</strong></div>
            <div><span>Phí đổi ({changeQuote.feePercent}%)</span><strong>{formatVnd(changeQuote.fee)}</strong></div>
            <div><span>Cần thanh toán thêm</span><strong style={{ color: "var(--green)" }}>{formatVnd(changeQuote.amountDue)}</strong></div>
            <p className="field-hint">{changeQuote.note}</p>
          </div>
        ) : null}
        <p className="field-hint">Chỗ được chuyển nguyên tử sau khi nhân viên duyệt. Yêu cầu hiện tại sẽ hiển thị trong Lịch sử.</p>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Sửa thông tin hành khách"
        description="Không thể đổi ngày sinh làm thay đổi loại khách/giá. Liên hệ hỗ trợ nếu cần đổi số khách."
        size="lg"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setEditOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={savePassengers} disabled={editSaving}>{editSaving ? "Đang lưu…" : "Lưu thay đổi"}</button></>}
      >
        {dialogError ? <Notice tone="danger">{dialogError}</Notice> : null}
        {editPassengers.map((passenger, index) => (
          <div key={passenger.id} className="passenger-card">
            <div className="passenger-card-head"><strong>Hành khách {index + 1}</strong><span className={`passenger-type passenger-type--${passenger.type}`}>{passenger.type === "adult" ? "Người lớn" : passenger.type === "child" ? "Trẻ em" : "Em bé"}</span></div>
            <div className="form-grid">
              <Field label="Họ tên" htmlFor={`edit-name-${passenger.id}`} required>
                <input id={`edit-name-${passenger.id}`} className="input" value={passenger.fullName} onChange={(event) => setEditPassengers((current) => current.map((item) => item.id === passenger.id ? { ...item, fullName: event.target.value } : item))} />
              </Field>
              <Field label="Giới tính" htmlFor={`edit-gender-${passenger.id}`}>
                <select id={`edit-gender-${passenger.id}`} className="input" value={passenger.gender} onChange={(event) => setEditPassengers((current) => current.map((item) => item.id === passenger.id ? { ...item, gender: event.target.value as Passenger["gender"] } : item))}>
                  <option value="female">Nữ</option><option value="male">Nam</option><option value="other">Khác</option>
                </select>
              </Field>
              <Field label="Số CCCD" htmlFor={`edit-id-${passenger.id}`}>
                <input id={`edit-id-${passenger.id}`} className="input" value={passenger.idNumber || ""} onChange={(event) => setEditPassengers((current) => current.map((item) => item.id === passenger.id ? { ...item, idNumber: event.target.value } : item))} />
              </Field>
              <Field label="Số hộ chiếu" htmlFor={`edit-passport-${passenger.id}`}>
                <input id={`edit-passport-${passenger.id}`} className="input" value={passenger.passportNumber || ""} onChange={(event) => setEditPassengers((current) => current.map((item) => item.id === passenger.id ? { ...item, passportNumber: event.target.value.toUpperCase() } : item))} />
              </Field>
              <Field label="Yêu cầu đặc biệt" htmlFor={`edit-request-${passenger.id}`} className="field--full">
                <input id={`edit-request-${passenger.id}`} className="input" maxLength={300} value={passenger.specialRequest || ""} onChange={(event) => setEditPassengers((current) => current.map((item) => item.id === passenger.id ? { ...item, specialRequest: event.target.value } : item))} />
              </Field>
            </div>
          </div>
        ))}
      </Modal>

      <Modal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title="Yêu cầu hóa đơn điện tử"
        size="md"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setInvoiceOpen(false)}>Hủy</button><button type="submit" form="invoice-form" className="btn btn-primary" disabled={invoiceSaving}>{invoiceSaving ? "Đang gửi…" : "Gửi yêu cầu"}</button></>}
      >
        {dialogError ? <Notice tone="danger">{dialogError}</Notice> : null}
        <form id="invoice-form" onSubmit={submitInvoice} noValidate>
          <div className="form-grid">
            <Field label="Mã số thuế" htmlFor="invoice-tax" required error={invoiceErrors.taxCode} hint="10 chữ số hoặc 13 ký tự dạng 10-3.">
              <input id="invoice-tax" className="input" value={invoiceForm.taxCode} onChange={(event) => setInvoiceForm({ ...invoiceForm, taxCode: event.target.value })} />
            </Field>
            <Field label="Tên công ty" htmlFor="invoice-company" required error={invoiceErrors.companyName}>
              <input id="invoice-company" className="input" value={invoiceForm.companyName} onChange={(event) => setInvoiceForm({ ...invoiceForm, companyName: event.target.value })} />
            </Field>
            <Field label="Địa chỉ" htmlFor="invoice-address" required error={invoiceErrors.address} className="field--full">
              <input id="invoice-address" className="input" value={invoiceForm.address} onChange={(event) => setInvoiceForm({ ...invoiceForm, address: event.target.value })} />
            </Field>
            <Field label="Email nhận hóa đơn" htmlFor="invoice-email" required error={invoiceErrors.email} className="field--full">
              <input id="invoice-email" type="email" className="input" value={invoiceForm.email} onChange={(event) => setInvoiceForm({ ...invoiceForm, email: event.target.value })} />
            </Field>
          </div>
          <p className="field-hint">Hạn gửi yêu cầu: {config.invoiceDeadlineDays} ngày sau khi chuyến kết thúc. Hóa đơn đã xuất không thể xóa, chỉ điều chỉnh/thay thế theo quy định.</p>
        </form>
      </Modal>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Đánh giá chuyến đi"
        size="md"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setReviewOpen(false)}>Hủy</button><button type="submit" form="review-form" className="btn btn-primary" disabled={reviewSaving}>{reviewSaving ? "Đang gửi…" : "Gửi đánh giá"}</button></>}
      >
        {dialogError ? <Notice tone="danger">{dialogError}</Notice> : null}
        <form id="review-form" onSubmit={submitReview} className="review-form">
          <div className="rating" role="radiogroup" aria-label="Chọn số sao">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star} type="button" role="radio" aria-checked={reviewForm.rating === star} aria-label={`${star} sao`} className={`rating-star ${star <= reviewForm.rating ? "rating-star--on" : ""}`} onClick={() => setReviewForm({ ...reviewForm, rating: star })}>
                <Icon name="star" size={26} />
              </button>
            ))}
            <span className="rating-value">{reviewForm.rating}/5</span>
          </div>
          <Field label="Nhận xét" htmlFor="review-comment" required hint={`${reviewForm.comment.length}/2000 ký tự, tối thiểu 20 ký tự.`}>
            <textarea id="review-comment" className="input textarea" rows={5} maxLength={2000} value={reviewForm.comment} onChange={(event) => setReviewForm({ ...reviewForm, comment: event.target.value })} />
          </Field>
          <p className="field-hint">Đánh giá sẽ được kiểm duyệt để loại bỏ spam/thông tin cá nhân, không xóa đánh giá tiêu cực chính đáng.</p>
        </form>
      </Modal>
    </>
  );
}
