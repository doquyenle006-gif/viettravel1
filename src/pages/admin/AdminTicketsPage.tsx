import { useState } from "react";
import { Link } from "react-router-dom";
import type { Meta, TicketRow } from "../../types";
import { useApi } from "../../lib/hooks";
import { formatDateTime } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { DataTable, EmptyState, ErrorState, Skeleton, StatusChip } from "../../components/ui";
import { AdminHeader, AdminPagination, useAdminParams } from "./shared";

const TYPE_LABELS: Record<string, string> = { support: "Hỗ trợ", complaint: "Khiếu nại", custom_tour: "Tour riêng" };
const PRIORITY_LABELS: Record<string, string> = { low: "Thấp", normal: "Bình thường", high: "Cao", urgent: "Khẩn" };

export default function AdminTicketsPage() {
  const { get, update, setPage } = useAdminParams();
  const [q, setQ] = useState(get("q"));
  const page = Number(get("page", "1"));
  const query = new URLSearchParams();
  for (const key of ["status", "type", "sla", "q"]) if (get(key)) query.set(key, get(key));
  query.set("page", String(page));
  query.set("perPage", "20");
  const state = useApi<TicketRow[]>(`/admin/tickets?${query.toString()}`, [get("status"), get("type"), get("sla"), get("q"), page]);
  const meta = state.meta as Meta | undefined;
  return (
    <>
      <Seo title="Hỗ trợ & ticket" noindex />
      <AdminHeader title="Hỗ trợ & ticket" description="Hàng đợi có SLA, ưu tiên khiếu nại và yêu cầu tour riêng." />
      <div className="admin-toolbar">
        <form className="toolbar-grow" onSubmit={(event) => { event.preventDefault(); update("q", q.trim()); }} style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="Mã, tiêu đề, khách hàng…" aria-label="Tìm ticket" value={q} onChange={(event) => setQ(event.target.value)} />
          <button type="submit" className="btn btn-outline btn-sm">Tìm</button>
        </form>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-hint">Trạng thái</span>
          <select className="input" value={get("status")} onChange={(event) => update("status", event.target.value)}>
            <option value="">Tất cả</option><option value="open">Mới</option><option value="in_progress">Đang xử lý</option>
            <option value="waiting_customer">Chờ khách</option><option value="resolved">Đã giải quyết</option><option value="closed">Đã đóng</option>
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-hint">Loại</span>
          <select className="input" value={get("type")} onChange={(event) => update("type", event.target.value)}>
            <option value="">Tất cả</option><option value="support">Hỗ trợ</option><option value="complaint">Khiếu nại</option><option value="custom_tour">Tour riêng</option>
          </select>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={get("sla") === "overdue"} onChange={(event) => update("sla", event.target.checked ? "overdue" : "")} />
          <span>Quá SLA</span>
        </label>
      </div>
      {state.loading && !state.data ? <Skeleton height={280} /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : (
        <>
          <DataTable
            rows={state.data || []}
            rowKey={(row) => row.id}
            columns={[
              { key: "code", header: "Ticket", cell: (row) => <><Link to={`/admin/tickets/${row.id}`} className="row-title">{row.code}</Link><span className="row-sub">{formatDateTime(row.createdAt)}</span></> },
              { key: "subject", header: "Chủ đề / khách", cell: (row) => <>{row.subject}<span className="row-sub">{row.customerName || "Khách vãng lai"} · {row.customerEmail || "—"}</span></> },
              { key: "type", header: "Loại", cell: (row) => TYPE_LABELS[row.type] || row.type },
              { key: "priority", header: "Ưu tiên", cell: (row) => <span className={`chip chip--${row.priority === "urgent" || row.priority === "high" ? "danger" : "muted"} chip--sm`}>{PRIORITY_LABELS[row.priority] || row.priority}</span> },
              { key: "sla", header: "SLA", cell: (row) => <span style={{ color: row.slaOverdue ? "var(--danger)" : undefined }}>{row.slaOverdue ? "Quá hạn" : formatDateTime(row.slaDueAt)}</span> },
              { key: "assign", header: "Phụ trách", cell: (row) => row.assignedName || "Chưa gán" },
              { key: "status", header: "Trạng thái", cell: (row) => <StatusChip status={row.status} kind="ticket" size="sm" /> },
              { key: "actions", header: "", align: "right", cell: (row) => <Link to={`/admin/tickets/${row.id}`} className="btn btn-ghost btn-sm">Mở</Link> },
            ]}
            empty={<EmptyState icon="message" title="Không có ticket" description="Yêu cầu tư vấn/khiếu nại sẽ xuất hiện tại đây." />}
          />
          <AdminPagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
        </>
      )}
    </>
  );
}
