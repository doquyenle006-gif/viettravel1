import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { Seo } from "../../components/Seo";
import { DataTable, EmptyState, ErrorState, Field, Notice, Skeleton } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader } from "./shared";

interface CatalogRow {
  id: number;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  tourCount: number;
  region?: string;
  province?: string;
  lat?: number | null;
  lng?: number | null;
  image?: string | null;
}

export default function AdminCatalogPage() {
  const { type = "destinations" } = useParams();
  const isDestination = type !== "categories";
  const { user } = useSession();
  const toast = useToast();
  const state = useApi<CatalogRow[]>(`/admin/catalog/${isDestination ? "destinations" : "categories"}`, [type]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", region: "north", province: "", lat: "", lng: "", active: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = user?.permissions.includes("tour:update") ?? false;

  const startCreate = () => {
    setEditing(null);
    setForm({ name: "", slug: "", description: "", region: "north", province: "", lat: "", lng: "", active: true });
    setOpen(true);
    setError(null);
  };
  const startEdit = (row: CatalogRow) => {
    setEditing(row);
    setForm({
      name: row.name, slug: row.slug, description: row.description || "",
      region: row.region || "north", province: row.province || "",
      lat: row.lat ? String(row.lat) : "", lng: row.lng ? String(row.lng) : "", active: row.active,
    });
    setOpen(true);
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...form,
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
      };
      if (editing) await api(`/admin/catalog/${isDestination ? "destinations" : "categories"}/${editing.id}`, { method: "PUT", body });
      else await api(`/admin/catalog/${isDestination ? "destinations" : "categories"}`, { method: "POST", body });
      setOpen(false);
      toast.success(editing ? "Đã cập nhật." : "Đã tạo mới.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa lưu được."); }
    finally { setBusy(false); }
  };

  const remove = async (row: CatalogRow) => {
    try {
      await api(`/admin/catalog/${isDestination ? "destinations" : "categories"}/${row.id}`, { method: "DELETE" });
      toast.success("Đã xóa.");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa xóa được."); }
  };

  const toggle = async (row: CatalogRow) => {
    try {
      await api(`/admin/catalog/${isDestination ? "destinations" : "categories"}/${row.id}`, { method: "PUT", body: { active: !row.active } });
      toast.success(row.active ? "Đã tạm ẩn." : "Đã kích hoạt.");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa cập nhật được."); }
  };

  return (
    <>
      <Seo title="Điểm đến & danh mục" noindex />
      <AdminHeader
        title="Điểm đến & danh mục"
        description="Dữ liệu nền dùng cho tour, bộ lọc và SEO. Không xóa khi còn tour tham chiếu."
        actions={canEdit ? <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>Thêm {isDestination ? "điểm đến" : "danh mục"}</button> : null}
      />
      <div className="tabs" style={{ marginBottom: 14 }}>
        <Link to="/admin/catalog/destinations" className={`tab ${isDestination ? "tab--active" : ""}`}>Điểm đến</Link>
        <Link to="/admin/catalog/categories" className={`tab ${!isDestination ? "tab--active" : ""}`}>Danh mục</Link>
      </div>
      {state.loading && !state.data ? <Skeleton height={280} /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : (
        <DataTable
          rows={state.data || []}
          rowKey={(row) => row.id}
          columns={[
            { key: "name", header: "Tên", cell: (row) => <><span className="row-title">{row.name}</span><span className="row-sub">/{row.slug}</span></> },
            ...(isDestination ? [{ key: "region", header: "Vùng / tỉnh", cell: (row: CatalogRow) => `${row.region === "north" ? "Miền Bắc" : row.region === "central" ? "Miền Trung" : "Miền Nam"}${row.province ? ` · ${row.province}` : ""}` }] : []),
            { key: "tourCount", header: "Số tour", align: "center", cell: (row) => row.tourCount },
            { key: "active", header: "Hiển thị", cell: (row) => row.active ? <span className="chip chip--ok chip--sm">Đang hiển thị</span> : <span className="chip chip--muted chip--sm">Tạm ẩn</span> },
            ...(canEdit ? [{
              key: "actions", header: "", align: "right" as const,
              cell: (row: CatalogRow) => (
                <span className="table-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(row)}>Sửa</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(row)}>{row.active ? "Ẩn" : "Hiện"}</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(row)}>Xóa</button>
                </span>
              ),
            }] : []),
          ]}
          empty={<EmptyState icon="map-pin" title={`Chưa có ${isDestination ? "điểm đến" : "danh mục"}`} description="Thêm dữ liệu nền để tạo tour." />}
        />
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Sửa ${isDestination ? "điểm đến" : "danh mục"}` : `Thêm ${isDestination ? "điểm đến" : "danh mục"}`}
        size="md"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Đang lưu…" : "Lưu"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="form-grid-2">
          <Field label="Tên" htmlFor="catalog-name" required><input id="catalog-name" className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Slug" htmlFor="catalog-slug" hint="Để trống để tự tạo."><input id="catalog-slug" className="input" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></Field>
          <Field label="Mô tả" htmlFor="catalog-description" className="field--full"><textarea id="catalog-description" className="input textarea" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
          {isDestination ? (
            <>
              <Field label="Vùng" htmlFor="catalog-region"><select id="catalog-region" className="input" value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })}><option value="north">Miền Bắc</option><option value="central">Miền Trung</option><option value="south">Miền Nam</option></select></Field>
              <Field label="Tỉnh/thành" htmlFor="catalog-province"><input id="catalog-province" className="input" value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} /></Field>
              <Field label="Vĩ độ" htmlFor="catalog-lat"><input id="catalog-lat" type="number" step="0.0001" className="input" value={form.lat} onChange={(event) => setForm({ ...form, lat: event.target.value })} /></Field>
              <Field label="Kinh độ" htmlFor="catalog-lng"><input id="catalog-lng" type="number" step="0.0001" className="input" value={form.lng} onChange={(event) => setForm({ ...form, lng: event.target.value })} /></Field>
            </>
          ) : null}
          <label className="checkbox-row"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> <span>Đang hiển thị</span></label>
        </div>
      </Modal>
    </>
  );
}
