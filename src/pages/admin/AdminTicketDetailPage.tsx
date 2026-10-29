import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { formatDateTime } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { Field, InfoList, Notice, PageLoader, StatusChip } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { AdminHeader, CHANNEL_LABELS } from "./shared";

interface StaffOption { id: number; fullName: string; roleLabels: string[] }

interface TicketDetail {
  id: number;
  code: string;
  subject: string;
  message: string;
  type: "support" | "complaint" | "custom_tour";
  status: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  assignedTo: number | null;
  assignedName: string | null;
  slaDueAt: string;
  slaOverdue: boolean;
  createdAt: string;
  updatedAt: string;
  interestedTour?: string | null;
  people?: number | null;
  expectedDate?: string | null;
  budget?: number | null;
  customer: { fullName: string; email: string; phone?: string | null };
  booking: { code: string; tour: { name: string }; departureDate: string; status: string; channel: string } | null;
  messages: { id: number; message: string; actorType: string; createdAt: string; userId: number | null }[];
}

export default function AdminTicketDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const state = useApi<TicketDetail>(id ? `/admin/tickets/${id}` : null, [id]);
  const data = state.data;
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("waiting_customer");
  const [priority, setPriority] = useState("normal");
  const [assignedTo, setAssignedTo] = useState("");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setStatus(data.status === "open" ? "in_progress" : data.status);
    setPriority(data.priority);
    setAssignedTo(data.assignedTo ? String(data.assignedTo) : "");
  }, [data?.id, data?.status, data?.priority, data?.assignedTo]);

  const loadStaff = async () => {
    if (staff.length) return;
    try { setStaff(await api<StaffOption[]>("/admin/staff")); } catch { /* optional */ }
  };

  const sendReply = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/tickets/${data.id}/reply`, { method: "POST", body: { message: reply, status } });
      setReply("");
      toast.success("Đã gửi phản hồi.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa gửi được phản hồi."); }
    finally { setBusy(false); }
  };

  const update = async (patch: { status?: string; priority?: string; assignedTo?: number | null }) => {
    if (!data) return;
    try {
      await api(`/admin/tickets/${data.id}/update`, { method: "POST", body: patch });
      toast.success("Đã cập nhật ticket.");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa cập nhật được."); }
  };

  if (state.loading && !data) return <PageLoader label="Đang tải ticket" />;
  if (state.error) return <Notice tone="danger">{state.error.message}</Notice>;
  if (!data) return null;

  return (
    <>
      <Seo title={`Ticket ${data.code}`} noindex />
      <AdminHeader
        title={data.subject}
        description={`${data.code} · ${formatDateTime(data.createdAt)} · SLA ${data.slaOverdue ? "đã quá hạn" : formatDateTime(data.slaDueAt)}`}
        actions={<Link to="/admin/tickets" className="btn btn-ghost btn-sm">← Hàng đợi</Link>}
      />
      <div className="inline-actions" style={{ marginBottom: 14 }}>
        <StatusChip status={data.status} kind="ticket" />
        <span className={`chip chip--${data.priority === "high" || data.priority === "urgent" ? "danger" : "muted"} chip--sm`}>{data.priority}</span>
        {data.slaOverdue ? <span className="chip chip--danger chip--sm">Quá SLA</span> : null}
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="admin-detail-layout">
        <div>
          <div className="admin-section">
            <h2>Hội thoại</h2>
            <div className="booking-list">
              {data.messages.map((message) => (
                <div key={message.id} className="detail-card" style={{ background: message.actorType === "staff" ? "var(--green-50)" : "var(--surface)", marginBottom: 8 }}>
                  <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                    <strong>{message.actorType === "staff" ? "Nhân viên VietTrails" : data.customer.fullName}</strong>
                    <span className="row-sub">{formatDateTime(message.createdAt)}</span>
                  </div>
                  <p style={{ fontSize: 13.5, marginTop: 6, whiteSpace: "pre-wrap" }}>{message.message}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Phản hồi" htmlFor="ticket-reply" required>
                <textarea id="ticket-reply" className="input textarea" rows={4} value={reply} onChange={(event) => setReply(event.target.value)} />
              </Field>
              <div className="form-grid-2">
                <Field label="Trạng thái sau khi gửi" htmlFor="ticket-status">
                  <select id="ticket-status" className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="in_progress">Đang xử lý</option><option value="waiting_customer">Chờ khách</option><option value="resolved">Đã giải quyết</option><option value="closed">Đóng</option>
                  </select>
                </Field>
              </div>
              <button type="button" className="btn btn-primary" onClick={sendReply} disabled={busy || reply.trim().length < 2}>{busy ? "Đang gửi…" : "Gửi phản hồi"}</button>
            </div>
          </div>
        </div>
        <aside className="admin-detail-aside">
          <div className="admin-card">
            <h2>Khách hàng</h2>
            <InfoList items={[
              { label: "Họ tên", value: data.customer.fullName },
              { label: "Email", value: data.customer.email },
              { label: "Điện thoại", value: data.customer.phone || "—" },
              { label: "Loại", value: data.type === "support" ? "Hỗ trợ" : data.type === "complaint" ? "Khiếu nại" : "Tour riêng" },
            ]} />
            {data.type === "custom_tour" ? (
              <div style={{ marginTop: 10 }} className="field-hint">
                <div>Số người: {data.people || "—"}</div>
                <div>Ngày dự kiến: {data.expectedDate || "—"}</div>
                <div>Ngân sách: {data.budget ? `${data.budget.toLocaleString("vi-VN")} đ` : "—"}</div>
                <div>Tour quan tâm: {data.interestedTour || "—"}</div>
              </div>
            ) : null}
            {data.booking ? (
              <div style={{ marginTop: 10 }}>
                <Link to={`/admin/bookings/${data.booking.code}`} className="text-link">{data.booking.code}</Link>
                <div className="field-hint">{data.booking.tour.name} · {CHANNEL_LABELS[data.booking.channel] || data.booking.channel}</div>
              </div>
            ) : null}
          </div>
          <div className="admin-card">
            <h2>Xử lý</h2>
            <Field label="Phụ trách" htmlFor="ticket-assign">
              <select id="ticket-assign" className="input" value={assignedTo} onFocus={loadStaff} onChange={(event) => { setAssignedTo(event.target.value); void update({ assignedTo: event.target.value ? Number(event.target.value) : null }); }}>
                <option value="">Chưa gán</option>
                {staff.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
              </select>
            </Field>
            <Field label="Ưu tiên" htmlFor="ticket-priority">
              <select id="ticket-priority" className="input" value={priority} onChange={(event) => { setPriority(event.target.value); void update({ priority: event.target.value }); }}>
                <option value="low">Thấp</option><option value="normal">Bình thường</option><option value="high">Cao</option><option value="urgent">Khẩn</option>
              </select>
            </Field>
            <Field label="Trạng thái" htmlFor="ticket-update-status">
              <select id="ticket-update-status" className="input" value={status} onChange={(event) => { setStatus(event.target.value); void update({ status: event.target.value }); }}>
                <option value="open">Mới</option><option value="in_progress">Đang xử lý</option><option value="waiting_customer">Chờ khách</option><option value="resolved">Đã giải quyết</option><option value="closed">Đóng</option>
              </select>
            </Field>
          </div>
        </aside>
      </div>
    </>
  );
}
