import { useState } from "react";
import type { Meta } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { formatDate, formatVnd, todayIso } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { DataTable, EmptyState, ErrorState, Field, Notice, Skeleton, StatusChip } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader, AdminPagination, useAdminParams } from "./shared";

interface CouponRow {
  id: number; code: string; name: string; type: "percent" | "fixed"; value: number;
  maxDiscount: number | null; minOrder: number; validFrom: string; validTo: string;
  usageLimit: number | null; perUserLimit: number; usedCount: number; active: boolean;
  appliesTo: { type: "all" | "tour" | "category"; tourIds?: number[]; categoryIds?: number[] };
  usagePercent: number | null; revenue: number; totalDiscount: number;
}

interface TourOption { id: number; name: string }

const emptyForm = {
  code: "", name: "", type: "percent", value: 10, maxDiscount: 500000, minOrder: 0,
  validFrom: todayIso(), validTo: "", usageLimit: 100, perUserLimit: 1,
  appliesType: "all", tourIds: [] as number[], active: true,
};

export default function AdminCouponsPage() {
  const { get, update, setPage } = useAdminParams();
  const { user } = useSession();
  const toast = useToast();
  const [q, setQ] = useState(get("q"));
  const page = Number(get("page", "1"));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManage = user?.permissions.includes("coupon:manage") ?? false;
  const query = new URLSearchParams();
  if (get("q")) query.set("q", get("q"));
  if (get("status")) query.set("status", get("status"));
  query.set("page", String(page));
  query.set("perPage", "20");
  const state = useApi<CouponRow[]>(`/admin/coupons?${query.toString()}`, [get("q"), get("status"), page]);
  const tours = useApi<TourOption[]>("/admin/tours?perPage=100", []);
  const meta = state.meta as Meta | undefined;

  const startCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, validTo: "" });
    setOpen(true);
    setError(null);
  };
  const startEdit = (row: CouponRow) => {
    setEditing(row);
    setForm({
      code: row.code, name: row.name, type: row.type, value: row.value,
      maxDiscount: row.maxDiscount || 0, minOrder: row.minOrder,
      validFrom: row.validFrom, validTo: row.validTo, usageLimit: row.usageLimit || 0,
      perUserLimit: row.perUserLimit, appliesType: row.appliesTo.type,
      tourIds: row.appliesTo.tourIds || [], active: row.active,
    });
    setOpen(true);
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...form, type: form.type as "percent" | "fixed",
        maxDiscount: form.maxDiscount || null, usageLimit: form.usageLimit || null,
        appliesTo: form.appliesType === "tour" ? { type: "tour", tourIds: form.tourIds } : { type: "all" },
      };
      if (editing) await api(`/admin/coupons/${editing.id}`, { method: "PUT", body });
      else await api("/admin/coupons", { method: "POST", body });
      setOpen(false);
      toast.success(editing ? "Đã cập nhật mã giảm giá." : "Đã tạo mã giảm giá.");
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa lưu được mã."); }
    finally { setBusy(false); }
  };

  const deactivate = async (row: CouponRow) => {
    try {
      await api(`/admin/coupons/${row.id}`, { method: "DELETE" });
      toast.success("Đã ngừng áp dụng mã.");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa ngừng được mã."); }
  };

  const toggle = async (row: CouponRow) => {
    try {
      await api(`/admin/coupons/${row.id}`, { method: "PUT", body: { active: !row.active } });
      state.reload();
      toast.success(row.active ? "Đã tạm ngưng mã." : "Đã kích hoạt mã.");
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa cập nhật được."); }
  };

  return (
    <>
      <Seo title="Mã giảm giá" noindex />
      <AdminHeader
        title="Mã giảm giá"
        description="Quản lý ưu đãi, giới hạn lượt dùng và hiệu quả chuyển đổi."
        actions={canManage ? <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>Tạo mã</button> : null}
      />
      <div className="admin-toolbar">
        <form className="toolbar-grow" onSubmit={(event) => { event.preventDefault(); update("q", q.trim()); }} style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="Mã hoặc tên chương trình…" aria-label="Tìm mã" value={q} onChange={(event) => setQ(event.target.value)} />
          <button type="submit" className="btn btn-outline btn-sm">Tìm</button>
        </form>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-hint">Trạng thái</span>
          <select className="input" value={get("status")} onChange={(event) => update("status", event.target.value)}>
            <option value="">Tất cả</option><option value="active">Đang áp dụng</option><option value="inactive">Đã ngừng</option>
          </select>
        </label>
      </div>
      {state.loading && !state.data ? <Skeleton height={280} /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : (
        <>
          <DataTable
            rows={state.data || []}
            rowKey={(row) => row.id}
            columns={[
              { key: "code", header: "Mã / chương trình", cell: (row) => <><span className="row-title">{row.code}</span><span className="row-sub">{row.name}</span></> },
              { key: "value", header: "Giảm", cell: (row) => row.type === "percent" ? `${row.value}%${row.maxDiscount ? ` (tối đa ${formatVnd(row.maxDiscount)})` : ""}` : formatVnd(row.value) },
              { key: "min", header: "Đơn tối thiểu", align: "right", cell: (row) => formatVnd(row.minOrder) },
              { key: "usage", header: "Lượt dùng", cell: (row) => <>{row.usedCount}/{row.usageLimit || "∞"}<span className="row-sub">Tối đa {row.perUserLimit}/khách</span></> },
              { key: "valid", header: "Hiệu lực", cell: (row) => <>{formatDate(row.validFrom)} – {formatDate(row.validTo)}</> },
              { key: "effect", header: "Hiệu quả", cell: (row) => <>{formatVnd(row.revenue)}<span className="row-sub">Đã giảm {formatVnd(row.totalDiscount)}</span></> },
              { key: "status", header: "Trạng thái", cell: (row) => <StatusChip status={row.active ? "active" : "hidden"} kind={row.active ? "user" : "tour"} size="sm" /> },
              {
                key: "actions", header: "", align: "right",
                cell: (row) => canManage ? (
                  <span className="table-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(row)}>Sửa</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(row)}>{row.active ? "Tạm ngưng" : "Kích hoạt"}</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => deactivate(row)}>Ngừng</button>
                  </span>
                ) : "—",
              },
            ]}
            empty={<EmptyState icon="sparkles" title="Chưa có mã giảm giá" description="Tạo mã để chạy ưu đãi." action={canManage ? <button type="button" className="btn btn-primary" onClick={startCreate}>Tạo mã</button> : undefined} />}
          />
          <AdminPagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Sửa mã ${editing.code}` : "Tạo mã giảm giá"}
        size="lg"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Đang lưu…" : "Lưu mã"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="form-grid-2">
          <Field label="Mã" htmlFor="coupon-code" required hint="3–32 ký tự A-Z, 0-9, _ hoặc -."><input id="coupon-code" className="input" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></Field>
          <Field label="Tên chương trình" htmlFor="coupon-name" required><input id="coupon-name" className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Loại giảm" htmlFor="coupon-type"><select id="coupon-type" className="input" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="percent">Phần trăm</option><option value="fixed">Số tiền cố định</option></select></Field>
          <Field label="Giá trị" htmlFor="coupon-value" required><input id="coupon-value" type="number" min={1} className="input" value={form.value} onChange={(event) => setForm({ ...form, value: Number(event.target.value) })} /></Field>
          <Field label="Giảm tối đa" htmlFor="coupon-max" hint="0 = không giới hạn"><input id="coupon-max" type="number" min={0} step="1000" className="input" value={form.maxDiscount} onChange={(event) => setForm({ ...form, maxDiscount: Number(event.target.value) })} /></Field>
          <Field label="Đơn tối thiểu" htmlFor="coupon-min"><input id="coupon-min" type="number" min={0} step="1000" className="input" value={form.minOrder} onChange={(event) => setForm({ ...form, minOrder: Number(event.target.value) })} /></Field>
          <Field label="Có hiệu lực từ" htmlFor="coupon-from"><input id="coupon-from" type="date" className="input" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} /></Field>
          <Field label="Đến ngày" htmlFor="coupon-to"><input id="coupon-to" type="date" className="input" value={form.validTo} onChange={(event) => setForm({ ...form, validTo: event.target.value })} /></Field>
          <Field label="Tổng lượt dùng" htmlFor="coupon-limit" hint="0 = không giới hạn"><input id="coupon-limit" type="number" min={0} className="input" value={form.usageLimit} onChange={(event) => setForm({ ...form, usageLimit: Number(event.target.value) })} /></Field>
          <Field label="Lượt/khách" htmlFor="coupon-user"><input id="coupon-user" type="number" min={1} className="input" value={form.perUserLimit} onChange={(event) => setForm({ ...form, perUserLimit: Number(event.target.value) })} /></Field>
          <Field label="Phạm vi" htmlFor="coupon-applies"><select id="coupon-applies" className="input" value={form.appliesType} onChange={(event) => setForm({ ...form, appliesType: event.target.value })}><option value="all">Tất cả tour</option><option value="tour">Chọn tour</option></select></Field>
          <label className="checkbox-row" style={{ marginTop: 24 }}><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> <span>Kích hoạt ngay</span></label>
          {form.appliesType === "tour" ? (
            <Field label="Tour áp dụng" htmlFor="coupon-tours" className="field--full" hint="Giữ Ctrl/Cmd để chọn nhiều.">
              <select id="coupon-tours" multiple size={5} className="input" value={form.tourIds.map(String)} onChange={(event) => setForm({ ...form, tourIds: Array.from(event.target.selectedOptions).map((option) => Number(option.value)) })}>
                {(tours.data || []).map((tour) => <option key={tour.id} value={tour.id}>{tour.name}</option>)}
              </select>
            </Field>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
