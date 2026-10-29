import { useState } from "react";
import type { Meta } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { formatDateTime } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { DataTable, EmptyState, ErrorState, Skeleton } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { AdminHeader, AdminPagination, AdminTabs, useAdminParams } from "./shared";

interface AuditRow {
  id: number;
  actorId: number | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entity: string;
  entityId: string | number | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AlertRow {
  id: number;
  type: string;
  severity: string;
  message: string;
  entity: string | null;
  entityId: string | number | null;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
}

interface OutboxRow {
  id: number;
  to: string;
  subject: string;
  body: string;
  type: string;
  link: string | null;
  status: string;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
  lastError?: string | null;
}

export default function AdminAuditPage() {
  const { get, update, setPage } = useAdminParams();
  const toast = useToast();
  const tab = get("tab", "logs");
  const [q, setQ] = useState(get("q"));
  const page = Number(get("page", "1"));
  const query = new URLSearchParams();
  for (const key of ["q", "entity", "action", "from", "to", "status"]) if (get(key)) query.set(key, get(key));
  query.set("page", String(page));
  query.set("perPage", "50");
  const logs = useApi<AuditRow[]>(tab === "logs" ? `/admin/audit-logs?${query.toString()}` : null, [tab, get("q"), get("entity"), get("action"), get("from"), get("to"), page]);
  const alerts = useApi<AlertRow[]>(tab === "alerts" ? "/admin/alerts" : null, [tab]);
  const outbox = useApi<OutboxRow[]>(tab === "outbox" ? `/admin/outbox?${query.toString()}` : null, [tab, get("q"), page]);
  const meta = logs.meta as Meta | undefined;
  const outboxMeta = outbox.meta as Meta | undefined;

  const resolve = async (row: AlertRow) => {
    try {
      await api(`/admin/alerts/${row.id}/resolve`, { method: "POST" });
      toast.success("Đã đánh dấu cảnh báo đã xử lý.");
      alerts.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa xử lý được cảnh báo."); }
  };

  const retry = async (row: OutboxRow) => {
    try {
      await api(`/admin/outbox/${row.id}/retry`, { method: "POST" });
      toast.success(`Đã gửi lại thông báo tới ${row.to}.`);
      outbox.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa gửi lại được thông báo."); }
  };

  return (
    <>
      <Seo title="Nhật ký & cảnh báo" noindex />
      <AdminHeader title="Nhật ký & cảnh báo" description="Audit log bất biến cho thao tác tiền/trạng thái/quyền; cảnh báo hệ thống cần xử lý." />
      <AdminTabs items={[{ id: "logs", label: "Nhật ký thao tác" }, { id: "outbox", label: "Thông báo đã gửi" }, { id: "alerts", label: "Cảnh báo", badge: alerts.data?.filter((alert) => alert.status === "open").length || 0 }]} value={tab} onChange={(value) => update("tab", value === "logs" ? "" : value)} />
      {tab === "logs" ? (
        <>
          <div className="admin-toolbar" style={{ marginTop: 14 }}>
            <form className="toolbar-grow" onSubmit={(event) => { event.preventDefault(); update("q", q.trim()); }} style={{ display: "flex", gap: 8 }}>
              <input className="input" placeholder="Hành động, người thao tác, đối tượng…" aria-label="Tìm nhật ký" value={q} onChange={(event) => setQ(event.target.value)} />
              <button type="submit" className="btn btn-outline btn-sm">Tìm</button>
            </form>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field-hint">Đối tượng</span>
              <select className="input" value={get("entity")} onChange={(event) => update("entity", event.target.value)}>
                <option value="">Tất cả</option>
                {["booking", "payment", "refund", "tour", "departure", "user", "setting", "review", "coupon", "invoice"].map((entity) => <option key={entity} value={entity}>{entity}</option>)}
              </select>
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field-hint">Từ ngày</span>
              <input className="input" type="date" value={get("from")} onChange={(event) => update("from", event.target.value)} />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field-hint">Đến ngày</span>
              <input className="input" type="date" value={get("to")} onChange={(event) => update("to", event.target.value)} />
            </label>
          </div>
          {logs.loading && !logs.data ? <Skeleton height={300} /> : logs.error ? <ErrorState error={logs.error} onRetry={logs.reload} /> : (
            <>
              <DataTable
                rows={logs.data || []}
                rowKey={(row) => row.id}
                columns={[
                  { key: "time", header: "Thời điểm", cell: (row) => formatDateTime(row.createdAt) },
                  { key: "actor", header: "Người thao tác", cell: (row) => <>{row.actorName || "Hệ thống"}<span className="row-sub">{row.actorRole || "—"} · {row.ip || "—"}</span></> },
                  { key: "action", header: "Hành động", cell: (row) => <><span className="row-title">{row.action}</span><span className="row-sub">{row.entity} #{row.entityId ?? "—"}</span></> },
                  { key: "diff", header: "Trước / sau", cell: (row) => <details><summary className="text-link" style={{ fontSize: 12 }}>Xem diff</summary><pre style={{ fontSize: 10.5, maxWidth: 420, overflow: "auto", background: "var(--surface-2)", padding: 8, borderRadius: 6 }}>{JSON.stringify({ before: row.before, after: row.after }, null, 2)}</pre></details> },
                ]}
                empty={<EmptyState icon="clipboard" title="Không có nhật ký" description="Thao tác quan trọng sẽ được ghi tự động." />}
              />
              <AdminPagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
            </>
          )}
        </>
      ) : tab === "outbox" ? (
        <div style={{ marginTop: 14 }}>
          <div className="admin-toolbar">
            <form className="toolbar-grow" onSubmit={(event) => { event.preventDefault(); update("q", q.trim()); }} style={{ display: "flex", gap: 8 }}>
              <input className="input" placeholder="Người nhận, tiêu đề, loại…" aria-label="Tìm thông báo" value={q} onChange={(event) => setQ(event.target.value)} />
              <button type="submit" className="btn btn-outline btn-sm">Tìm</button>
            </form>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field-hint">Trạng thái</span>
              <select className="input" value={get("status")} onChange={(event) => update("status", event.target.value)}>
                <option value="">Tất cả</option>
                <option value="sent">Đã gửi</option>
                <option value="queued">Chờ gửi</option>
                <option value="failed">Lỗi</option>
              </select>
            </label>
          </div>
          {outbox.loading && !outbox.data ? <Skeleton height={300} /> : outbox.error ? <ErrorState error={outbox.error} onRetry={outbox.reload} /> : (
            <>
              <DataTable
                rows={outbox.data || []}
                rowKey={(row) => row.id}
                columns={[
                  { key: "to", header: "Người nhận", cell: (row) => <><span className="row-title">{row.to}</span><span className="row-sub">{row.subject}</span></> },
                  { key: "type", header: "Loại", cell: (row) => <><span className="row-title">{row.type}</span>{row.link ? <span className="row-sub">{row.link}</span> : null}</> },
                  { key: "status", header: "Trạng thái", cell: (row) => <><span className={`chip chip--sm ${row.status === "sent" ? "chip--ok" : row.status === "failed" ? "chip--danger" : "chip--pending"}`}>{row.status === "sent" ? "Đã gửi" : row.status === "failed" ? "Lỗi" : "Chờ gửi"}</span><span className="row-sub">{row.attempts} lần thử</span></> },
                  { key: "time", header: "Thời điểm", cell: (row) => <>{formatDateTime(row.createdAt)}<span className="row-sub">{row.sentAt ? `Gửi lúc ${formatDateTime(row.sentAt)}` : "Chưa gửi"}</span></> },
                  { key: "actions", header: "", align: "right", cell: (row) => <button type="button" className="btn btn-ghost btn-sm" onClick={() => retry(row)} disabled={row.status === "queued"}>Gửi lại</button> },
                ]}
                empty={<EmptyState icon="mail" title="Chưa có thông báo" description="Email xác nhận, nhắc thanh toán và cập nhật đơn sẽ xuất hiện tại đây." />}
              />
              <AdminPagination page={outboxMeta?.page || page} totalPages={outboxMeta?.totalPages || 1} total={outboxMeta?.total} perPage={outboxMeta?.perPage} onChange={setPage} />
            </>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          {alerts.loading && !alerts.data ? <Skeleton height={260} /> : alerts.error ? <ErrorState error={alerts.error} onRetry={alerts.reload} /> : (
            <div className="booking-list">
              {!alerts.data?.length ? <EmptyState icon="alert" title="Không có cảnh báo" /> : null}
              {alerts.data?.map((alert) => (
                <div key={alert.id} className={`admin-alert ${alert.severity === "danger" ? "admin-alert--danger" : alert.severity === "info" ? "admin-alert--info" : ""}`} style={{ background: alert.status === "resolved" ? "var(--surface-2)" : undefined, color: alert.status === "resolved" ? "var(--text)" : undefined }}>
                  <span style={{ flex: 1 }}>
                    <strong>{alert.type}</strong>
                    <p style={{ fontSize: 12.5 }}>{alert.message}</p>
                    <span className="row-sub">{formatDateTime(alert.createdAt)} · {alert.status === "open" ? "Đang mở" : `Đã xử lý lúc ${formatDateTime(alert.resolvedAt)}`}</span>
                  </span>
                  {alert.status === "open" ? <button type="button" className="btn btn-outline btn-sm" onClick={() => resolve(alert)}>Đánh dấu đã xử lý</button> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
