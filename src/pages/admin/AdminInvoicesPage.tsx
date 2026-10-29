import { useState } from "react";
import { Link } from "react-router-dom";
import type { Invoice, Meta } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { formatDateTime, formatVnd } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { DataTable, EmptyState, ErrorState, Field, Notice, Skeleton, StatusChip } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader, AdminPagination, useAdminParams } from "./shared";

interface InvoiceRow extends Invoice {
  bookingCode: string;
  total: number;
  departureDate: string;
}

export default function AdminInvoicesPage() {
  const { get, update, setPage } = useAdminParams();
  const { user } = useSession();
  const toast = useToast();
  const status = get("status");
  const page = Number(get("page", "1"));
  const canManage = user?.permissions.includes("invoice:manage") ?? false;
  const [issueTarget, setIssueTarget] = useState<InvoiceRow | null>(null);
  const [issueForm, setIssueForm] = useState({ invoiceNo: "", note: "" });
  const [cancelTarget, setCancelTarget] = useState<InvoiceRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (get("q")) query.set("q", get("q"));
  query.set("page", String(page));
  query.set("perPage", "20");
  const state = useApi<InvoiceRow[]>(`/admin/invoices?${query.toString()}`, [status, get("q"), page]);
  const meta = state.meta as Meta | undefined;

  const issue = async () => {
    if (!issueTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/invoices/${issueTarget.id}/issue`, { method: "POST", body: issueForm });
      toast.success("Đã xuất hóa đơn.");
      setIssueTarget(null);
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa xuất được hóa đơn."); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/admin/invoices/${cancelTarget.id}/cancel`, { method: "POST", body: { reason: cancelReason } });
      toast.success("Đã hủy hóa đơn.");
      setCancelTarget(null);
      setCancelReason("");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa hủy được hóa đơn."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Seo title="Hóa đơn" noindex />
      <AdminHeader title="Hóa đơn" description="Yêu cầu xuất hóa đơn điện tử và xử lý điều chỉnh/thay thế." />
      <div className="admin-toolbar">
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-hint">Trạng thái</span>
          <select className="input" value={status} onChange={(event) => update("status", event.target.value)}>
            <option value="">Tất cả</option><option value="requested">Chờ xuất</option><option value="issued">Đã xuất</option><option value="cancelled">Đã hủy</option>
          </select>
        </label>
        <form className="toolbar-grow" onSubmit={(event) => { event.preventDefault(); update("q", (event.currentTarget.elements.namedItem("q") as HTMLInputElement).value); }} style={{ display: "flex", gap: 8 }}>
          <input name="q" className="input" placeholder="Mã đơn, công ty, MST…" aria-label="Tìm hóa đơn" defaultValue={get("q")} />
          <button type="submit" className="btn btn-outline btn-sm">Tìm</button>
        </form>
      </div>
      {state.loading && !state.data ? <Skeleton height={280} /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : (
        <>
          <DataTable
            rows={state.data || []}
            rowKey={(row) => row.id}
            columns={[
              { key: "booking", header: "Đơn", cell: (row) => <><Link to={`/admin/bookings/${row.bookingCode}`} className="text-link">{row.bookingCode}</Link><span className="row-sub">{row.departureDate ? row.departureDate.split("-").reverse().join("/") : ""}</span></> },
              { key: "company", header: "Công ty", cell: (row) => <>{row.companyName}<span className="row-sub">MST {row.taxCode}</span></> },
              { key: "amount", header: "Giá trị đơn", align: "right", cell: (row) => formatVnd(row.total) },
              { key: "email", header: "Email", cell: (row) => row.email },
              { key: "status", header: "Trạng thái", cell: (row) => <><StatusChip status={row.status === "issued" ? "completed" : row.status === "requested" ? "pending" : "cancelled"} kind="change" size="sm" />{row.invoiceNo ? <span className="row-sub">Số {row.invoiceNo}</span> : null}</> },
              { key: "created", header: "Yêu cầu lúc", cell: (row) => formatDateTime(row.requestedAt) },
              {
                key: "actions", header: "", align: "right",
                cell: (row) => canManage ? (
                  <span className="table-actions">
                    {row.status === "requested" ? <button type="button" className="btn btn-primary btn-sm" onClick={() => { setIssueTarget(row); setIssueForm({ invoiceNo: "", note: "" }); setError(null); }}>Xuất hóa đơn</button> : null}
                    {row.status !== "cancelled" ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setCancelTarget(row); setCancelReason(""); setError(null); }}>Hủy</button> : null}
                  </span>
                ) : "—",
              },
            ]}
            empty={<EmptyState icon="file-text" title="Chưa có yêu cầu hóa đơn" description="Khách có thể gửi yêu cầu từ chi tiết đơn." />}
          />
          <AdminPagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(issueTarget)}
        onClose={() => setIssueTarget(null)}
        title="Xuất hóa đơn"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setIssueTarget(null)}>Hủy</button><button type="button" className="btn btn-primary" onClick={issue} disabled={busy}>{busy ? "Đang xuất…" : "Xác nhận xuất"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Số hóa đơn" htmlFor="invoice-no" required hint="Số do nhà cung cấp hóa đơn điện tử cấp; không trùng.">
          <input id="invoice-no" className="input" value={issueForm.invoiceNo} onChange={(event) => setIssueForm({ ...issueForm, invoiceNo: event.target.value })} />
        </Field>
        <Field label="Ghi chú" htmlFor="invoice-note"><input id="invoice-note" className="input" value={issueForm.note} onChange={(event) => setIssueForm({ ...issueForm, note: event.target.value })} /></Field>
        {issueTarget ? <p className="field-hint">{issueTarget.companyName} · {issueTarget.email}</p> : null}
      </Modal>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Hủy hóa đơn"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setCancelTarget(null)}>Hủy</button><button type="button" className="btn btn-danger" onClick={cancel} disabled={busy || cancelReason.trim().length < 5}>{busy ? "Đang hủy…" : "Xác nhận hủy"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Lý do" htmlFor="invoice-cancel-reason" required><textarea id="invoice-cancel-reason" className="input textarea" rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></Field>
      </Modal>
    </>
  );
}
