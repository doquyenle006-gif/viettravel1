import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AdminBookingRow, BookingStatus, ChangeRequest, Invoice, Payment, Refund } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { STAFF_CANCEL_REASONS } from "../../lib/errors";
import { formatDate, formatDateTime, formatPax, formatVnd, openHtmlDocument } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { Icon } from "../../components/Icon";
import { CopyButton, DataTable, EmptyState, ErrorState, Field, InfoList, Notice, PageLoader, StatusChip, Tabs, Timeline } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader, CHANNEL_LABELS } from "./shared";

interface DetailPassenger {
  id: number;
  fullName: string;
  gender: "male" | "female" | "other";
  dateOfBirth: string;
  type: "adult" | "child" | "infant";
  idNumber: string | null;
  passportNumber: string | null;
  nationality: string | null;
  specialRequest: string | null;
  isLead: boolean;
}

interface AdminBookingDetail extends AdminBookingRow {
  contact: { fullName: string; email: string; phone: string };
  departure: {
    id: number; departureDate: string; returnDate: string; meetingPoint: string; meetingTime: string;
    status: string; seatsLeft: number; isGuaranteed: boolean;
  };
  tour: { id: number; name: string; slug: string; cover: string | null };
  passengers: DetailPassenger[];
  priceSnapshot: { type: string; qty: number; unitPrice: number; amount: number }[];
  subtotal: number;
  discountTotal: number;
  couponCode: string | null;
  depositRequired: number;
  refundedAmount: number;
  payments: Payment[];
  refunds: Refund[];
  history: { id: number; fromStatus: BookingStatus | null; toStatus: BookingStatus; actorId: number | null; actorType: string; note: string | null; createdAt: string }[];
  changeRequests: ChangeRequest[];
  invoice: Invoice | null;
  review: { id: number; rating: number; comment: string; status: string } | null;
  customerNote: string | null;
  internalNote: string | null;
  adminActions: { confirm: boolean; cancel: boolean; extendHold: boolean; recordPayment: boolean; approveChange: boolean };
}

interface StaffOption { id: number; fullName: string; roleLabels: string[] }
interface CancelQuote {
  daysToDeparture: number; feePercent: number; fee: number; refund: number; grossPaid: number;
  requiresApproval: boolean; policyName: string;
}

