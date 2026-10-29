import { useState } from "react";
import { Link } from "react-router-dom";
import type { Meta, Refund } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { formatDateTime, formatVnd } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { Icon } from "../../components/Icon";
import { DataTable, EmptyState, ErrorState, Field, Notice, Skeleton, StatusChip } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader, AdminPagination, AdminTabs, useAdminParams } from "./shared";

interface RefundRow extends Refund {
  bookingCode: string;
  customerName: string;
  customerEmail: string;
  requesterName: string;
  approverName: string;
  needsSecondApproval: boolean;
}

export default function AdminRefundsPage() {
  const { get, update, setPage } = useAdminParams();
  const { user } = useSession();
  const toast = useToast();
  const status = get("status");
  const page = Number(get("page", "1"));
  const [q, setQ] = useState(get("q"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RefundRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ bookingCode: "", amount: 0, type: "cash_back", reasonCode: "goodwill", note: "" });
  const canApprove = user?.permissions.includes("refund:approve") ?? false;
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (get("q")) query.set("q", get("q"));
  query.set("page", String(page));
  query.set("perPage", "20");
  const state = useApi<RefundRow[]>(`/admin/refunds?${query.toString()}`, [status, get("q"), page]);
  const meta = state.meta as Meta | undefined;

  const act = async (row: RefundRow, action: "approve" | "process" | "complete") => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ needsSecondApproval?: boolean }>(`/admin/refunds/${row.id}/${action}`, {
        method: "POST",
        body: action === "approve" ? { note: null } : action === "process" ? { providerRefundId: `RF-${Date.now()}` } : {},
      });
      if (result.needsSecondApproval) toast.info("Khoản hoàn tiền lớn cần người duyệt thứ hai.");
      else toast.success(action === "approve" ? "Đã duyệt hoàn tiền." : action === "process" ? "Đang xử lý hoàn tiền." : "Đã hoàn tất hoàn tiền.");
      state.reload();
    } catch (err) {
      toast.error(isApiError(err) ? err.message : "Chưa xử lý được.");
    } finally { setBusy(false); }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/refunds/${rejectTarget.id}/reject`, { method: "POST", body: { reason: rejectReason } });
      toast.success("Đã từ chối hoàn tiền.");
      setRejectTarget(null);
      setRejectReason("");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa từ chối được."); }
    finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/admin/refunds", { method: "POST", body: createForm });
      setCreateOpen(false);
      setCreateForm({ bookingCode: "", amount: 0, type: "cash_back", reasonCode: "goodwill", note: "" });
      toast.success("Đã tạo yêu cầu hoàn tiền.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa tạo được yêu cầu."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Seo title="Hoàn tiền" noindex />
      <AdminHeader
        title="Hoàn tiền"
        description="Duyệt và xử lý hoàn tiền theo chính sách. Người tạo không được tự duyệt."
        actions={canApprove ? <button type="button" className="btn btn-primary btn-sm" onClick={() => { setCreateOpen(true); setError(null); }}><Icon name="plus" size={15} /> Tạo hoàn tiền</button> : null}
      />
      <AdminTabs
        items={[
          { id: "", label: "Tất cả" }, { id: "requested", label: "Chờ duyệt" }, { id: "approved", label: "Đã duyệt" },
          { id: "processing", label: "Đang hoàn" }, { id: "completed", label: "Đã hoàn" }, { id: "rejected", label: "Từ chối" },
        ]}
        value={status}
        onChange={(value) => update("status", value)}
      />
      <div className="admin-toolbar" style={{ marginTop: 14 }}>
        <form className="toolbar-grow" onSubmit={(event) => { event.preventDefault(); update("q", q.trim()); }} style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="Mã đơn hoặc tên khách…" aria-label="Tìm hoàn tiền" value={q} onChange={(event) => setQ(event.target.value)} />
          <button type="submit" className="btn btn-outline btn-sm">Tìm</button>
        </form>
        <span className="trust-note"><Icon name="shield" size={14} /> Ngưỡng hai người duyệt áp dụng tự động</span>
      </div>
      {state.loading && !state.data ? <Skeleton height={300} /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : (
        <>
          <DataTable
            rows={state.data || []}
            rowKey={(row) => row.id}
            columns={[
              { key: "id", header: "Mã", cell: (row) => <><span className="row-title">#{row.id}</span><span className="row-sub">{formatDateTime(row.createdAt)}</span></> },
              { key: "booking", header: "Đơn / khách", cell: (row) => <><Link to={`/admin/bookings/${row.bookingCode}`} className="text-link">{row.bookingCode}</Link><span className="row-sub">{row.customerName}</span></> },
              { key: "amount", header: "Số tiền", align: "right", cell: (row) => <>{formatVnd(row.amount)}{row.needsSecondApproval ? <span className="row-sub" style={{ color: "var(--pending)" }}>Cần duyệt 2</span> : null}</> },
              { key: "type", header: "Hình thức", cell: (row) => row.type === "credit" ? "Bảo lưu" : "Hoàn tiền" },
              { key: "reason", header: "Lý do", cell: (row) => <>{row.reasonCode}<span className="row-sub">{row.policyApplied}</span></> },
              { key: "requester", header: "Người tạo", cell: (row) => row.requesterName },
              { key: "status", header: "Trạng thái", cell: (row) => <StatusChip status={row.status} kind="refund" size="sm" /> },
              {
                key: "actions", header: "", align: "right",
                cell: (row) => canApprove ? (
                  <span className="table-actions">
                    {["requested", "approved"].includes(row.status) && row.requestedBy !== user?.id ? <button type="button" className="btn btn-primary btn-sm" onClick={() => act(row, "approve")} disabled={busy}>Duyệt</button> : null}
                    {["requested", "approved"].includes(row.status) && row.requestedBy !== user?.id ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRejectTarget(row); setRejectReason(""); setError(null); }}>Từ chối</button> : null}
                    {row.status === "approved" ? <button type="button" className="btn btn-outline btn-sm" onClick={() => act(row, "process")} disabled={busy}>Xử lý</button> : null}
                    {row.status === "processing" ? <button type="button" className="btn btn-accent btn-sm" onClick={() => act(row, "complete")} disabled={busy}>Hoàn tất</button> : null}
                  </span>
                ) : "—",
              },
            ]}
            empty={<EmptyState icon="refresh" title="Không có khoản hoàn tiền" description="Các yêu cầu hoàn tiền sẽ xuất hiện tại đây." />}
          />
          <AdminPagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tạo yêu cầu hoàn tiền"
        description="Dùng cho hoàn tiền thiện chí hoặc xử lý khiếu nại. Không vượt quá số đã thu."
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={create} disabled={busy}>{busy ? "Đang tạo…" : "Tạo yêu cầu"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Mã đơn" htmlFor="refund-booking" required><input id="refund-booking" className="input" value={createForm.bookingCode} onChange={(event) => setCreateForm({ ...createForm, bookingCode: event.target.value.toUpperCase() })} /></Field>
        <Field label="Số tiền (VND)" htmlFor="refund-amount" required><input id="refund-amount" type="number" step="1000" min={1} className="input" value={createForm.amount} onChange={(event) => setCreateForm({ ...createForm, amount: Number(event.target.value) })} /></Field>
        <Field label="Hình thức" htmlFor="refund-type">
          <select id="refund-type" className="input" value={createForm.type} onChange={(event) => setCreateForm({ ...createForm, type: event.target.value })}>
            <option value="cash_back">Hoàn về phương thức thanh toán</option><option value="credit">Bảo lưu cho lần sau</option>
          </select>
        </Field>
        <Field label="Lý do" htmlFor="refund-reason"><input id="refund-reason" className="input" value={createForm.reasonCode} onChange={(event) => setCreateForm({ ...createForm, reasonCode: event.target.value })} /></Field>
        <Field label="Ghi chú" htmlFor="refund-note"><textarea id="refund-note" className="input textarea" rows={2} value={createForm.note} onChange={(event) => setCreateForm({ ...createForm, note: event.target.value })} /></Field>
        <p className="field-hint">Khoản ≥ ngưỡng cấu hình cần hai người duyệt khác nhau và khác người tạo.</p>
      </Modal>

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Từ chối hoàn tiền"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setRejectTarget(null)}>Hủy</button><button type="button" className="btn btn-danger" onClick={reject} disabled={busy || rejectReason.trim().length < 5}>{busy ? "Đang xử lý…" : "Từ chối"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Lý do từ chối" htmlFor="reject-refund" required><textarea id="reject-refund" className="input textarea" rows={3} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} /></Field>
      </Modal>
    </>
  );
}
