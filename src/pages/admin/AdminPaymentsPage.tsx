import { useState } from "react";
import { Link } from "react-router-dom";
import type { Meta, Payment } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { formatDate, formatDateTime, formatVnd, todayIso } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { Icon } from "../../components/Icon";
import { DataTable, EmptyState, ErrorState, Field, InfoList, Notice, Skeleton, StatusChip } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader, AdminPagination, AdminTabs, useAdminParams } from "./shared";

interface PaymentRow extends Payment {
  bookingCode: string | null;
  customerName: string | null;
  customerEmail: string | null;
  tourName: string | null;
  departureDate: string | null;
}

export default function AdminPaymentsPage() {
  const { get, update, setPage } = useAdminParams();
  const { user } = useSession();
  const toast = useToast();
  const tab = get("tab", "all");
  const [q, setQ] = useState(get("q"));
  const canConfirm = user?.permissions.includes("payment:confirm") ?? false;
  const [confirmTarget, setConfirmTarget] = useState<PaymentRow | null>(null);
  const [confirmForm, setConfirmForm] = useState({ receivedAmount: 0, paidAt: todayIso(), note: "" });
  const [rejectTarget, setRejectTarget] = useState<PaymentRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const page = Number(get("page", "1"));
  const query = new URLSearchParams();
  query.set("tab", tab);
  if (get("q")) query.set("q", get("q"));
  query.set("page", String(page));
  query.set("perPage", "20");
  const state = useApi<PaymentRow[]>(`/admin/payments?${query.toString()}`, [tab, get("q"), page]);
  const meta = state.meta as Meta | undefined;

  const openConfirm = (row: PaymentRow) => {
    setConfirmTarget(row);
    setConfirmForm({ receivedAmount: row.amount, paidAt: todayIso(), note: "" });
    setError(null);
  };

  const confirm = async () => {
    if (!confirmTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/payments/${confirmTarget.id}/confirm`, { method: "POST", body: confirmForm });
      toast.success("Đã xác nhận thanh toán.");
      setConfirmTarget(null);
      state.reload();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Chưa xác nhận được.");
    } finally { setBusy(false); }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/payments/${rejectTarget.id}/reject`, { method: "POST", body: { reason: rejectReason } });
      toast.success("Đã từ chối giao dịch.");
      setRejectTarget(null);
      setRejectReason("");
      state.reload();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Chưa từ chối được.");
    } finally { setBusy(false); }
  };

  const reconcile = async (row: PaymentRow) => {
    try {
      await api(`/admin/payments/${row.id}/reconcile`, { method: "POST", body: { note: "Đã đối chiếu sao kê" } });
      toast.success("Đã đánh dấu đối soát.");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa đối soát được."); }
  };

  return (
    <>
      <Seo title="Thanh toán" noindex />
      <AdminHeader title="Thanh toán" description="Xác nhận chuyển khoản, xử lý giao dịch lệch tiền và đối soát." />
      <AdminTabs
        items={[
          { id: "all", label: "Tất cả" },
          { id: "confirm", label: "Chờ xác nhận" },
          { id: "review", label: "Cần xử lý" },
          { id: "reconcile", label: "Đối soát" },
        ]}
        value={tab}
        onChange={(value) => { update("tab", value === "all" ? "" : value); }}
      />
      <div className="admin-toolbar" style={{ marginTop: 14 }}>
        <form className="toolbar-grow" onSubmit={(event) => { event.preventDefault(); update("q", q.trim()); }} style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="Mã giao dịch, mã đơn, tên khách…" aria-label="Tìm giao dịch" value={q} onChange={(event) => setQ(event.target.value)} />
          <button type="submit" className="btn btn-outline btn-sm">Tìm</button>
        </form>
        <span className="trust-note"><Icon name="shield" size={14} /> Số tiền do máy chủ quyết định</span>
      </div>

      {state.loading && !state.data ? <Skeleton height={300} /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : (
        <>
          <DataTable
            rows={state.data || []}
            rowKey={(row) => row.id}
            columns={[
              { key: "ref", header: "Giao dịch", cell: (row) => <><span className="row-title" style={{ fontFamily: "monospace", fontSize: 12 }}>{row.merchantRef}</span><span className="row-sub">{formatDateTime(row.createdAt)}</span></> },
              { key: "booking", header: "Đơn / khách", cell: (row) => <>{row.bookingCode ? <Link to={`/admin/bookings/${row.bookingCode}`} className="text-link">{row.bookingCode}</Link> : "—"}<span className="row-sub">{row.customerName} · {row.tourName}</span></> },
              { key: "method", header: "Phương thức", cell: (row) => row.method },
              { key: "purpose", header: "Mục đích", cell: (row) => row.purpose === "deposit" ? "Cọc" : row.purpose === "full" ? "Toàn bộ" : "Còn lại" },
              { key: "amount", header: "Số tiền", align: "right", cell: (row) => formatVnd(row.amount) },
              { key: "status", header: "Trạng thái", cell: (row) => <><StatusChip status={row.status} kind="txn" size="sm" />{row.flag ? <span className="chip chip--danger chip--sm" style={{ marginLeft: 4 }}>Lệch tiền</span> : null}{row.reconciledAt ? <span className="chip chip--ok chip--sm" style={{ marginLeft: 4 }}>Đã đối soát</span> : null}</> },
              { key: "proof", header: "Chứng từ", cell: (row) => row.proofUrl ? <a href={row.proofUrl} target="_blank" rel="noopener noreferrer" className="text-link">Xem ảnh</a> : "—" },
              {
                key: "actions", header: "", align: "right",
                cell: (row) => canConfirm ? (
                  <span className="table-actions">
                    {row.method === "bank_transfer" && ["pending", "initiated"].includes(row.status) ? (
                      <>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => openConfirm(row)}>Xác nhận</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRejectTarget(row); setRejectReason(""); setError(null); }}>Từ chối</button>
                      </>
                    ) : null}
                    {row.status === "succeeded" && !row.reconciledAt ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => reconcile(row)}>Đối soát</button> : null}
                  </span>
                ) : "—",
              },
            ]}
            empty={<EmptyState icon="credit-card" title="Không có giao dịch" description="Giao dịch sẽ xuất hiện khi khách thanh toán." />}
          />
          <AdminPagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        title="Xác nhận chuyển khoản"
        size="lg"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setConfirmTarget(null)}>Hủy</button><button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>{busy ? "Đang xác nhận…" : "Xác nhận thanh toán"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {confirmTarget ? (
          <div className="admin-grid">
            <div>
              {confirmTarget.proofUrl ? <img src={confirmTarget.proofUrl} alt="Chứng từ chuyển khoản" style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)" }} /> : <Notice tone="warning">Chưa có ảnh chứng từ.</Notice>}
            </div>
            <div>
              <InfoList items={[
                { label: "Đơn", value: <Link to={`/admin/bookings/${confirmTarget.bookingCode}`} className="text-link">{confirmTarget.bookingCode}</Link> },
                { label: "Khách", value: confirmTarget.customerName },
                { label: "Tour", value: confirmTarget.tourName },
                { label: "Khởi hành", value: confirmTarget.departureDate ? formatDate(confirmTarget.departureDate) : "—" },
                { label: "Số tiền cần thu", value: formatVnd(confirmTarget.amount) },
              ]} />
              <Field label="Số tiền thực nhận (theo sao kê)" htmlFor="received-amount" required>
                <input id="received-amount" type="number" step="1000" className="input" value={confirmForm.receivedAmount} onChange={(event) => setConfirmForm({ ...confirmForm, receivedAmount: Number(event.target.value) })} />
              </Field>
              <Field label="Ngày nhận" htmlFor="received-date"><input id="received-date" type="date" className="input" value={confirmForm.paidAt} onChange={(event) => setConfirmForm({ ...confirmForm, paidAt: event.target.value })} /></Field>
              <Field label="Ghi chú" htmlFor="confirm-note"><input id="confirm-note" className="input" value={confirmForm.note} onChange={(event) => setConfirmForm({ ...confirmForm, note: event.target.value })} /></Field>
              <p className="field-hint">Số tiền lệch sẽ bị từ chối với mã <code>PAYMENT_AMOUNT_MISMATCH</code> và ghi nhật ký.</p>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Từ chối giao dịch"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setRejectTarget(null)}>Hủy</button><button type="button" className="btn btn-danger" onClick={reject} disabled={busy || rejectReason.trim().length < 5}>{busy ? "Đang xử lý…" : "Từ chối"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Lý do từ chối" htmlFor="reject-payment" required hint="Gửi cho khách trong thông báo."><textarea id="reject-payment" className="input textarea" rows={3} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} /></Field>
      </Modal>
    </>
  );
}
