import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { formatDateTime } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { Icon } from "../../components/Icon";
import { DataTable, EmptyState, ErrorState, Skeleton, StatusChip } from "../../components/ui";
import { useToast } from "../../components/Toast";
import type { Meta, TourStatus } from "../../types";
import { AdminHeader, AdminPagination, useAdminParams } from "./shared";

interface AdminTourRow {
  id: number;
  code: string;
  name: string;
  slug: string;
  status: TourStatus;
  destinationName: string;
  categoryName: string;
  durationDays: number;
  durationNights: number;
  departures: number;
  bookings: number;
  ratingAvg: number;
  ratingCount: number;
  version: number;
  updatedAt: string;
}

export default function AdminToursPage() {
  const { get, update, setPage } = useAdminParams();
  const { user } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState(get("q"));
  const page = Number(get("page", "1"));
  const params = new URLSearchParams();
  if (get("q")) params.set("q", get("q"));
  if (get("status")) params.set("status", get("status"));
  params.set("page", String(page));
  params.set("perPage", "20");
  const state = useApi<AdminTourRow[]>(`/admin/tours?${params.toString()}`, [get("q"), get("status"), page]);
  const meta = state.meta as Meta | undefined;
  const canPublish = user?.permissions.includes("tour:publish");
  const canCreate = user?.permissions.includes("tour:create");

  const publish = async (id: number, name: string) => {
    try {
      await api(`/admin/tours/${id}/publish`, { method: "POST" });
      toast.success(`Đã xuất bản “${name}”.`);
      state.reload();
    } catch (error) {
      if (isApiError(error)) {
        const issues = error.extra?.issues as string[] | undefined;
        toast.error(issues?.length ? `Chưa đủ điều kiện: ${issues.join(", ")}` : error.message);
      } else toast.error("Chưa xuất bản được tour.");
    }
  };

  return (
    <>
      <Seo title="Quản lý tour" noindex />
      <AdminHeader
        title="Sản phẩm tour"
        description="Quản lý nội dung, lịch trình, giá và trạng thái xuất bản."
        actions={canCreate ? <Link to="/admin/tours/new" className="btn btn-primary"><Icon name="plus" size={15} /> Tạo tour</Link> : null}
      />
      <div className="admin-toolbar">
        <form className="toolbar-grow" onSubmit={(event) => { event.preventDefault(); update("q", query.trim()); }} role="search" style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="Tìm tên tour, mã, điểm đến…" aria-label="Tìm tour" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="submit" className="btn btn-outline btn-sm">Tìm</button>
        </form>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-hint">Trạng thái</span>
          <select className="input" value={get("status")} onChange={(event) => update("status", event.target.value)}>
            <option value="">Tất cả</option>
            <option value="published">Đang hiển thị</option>
            <option value="draft">Nháp</option>
            <option value="hidden">Đang ẩn</option>
            <option value="archived">Lưu trữ</option>
          </select>
        </label>
      </div>
      {state.loading && !state.data ? <Skeleton height={360} /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : (
        <>
          <DataTable
            rows={state.data || []}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/admin/tours/${row.id}`)}
            columns={[
              { key: "tour", header: "Tour", cell: (row) => <><span className="row-title">{row.name}</span><span className="row-sub">{row.code} · {row.destinationName} · {row.durationDays}N{row.durationNights}Đ</span></> },
              { key: "category", header: "Danh mục", cell: (row) => row.categoryName },
              { key: "status", header: "Trạng thái", cell: (row) => <StatusChip status={row.status} kind="tour" size="sm" /> },
              { key: "departures", header: "Lịch", align: "center", cell: (row) => row.departures },
              { key: "bookings", header: "Đơn", align: "center", cell: (row) => row.bookings },
              { key: "rating", header: "Đánh giá", align: "center", cell: (row) => row.ratingCount ? `${row.ratingAvg.toFixed(1)} (${row.ratingCount})` : "—" },
              { key: "updated", header: "Cập nhật", cell: (row) => <span className="row-sub">{formatDateTime(row.updatedAt)}</span> },
              {
                key: "actions", header: "", align: "right",
                cell: (row) => (
                  <span className="table-actions" onClick={(event) => event.stopPropagation()}>
                    <Link to={`/admin/tours/${row.id}`} className="btn btn-ghost btn-sm">Sửa</Link>
                    {canPublish && row.status === "draft" ? <button type="button" className="btn btn-outline btn-sm" onClick={() => publish(row.id, row.name)}>Xuất bản</button> : null}
                  </span>
                ),
              },
            ]}
            empty={<EmptyState icon="compass" title="Chưa có tour" description="Tạo tour đầu tiên để bắt đầu bán." action={canCreate ? <Link to="/admin/tours/new" className="btn btn-primary">Tạo tour</Link> : undefined} />}
          />
          <AdminPagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
        </>
      )}
    </>
  );
}