export default function AdminBookingDetailPage() {
  const { code } = useParams();
  const { user } = useSession();
  const toast = useToast();
  const state = useApi<AdminBookingDetail>(code ? `/admin/bookings/${encodeURIComponent(code)}` : null, [code]);
  const booking = state.data;
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelQuote, setCancelQuote] = useState<CancelQuote | null>(null);
  const [cancelForm, setCancelForm] = useState({ reasonCode: "customer_request", note: "" });
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdForm, setHoldForm] = useState({ hours: 24, reason: "" });
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: 0, method: "cash", note: "" });
  const [note, setNote] = useState("");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [assignedTo, setAssignedTo] = useState("");
  const [documents, setDocuments] = useState<Record<number, { idNumber: string | null; passportNumber: string | null }>>({});
  const [rejectTarget, setRejectTarget] = useState<ChangeRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const canUpdate = user?.permissions.includes("booking:update") ?? false;
  const canCancel = user?.permissions.includes("booking:cancel") ?? false;
  const canPay = user?.permissions.includes("payment:confirm") ?? false;
  const canPii = user?.permissions.includes("export:pii") ?? false;

  useEffect(() => {
    if (!booking) return;
    setNote(booking.internalNote || "");
    setAssignedTo(booking.assignedTo ? String(booking.assignedTo) : "");
  }, [booking?.code, booking?.internalNote, booking?.assignedTo]);

  if (state.loading && !booking) return <PageLoader label="Đang tải đơn" />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!booking) return null;

  const remaining = Math.max(0, booking.total - booking.paid);

  const loadStaff = async () => {
    if (staff.length) return;
    try { setStaff(await api<StaffOption[]>("/admin/staff")); } catch { /* selection is optional */ }
  };

  const confirmBooking = async () => {
    setBusy(true);
    try {
      await api(`/admin/bookings/${booking.code}/confirm`, { method: "POST", body: { note: "Xác nhận thủ công bởi nhân viên" } });
      toast.success("Đã xác nhận đơn.");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa xác nhận được đơn."); }
    finally { setBusy(false); }
  };

  const openCancel = async () => {
    setCancelOpen(true);
    setCancelQuote(null);
    setError(null);
    try {
      setCancelQuote(await api<CancelQuote>(`/admin/bookings/${booking.code}/cancel-quote`));
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa tính được phí hủy."); }
  };

  const cancelBooking = async () => {
    if (!booking) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/bookings/${booking.code}/cancel`, { method: "POST", body: { reasonCode: cancelForm.reasonCode, note: cancelForm.note } });
      setCancelOpen(false);
      toast.success("Đã hủy đơn.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa hủy được đơn."); }
    finally { setBusy(false); }
  };

  const extendHold = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/bookings/${booking.code}/extend-hold`, { method: "POST", body: holdForm });
      setHoldOpen(false);
      toast.success("Đã gia hạn giữ chỗ.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa gia hạn được."); }
    finally { setBusy(false); }
  };

  const recordPayment = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/bookings/${booking.code}/payments`, { method: "POST", body: paymentForm });
      setPaymentOpen(false);
      toast.success("Đã ghi nhận thanh toán.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa ghi nhận được thanh toán."); }
    finally { setBusy(false); }
  };

  const saveNote = async () => {
    setBusy(true);
    try {
      await api(`/admin/bookings/${booking.code}/note`, { method: "POST", body: { internalNote: note } });
      toast.success("Đã lưu ghi chú nội bộ.");
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa lưu được ghi chú."); }
    finally { setBusy(false); }
  };

  const assign = async (value: string) => {
    setAssignedTo(value);
    try {
      await api(`/admin/bookings/${booking.code}/assign`, { method: "POST", body: { assignedTo: value ? Number(value) : null } });
      toast.success("Đã cập nhật người phụ trách.");
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa gán được người phụ trách."); }
  };

  const revealDocument = async (passengerId: number) => {
    try {
      const data = await api<{ idNumber: string | null; passportNumber: string | null }>(`/admin/bookings/${booking.code}/passengers/${passengerId}/document`);
      setDocuments((current) => ({ ...current, [passengerId]: data }));
      toast.info("Đã hiển thị giấy tờ đầy đủ. Hành động này đã được ghi nhật ký.");
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa xem được giấy tờ."); }
  };

  const voucher = async () => {
    try {
      const data = await api<{ html: string; filename: string }>(`/me/bookings/${booking.code}/voucher`);
      openHtmlDocument(data.html, data.filename);
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa xuất được voucher."); }
  };

  const approveChange = async (request: ChangeRequest) => {
    try {
      await api(`/admin/change-requests/${request.id}/approve`, { method: "POST", body: { note: "Duyệt bởi nhân viên" } });
      toast.success("Đã duyệt yêu cầu.");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa duyệt được yêu cầu."); }
  };

  const rejectChange = async () => {
    if (!rejectTarget) return;
    setBusy(true);
    try {
      await api(`/admin/change-requests/${rejectTarget.id}/reject`, { method: "POST", body: { note: rejectReason } });
      setRejectTarget(null);
      setRejectReason("");
      toast.success("Đã từ chối yêu cầu.");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa từ chối được."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Seo title={`Đơn ${booking.code}`} noindex />
      <AdminHeader
        title={`Đơn ${booking.code}`}
        description={`${booking.tour.name} · ${formatDate(booking.departure.departureDate)} · ${formatPax(booking.adults, booking.children, booking.infants)} · ${CHANNEL_LABELS[booking.channel] || booking.channel}`}
        actions={
          <>
            <CopyButton value={booking.code} label="Sao chép mã" />
            {booking.adminActions.confirm && canUpdate ? <button type="button" className="btn btn-primary btn-sm" onClick={confirmBooking} disabled={busy}>Xác nhận đơn</button> : null}
            {booking.adminActions.recordPayment && canPay ? <button type="button" className="btn btn-accent btn-sm" onClick={() => { setPaymentOpen(true); setPaymentForm({ amount: remaining, method: "cash", note: "" }); }}>Ghi nhận thanh toán</button> : null}
            {booking.adminActions.extendHold && canUpdate ? <button type="button" className="btn btn-outline btn-sm" onClick={() => setHoldOpen(true)}>Gia hạn giữ chỗ</button> : null}
            {["confirmed", "completed"].includes(booking.status) && !user?.roles.includes("guide") ? <button type="button" className="btn btn-outline btn-sm" onClick={voucher}><Icon name="download" size={14} /> Voucher</button> : null}
            {booking.adminActions.cancel && canCancel ? <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={openCancel}>Hủy đơn</button> : null}
          </>
        }
      />

      <div className="inline-actions" style={{ marginBottom: 14 }}>
        <StatusChip status={booking.status} kind="booking" audience="admin" />
        <StatusChip status={booking.paymentStatus} kind="payment" />
        {booking.holdExpiresAt ? <span className="chip chip--pending chip--sm">Giữ đến {formatDateTime(booking.holdExpiresAt)}</span> : null}
        {booking.balanceDueDate && remaining > 0 ? <span className="chip chip--info chip--sm">Hạn trả đủ {formatDate(booking.balanceDueDate)}</span> : null}
        <span className="muted" style={{ fontSize: 12 }}>Tạo lúc {formatDateTime(booking.createdAt)} · v{booking.version}</span>
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="admin-detail-layout">
        <div>
          <Tabs
            items={[
              { id: "overview", label: "Tổng quan" },
              { id: "passengers", label: "Hành khách", badge: booking.passengers.length },
              { id: "payments", label: "Thanh toán & hoàn tiền" },
              { id: "history", label: "Lịch sử" },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div style={{ marginTop: 14 }}>
            {tab === "overview" ? (
              <>
                <div className="admin-section">
                  <h2>Thông tin đơn</h2>
                  <div className="form-grid-3">
                    <InfoList items={[
                      { label: "Khách liên hệ", value: booking.contact.fullName },
                      { label: "Email", value: booking.contact.email },
                      { label: "Điện thoại", value: booking.contact.phone },
                      { label: "Kênh", value: CHANNEL_LABELS[booking.channel] || booking.channel },
                      { label: "Người phụ trách", value: booking.assignedName || "Chưa gán" },
                    ]} />
                    <InfoList items={[
                      { label: "Khởi hành", value: formatDate(booking.departure.departureDate) },
                      { label: "Kết thúc", value: formatDate(booking.departure.returnDate) },
                      { label: "Điểm đón", value: booking.departure.meetingPoint },
                      { label: "Giờ đón", value: booking.departure.meetingTime },
                      { label: "Tour", value: <Link to={`/admin/tours/${booking.tour.id}`} className="text-link">{booking.tour.name}</Link> },
                    ]} />
                    <InfoList items={[
                      { label: "Tổng tiền", value: formatVnd(booking.total) },
                      { label: "Đã thu", value: formatVnd(booking.paid) },
                      { label: "Còn lại", value: formatVnd(remaining) },
                      { label: "Cọc yêu cầu", value: formatVnd(booking.depositRequired) },
                      { label: "Đã hoàn", value: formatVnd(booking.refundedAmount) },
                    ]} />
                  </div>
                  {booking.customerNote ? <Notice tone="neutral" title="Khách ghi chú">{booking.customerNote}</Notice> : null}
                </div>

                <div className="admin-section">
                  <h2>Chi tiết giá snapshot</h2>
                  <div className="price-lines">
                    {booking.priceSnapshot.map((line) => (
                      <div key={line.type}><span>{line.type === "adult" ? "Người lớn" : line.type === "child" ? "Trẻ em" : line.type === "infant" ? "Em bé" : "Phụ thu phòng đơn"} × {line.qty}</span><span>{formatVnd(line.amount)}</span></div>
                    ))}
                    {booking.discountTotal > 0 ? <div><span>Giảm giá {booking.couponCode}</span><span>−{formatVnd(booking.discountTotal)}</span></div> : null}
                    <div className="total"><span>Tổng</span><span>{formatVnd(booking.total)}</span></div>
                  </div>
                </div>

                {booking.changeRequests.length ? (
                  <div className="admin-section">
                    <h2>Yêu cầu thay đổi</h2>
                    {booking.changeRequests.map((request) => (
                      <div key={request.id} className="admin-alert" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
                        <Icon name="refresh" size={15} />
                        <div style={{ flex: 1 }}>
                          <strong>{request.type === "cancel" ? "Yêu cầu hủy" : "Yêu cầu đổi ngày"}</strong>
                          <p style={{ fontSize: 12.5 }}>{request.type === "change_date" ? `${request.payload.from} → ${request.payload.to}` : request.payload.note || "Không có ghi chú"}</p>
                          <StatusChip status={request.status} kind="change" size="sm" />
                        </div>
                        {request.status === "submitted" && booking.adminActions.approveChange ? (
                          <span className="table-actions">
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => approveChange(request)}>Duyệt</button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRejectTarget(request); setRejectReason(""); }}>Từ chối</button>
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {booking.invoice ? (
                  <div className="admin-section">
                    <h2>Hóa đơn</h2>
                    <InfoList items={[
                      { label: "Công ty", value: booking.invoice.companyName },
                      { label: "MST", value: booking.invoice.taxCode },
                      { label: "Email", value: booking.invoice.email },
                      { label: "Trạng thái", value: <StatusChip status={booking.invoice.status === "issued" ? "completed" : "pending"} kind="change" size="sm" /> },
                      { label: "Số hóa đơn", value: booking.invoice.invoiceNo || "—" },
                    ]} />
                  </div>
                ) : null}
              </>
            ) : null}

            {tab === "passengers" ? (
              <div className="admin-section">
                <div className="panel-head"><h2>Hành khách</h2>{!canPii ? <span className="field-hint">Giấy tờ được che. Cần quyền export:pii để xem đầy đủ.</span> : null}</div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>#</th><th>Họ tên</th><th>Loại</th><th>Ngày sinh</th><th>CCCD</th><th>Hộ chiếu</th><th>Yêu cầu</th><th></th></tr></thead>
                    <tbody>
                      {booking.passengers.map((passenger, index) => {
                        const revealed = documents[passenger.id];
                        return (
                          <tr key={passenger.id}>
                            <td>{index + 1}</td>
                            <td><span className="row-title">{passenger.fullName}</span>{passenger.isLead ? <span className="row-sub">Đại diện</span> : null}</td>
                            <td>{passenger.type === "adult" ? "Người lớn" : passenger.type === "child" ? "Trẻ em" : "Em bé"}</td>
                            <td>{formatDate(passenger.dateOfBirth)}</td>
                            <td>{revealed ? revealed.idNumber || "—" : passenger.idNumber || "—"}</td>
                            <td>{revealed ? revealed.passportNumber || "—" : passenger.passportNumber || "—"}</td>
                            <td>{passenger.specialRequest || "—"}</td>
                            <td>{canPii && !revealed ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => revealDocument(passenger.id)}>Hiện</button> : null}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {tab === "payments" ? (
              <>
                <div className="admin-section">
                  <div className="panel-head"><h2>Giao dịch</h2>{booking.adminActions.recordPayment && canPay ? <button type="button" className="btn btn-outline btn-sm" onClick={() => { setPaymentOpen(true); setPaymentForm({ amount: remaining, method: "cash", note: "" }); }}>Ghi nhận thanh toán</button> : null}</div>
                  <DataTable
                    rows={booking.payments}
                    rowKey={(row) => row.id}
                    columns={[
                      { key: "ref", header: "Mã", cell: (row) => <span className="row-title" style={{ fontFamily: "monospace", fontSize: 12 }}>{row.merchantRef}</span> },
                      { key: "purpose", header: "Mục đích", cell: (row) => row.purpose === "deposit" ? "Đặt cọc" : row.purpose === "full" ? "Toàn bộ" : "Phần còn lại" },
                      { key: "method", header: "Phương thức", cell: (row) => row.method },
                      { key: "amount", header: "Số tiền", align: "right", cell: (row) => formatVnd(row.amount) },
                      { key: "status", header: "Trạng thái", cell: (row) => <><StatusChip status={row.status} kind="txn" size="sm" />{row.flag ? <span className="chip chip--danger chip--sm" style={{ marginLeft: 4 }}>Cần xử lý</span> : null}</> },
                      { key: "time", header: "Thời điểm", cell: (row) => formatDateTime(row.paidAt || row.createdAt) },
                    ]}
                    empty={<EmptyState icon="credit-card" title="Chưa có giao dịch" />}
                  />
                </div>
                <div className="admin-section">
                  <h2>Hoàn tiền</h2>
                  {booking.refunds.length ? (
                    <DataTable
                      rows={booking.refunds}
                      rowKey={(row) => row.id}
                      columns={[
                        { key: "id", header: "#", cell: (row) => row.id },
                        { key: "amount", header: "Số tiền", align: "right", cell: (row) => formatVnd(row.amount) },
                        { key: "type", header: "Hình thức", cell: (row) => row.type === "credit" ? "Bảo lưu" : "Hoàn tiền" },
                        { key: "status", header: "Trạng thái", cell: (row) => <StatusChip status={row.status} kind="refund" size="sm" /> },
                        { key: "processed", header: "Xử lý", cell: (row) => row.processedAt ? formatDateTime(row.processedAt) : "—" },
                      ]}
                    />
                  ) : <p className="muted">Không có khoản hoàn tiền.</p>}
                  <Link to="/admin/refunds" className="text-link" style={{ fontSize: 12, display: "inline-block", marginTop: 10 }}>Quản lý hàng đợi hoàn tiền →</Link>
                </div>
              </>
            ) : null}

            {tab === "history" ? (
              <div className="admin-section">
                <h2>Dòng thời gian trạng thái</h2>
                <Timeline events={booking.history.map((row) => ({
                  id: row.id, title: row.toStatus,
                  description: row.note || undefined, at: row.createdAt,
                  actor: row.actorType === "customer" ? "Khách" : row.actorType === "staff" ? "Nhân viên" : "Hệ thống",
                  tone: row.toStatus === "confirmed" ? "ok" : row.toStatus === "cancelled" ? "danger" : "info",
                }))} />
              </div>
            ) : null}
          </div>
        </div>

        <aside className="admin-detail-aside">
          <div className="admin-card">
            <h2>Thao tác nội bộ</h2>
            <Field label="Người phụ trách" htmlFor="assign-staff">
              <select id="assign-staff" className="input" value={assignedTo} onFocus={loadStaff} onChange={(event) => assign(event.target.value)} disabled={!canUpdate}>
                <option value="">Chưa gán</option>
                {staff.map((member) => <option key={member.id} value={member.id}>{member.fullName} · {member.roleLabels.join(", ")}</option>)}
              </select>
            </Field>
            <Field label="Ghi chú nội bộ" htmlFor="internal-note">
              <textarea id="internal-note" className="input textarea" rows={4} value={note} onChange={(event) => setNote(event.target.value)} disabled={!canUpdate} />
            </Field>
            {canUpdate ? <button type="button" className="btn btn-outline btn-sm" onClick={saveNote} disabled={busy}>Lưu ghi chú</button> : null}
          </div>
          <div className="admin-card">
            <h2>Tóm tắt tiền</h2>
            <div className="admin-kv">
              <div><span>Tổng</span><strong>{formatVnd(booking.total)}</strong></div>
              <div><span>Đã thu</span><strong>{formatVnd(booking.paid)}</strong></div>
              <div><span>Còn lại</span><strong style={{ color: remaining > 0 ? "var(--danger)" : "var(--ok)" }}>{formatVnd(remaining)}</strong></div>
              <div><span>Đã hoàn</span><strong>{formatVnd(booking.refundedAmount)}</strong></div>
              <div><span>Cọc yêu cầu</span><strong>{formatVnd(booking.depositRequired)}</strong></div>
            </div>
          </div>
        </aside>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Hủy đơn"
        description="Thao tác này trả chỗ và có thể tạo yêu cầu hoàn tiền."
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setCancelOpen(false)}>Giữ đơn</button><button type="button" className="btn btn-danger" onClick={cancelBooking} disabled={busy || !cancelForm.note.trim()}>{busy ? "Đang hủy…" : "Xác nhận hủy"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {cancelQuote ? (
          <div className="review-summary" style={{ marginBottom: 12 }}>
            <div><span>Còn lại tới khởi hành</span><strong>{cancelQuote.daysToDeparture} ngày</strong></div>
            <div><span>Phí hủy ({cancelQuote.feePercent}%)</span><strong>{formatVnd(cancelQuote.fee)}</strong></div>
            <div><span>Đã thu</span><strong>{formatVnd(cancelQuote.grossPaid)}</strong></div>
            <div><span>Hoàn dự kiến</span><strong>{formatVnd(cancelQuote.refund)}</strong></div>
          </div>
        ) : <PageLoader label="Đang tính phí" />}
        <Field label="Mã lý do" htmlFor="admin-cancel-reason">
          <select id="admin-cancel-reason" className="input" value={cancelForm.reasonCode} onChange={(event) => setCancelForm({ ...cancelForm, reasonCode: event.target.value })}>
            {STAFF_CANCEL_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
          </select>
        </Field>
        <Field label="Ghi chú" htmlFor="admin-cancel-note" required hint="Bắt buộc — lưu nhật ký.">
          <textarea id="admin-cancel-note" className="input textarea" rows={3} value={cancelForm.note} onChange={(event) => setCancelForm({ ...cancelForm, note: event.target.value })} />
        </Field>
      </Modal>

      <Modal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        title="Gia hạn giữ chỗ"
        description="Chỉ gia hạn một lần cho mỗi đơn và cần lý do."
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setHoldOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={extendHold} disabled={busy}>{busy ? "Đang lưu…" : "Gia hạn"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Số giờ gia hạn" htmlFor="hold-hours" required><input id="hold-hours" type="number" min={1} max={24} className="input" value={holdForm.hours} onChange={(event) => setHoldForm({ ...holdForm, hours: Number(event.target.value) })} /></Field>
        <Field label="Lý do" htmlFor="hold-reason" required><textarea id="hold-reason" className="input textarea" rows={3} value={holdForm.reason} onChange={(event) => setHoldForm({ ...holdForm, reason: event.target.value })} /></Field>
      </Modal>

      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Ghi nhận thanh toán"
        description="Dùng cho tiền mặt/POS hoặc chuyển khoản đã đối chiếu. Giao dịch đã ghi nhận không sửa/xóa."
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setPaymentOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={recordPayment} disabled={busy}>{busy ? "Đang ghi…" : "Ghi nhận"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Số tiền thực nhận" htmlFor="payment-amount" required hint={`Còn lại ${formatVnd(remaining)}`}>
          <input id="payment-amount" type="number" step="1000" min={1} max={remaining} className="input" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: Number(event.target.value) })} />
        </Field>
        <Field label="Phương thức" htmlFor="payment-method">
          <select id="payment-method" className="input" value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>
            <option value="cash">Tiền mặt</option><option value="pos_card">POS / Thẻ tại quầy</option><option value="bank_transfer">Chuyển khoản đã đối chiếu</option>
          </select>
        </Field>
        <Field label="Ghi chú" htmlFor="payment-note"><input id="payment-note" className="input" value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} /></Field>
      </Modal>

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Từ chối yêu cầu"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setRejectTarget(null)}>Hủy</button><button type="button" className="btn btn-danger" onClick={rejectChange} disabled={busy || rejectReason.trim().length < 5}>{busy ? "Đang xử lý…" : "Từ chối"}</button></>}
      >
        <Field label="Lý do" htmlFor="reject-change-reason" required><textarea id="reject-change-reason" className="input textarea" rows={3} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} /></Field>
      </Modal>
    </>
  );
}
