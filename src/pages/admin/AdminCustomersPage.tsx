import { useState } from "react";
import { Link } from "react-router-dom";
import type { Meta } from "../../types";
import { useApi } from "../../lib/hooks";
import { formatDate, formatDateTime, formatVnd } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { DataTable, EmptyState, ErrorState, Skeleton, StatusChip } from "../../components/ui";
import { AdminHeader, AdminPagination, useAdminParams } from "./shared";

interface CustomerRow {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  status: "active" | "locked";
  emailVerified: boolean;
  bookingCount: number;
  totalSpend: number;
  createdAt: string;
  lastBookingAt: string | null;
  marketingConsent: boolean;
}

export default function AdminCustomersPage() {
  const { get, update, setPage } = useAdminParams();
  const [q, setQ] = useState(get("q"));
  const page = Number(get("page", "1"));
  const query = new URLSearchParams();
  if (get("q")) query.set("q", get("q"));
  if (get("status")) query.set("status", get("status"));
  query.set("page", String(page));
  query.set("perPage", "20");
  const state = useApi<CustomerRow[]>(`/admin/customers?${query.toString()}`, [get("q"), get("status"), page]);
  const meta = state.meta as Meta | undefined;
  return (
    <>
      <Seo title="Khách hàng" noindex />
      <AdminHeader title="Khách hàng" description="Hồ sơ, lịch sử đơn, bảo lưu và trạng thái tài khoản." />
      <div className="admin-toolbar">
        <form className="toolbar-grow" onSubmit={(event) => { event.preventDefault(); update("q", q.trim()); }} style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="Tên, email, số điện thoại…" aria-label="Tìm khách hàng" value={q} onChange={(event) => setQ(event.target.value)} />
          <button type="submit" className="btn btn-outline btn-sm">Tìm</button>
        </form>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-hint">Trạng thái</span>
          <select className="input" value={get("status")} onChange={(event) => update("status", event.target.value)}>
            <option value="">Tất cả</option><option value="active">Hoạt động</option><option value="locked">Đã khóa</option>
          </select>
        </label>
      </div>
      {state.loading && !state.data ? <Skeleton height={300} /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : (
        <>
          <DataTable
            rows={state.data || []}
            rowKey={(row) => row.id}
            columns={[
              { key: "name", header: "Khách hàng", cell: (row) => <><Link to={`/admin/customers/${row.id}`} className="row-title">{row.fullName}</Link><span className="row-sub">{row.email} · {row.phone || "Chưa có SĐT"}</span></> },
              { key: "status", header: "Tài khoản", cell: (row) => <><StatusChip status={row.status} kind="user" size="sm" />{!row.emailVerified ? <span className="chip chip--pending chip--sm" style={{ marginLeft: 4 }}>Chưa xác minh</span> : null}</> },
              { key: "bookings", header: "Số đơn", align: "center", cell: (row) => row.bookingCount },
              { key: "spend", header: "Tổng chi tiêu", align: "right", cell: (row) => formatVnd(row.totalSpend) },
              { key: "last", header: "Đơn gần nhất", cell: (row) => row.lastBookingAt ? formatDateTime(row.lastBookingAt) : "—" },
              { key: "created", header: "Tham gia", cell: (row) => formatDate(row.createdAt) },
              { key: "actions", header: "", align: "right", cell: (row) => <Link to={`/admin/customers/${row.id}`} className="btn btn-ghost btn-sm">Chi tiết</Link> },
            ]}
            empty={<EmptyState icon="user" title="Không có khách hàng" description="Khách đăng ký hoặc được nhân viên tạo sẽ xuất hiện tại đây." />}
          />
          <AdminPagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
        </>
      )}
    </>
  );
}
