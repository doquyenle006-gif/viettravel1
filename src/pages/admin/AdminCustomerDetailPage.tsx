import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AdminBookingRow, TicketRow } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { formatDate, formatDateTime, formatVnd } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { DataTable, EmptyState, ErrorState, Field, InfoList, Notice, PageLoader, StatusChip } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader } from "./shared";

interface Credit { id: number; amount: number; remaining: number; expiresAt: string; createdAt: string; note: string }
interface CustomerDetail {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  status: "active" | "locked";
  emailVerified: boolean;
  createdAt: string;
  marketingConsent: boolean;
  bookings: AdminBookingRow[];
  tickets: TicketRow[];
  credits: Credit[];
  totalSpend: number;
  note: string | null;
}

export default function AdminCustomerDetailPage() {
  const { id } = useParams();
  const { user } = useSession();
  const toast = useToast();
  const state = useApi<CustomerDetail>(id ? `/admin/customers/${id}` : null, [id]);
  const data = state.data;
  const [lockOpen, setLockOpen] = useState(false);
  const [lockForm, setLockForm] = useState({ status: "locked", reason: "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canUpdate = user?.permissions.includes("customer:update") ?? false;

  useEffect(() => {
    if (data) setNote(data.note || "");
  }, [data?.id, data?.note]);

  if (state.loading && !data) return <PageLoader label="Đang tải khách hàng" />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!data) return null;

  const setStatus = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/customers/${data.id}/status`, { method: "POST", body: lockForm });
      setLockOpen(false);
      toast.success(lockForm.status === "locked" ? "Đã khóa tài khoản." : "Đã mở khóa tài khoản.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa đổi được trạng thái."); }
    finally { setBusy(false); }
  };

  const saveNote = async () => {
    try {
      await api(`/admin/customers/${data.id}/note`, { method: "POST", body: { note } });
      toast.success("Đã lưu ghi chú.");
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa lưu được ghi chú."); }
  };

  return (
    <>
      <Seo title={`Khách hàng ${data.fullName}`} noindex />
      <AdminHeader
        title={data.fullName}
        description={`${data.email} · ${data.phone || "Chưa có SĐT"} · Tham gia ${formatDate(data.createdAt)}`}
        actions={canUpdate && user?.roles.includes("super_admin") ? <button type="button" className="btn btn-outline btn-sm" onClick={() => { setLockForm({ status: data.status === "locked" ? "active" : "locked", reason: "" }); setLockOpen(true); setError(null); }}>{data.status === "locked" ? "Mở khóa tài khoản" : "Khóa tài khoản"}</button> : null}
      />
      <div className="inline-actions" style={{ marginBottom: 14 }}>
        <StatusChip status={data.status} kind="user" />
        {data.emailVerified ? <span className="chip chip--ok chip--sm">Email đã xác minh</span> : <span className="chip chip--pending chip--sm">Chưa xác minh</span>}
        <span className="chip chip--info chip--sm">Tổng chi tiêu {formatVnd(data.totalSpend)}</span>
      </div>

      <div className="admin-detail-layout">
        <div>
          <div className="admin-section">
            <h2>Đơn hàng ({data.bookings.length})</h2>
            <DataTable
              rows={data.bookings}
              rowKey={(row) => row.code}
              columns={[
                { key: "code", header: "Mã", cell: (row) => <Link to={`/admin/bookings/${row.code}`} className="text-link">{row.code}</Link> },
                { key: "tour", header: "Tour / ngày", cell: (row) => <>{row.tour.name}<span className="row-sub">{formatDate(row.departureDate)}</span></> },
                { key: "total", header: "Tổng", align: "right", cell: (row) => formatVnd(row.total) },
                { key: "paid", header: "Đã thu", align: "right", cell: (row) => formatVnd(row.paid) },
                { key: "status", header: "Trạng thái", cell: (row) => <StatusChip status={row.status} kind="booking" audience="admin" size="sm" /> },
              ]}
              empty={<EmptyState icon="ticket" title="Chưa có đơn" />}
            />
          </div>
          <div className="admin-section">
            <h2>Ticket & khiếu nại</h2>
            {data.tickets.length ? (
              <div className="booking-list">
                {data.tickets.map((ticket) => (
                  <Link key={ticket.id} to={`/admin/tickets/${ticket.id}`} className="detail-card" style={{ marginBottom: 8 }}>
                    <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                      <strong>{ticket.subject}</strong><StatusChip status={ticket.status} kind="ticket" size="sm" />
                    </div>
                    <span className="row-sub">{ticket.code} · {formatDateTime(ticket.createdAt)}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="muted">Chưa có ticket.</p>}
          </div>
        </div>
        <aside className="admin-detail-aside">
          <div className="admin-card">
            <h2>Thông tin</h2>
            <InfoList items={[
              { label: "Email", value: data.email },
              { label: "Điện thoại", value: data.phone || "—" },
              { label: "Đồng ý marketing", value: data.marketingConsent ? "Có" : "Không" },
              { label: "Bảo lưu", value: formatVnd(data.credits.reduce((sum, credit) => sum + credit.remaining, 0)) },
              { label: "Đơn", value: data.bookings.length },
            ]} />
            {data.credits.length ? (
              <div style={{ marginTop: 12 }}>
                {data.credits.map((credit) => (
                  <div key={credit.id} className="admin-alert" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}>
                    <span>{formatVnd(credit.remaining)} · hết hạn {formatDate(credit.expiresAt)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="admin-card">
            <h2>Ghi chú nội bộ</h2>
            <Field label="Ghi chú" htmlFor="customer-note"><textarea id="customer-note" className="input textarea" rows={4} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
            <button type="button" className="btn btn-outline btn-sm" onClick={saveNote}>Lưu ghi chú</button>
          </div>
        </aside>
      </div>

      <Modal
        open={lockOpen}
        onClose={() => setLockOpen(false)}
        title={lockForm.status === "locked" ? "Khóa tài khoản" : "Mở khóa tài khoản"}
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setLockOpen(false)}>Hủy</button><button type="button" className={`btn ${lockForm.status === "locked" ? "btn-danger" : "btn-primary"}`} onClick={setStatus} disabled={busy || lockForm.reason.trim().length < 5}>{busy ? "Đang xử lý…" : "Xác nhận"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Lý do" htmlFor="lock-reason" required hint="Lưu nhật ký và gửi email cho khách."><textarea id="lock-reason" className="input textarea" rows={3} value={lockForm.reason} onChange={(event) => setLockForm({ ...lockForm, reason: event.target.value })} /></Field>
      </Modal>
    </>
  );
}
