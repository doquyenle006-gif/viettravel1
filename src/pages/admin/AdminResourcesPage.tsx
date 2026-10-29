import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { Seo } from "../../components/Seo";
import { DataTable, EmptyState, ErrorState, Field, Notice, Skeleton } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { AdminHeader } from "./shared";

interface ResourceRow {
  id: number;
  fullName?: string;
  phone?: string;
  languages?: string;
  region?: string;
  status?: string;
  note?: string | null;
  name?: string;
  plate?: string;
  seats?: number;
  driverName?: string;
  driverPhone?: string;
  category?: string;
  contactName?: string;
  email?: string;
  address?: string;
}

interface FieldDef { key: string; label: string; type?: string; required?: boolean }
const CONFIG: Record<string, { title: string; noun: string; fields: FieldDef[]; columns: string[] }> = {
  guides: {
    title: "Hướng dẫn viên", noun: "hướng dẫn viên",
    fields: [
      { key: "fullName", label: "Họ tên", required: true },
      { key: "phone", label: "Điện thoại", required: true },
      { key: "languages", label: "Ngôn ngữ" },
      { key: "region", label: "Khu vực" },
      { key: "status", label: "Trạng thái" },
      { key: "note", label: "Ghi chú" },
    ],
    columns: ["fullName", "phone", "languages", "region", "status"],
  },
  vehicles: {
    title: "Xe", noun: "xe",
    fields: [
      { key: "name", label: "Tên xe", required: true },
      { key: "plate", label: "Biển số", required: true },
      { key: "seats", label: "Số chỗ", type: "number", required: true },
      { key: "driverName", label: "Tài xế" },
      { key: "driverPhone", label: "SĐT tài xế" },
      { key: "status", label: "Trạng thái" },
      { key: "note", label: "Ghi chú" },
    ],
    columns: ["name", "plate", "seats", "driverName", "driverPhone", "status"],
  },
  suppliers: {
    title: "Nhà cung cấp", noun: "nhà cung cấp",
    fields: [
      { key: "name", label: "Tên nhà cung cấp", required: true },
      { key: "category", label: "Loại" },
      { key: "contactName", label: "Người liên hệ" },
      { key: "phone", label: "Điện thoại" },
      { key: "email", label: "Email" },
      { key: "address", label: "Địa chỉ" },
      { key: "status", label: "Trạng thái" },
      { key: "note", label: "Ghi chú" },
    ],
    columns: ["name", "category", "contactName", "phone", "email", "status"],
  },
};

export default function AdminResourcesPage() {
  const { type = "guides" } = useParams();
  const config = CONFIG[type];
  const toast = useToast();
  const state = useApi<ResourceRow[]>(config ? `/admin/resources/${type}` : null, [type]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!config) return <Notice tone="danger">Loại danh mục không hợp lệ.</Notice>;

  const startCreate = () => {
    setEditing(null);
    setForm(Object.fromEntries(config.fields.map((field) => [field.key, field.key === "status" ? "active" : field.key === "category" ? "hotel" : ""])));
    setOpen(true);
    setError(null);
  };
  const startEdit = (row: ResourceRow) => {
    setEditing(row);
    setForm(Object.fromEntries(config.fields.map((field) => [field.key, String(row[field.key as keyof ResourceRow] ?? "")])));
    setOpen(true);
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, key === "seats" ? Number(value) : value]));
      if (editing) await api(`/admin/resources/${type}/${editing.id}`, { method: "PUT", body });
      else await api(`/admin/resources/${type}`, { method: "POST", body });
      setOpen(false);
      toast.success(`Đã lưu ${config.noun}.`);
      state.reload();
    } catch (err) { setError(isApiError(err) ? err.message : "Chưa lưu được."); }
    finally { setBusy(false); }
  };

  const remove = async (row: ResourceRow) => {
    try {
      await api(`/admin/resources/${type}/${row.id}`, { method: "DELETE" });
      toast.success("Đã xóa.");
      state.reload();
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa xóa được."); }
  };

  return (
    <>
      <Seo title={config.title} noindex />
      <AdminHeader
        title="Nguồn lực điều hành"
        description="Danh bạ HDV, xe và nhà cung cấp; kiểm tra trùng lịch khi phân công."
        actions={<button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>Thêm {config.noun}</button>}
      />
      <div className="tabs" style={{ marginBottom: 14 }}>
        {Object.entries(CONFIG).map(([key, item]) => (
          <Link key={key} to={`/admin/resources/${key}`} className={`tab ${key === type ? "tab--active" : ""}`} style={{ borderBottom: "2px solid transparent" }}>{item.title}</Link>
        ))}
      </div>
      {state.loading && !state.data ? <Skeleton height={280} /> : state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : (
        <DataTable
          rows={state.data || []}
          rowKey={(row) => row.id}
          columns={[
            ...config.columns.map((key) => ({
              key, header: key === "fullName" ? "Họ tên" : key === "plate" ? "Biển số" : key === "seats" ? "Số chỗ" : key === "driverName" ? "Tài xế" : key === "driverPhone" ? "SĐT tài xế" : key === "contactName" ? "Liên hệ" : key === "email" ? "Email" : key === "phone" ? "Điện thoại" : key === "languages" ? "Ngôn ngữ" : key === "region" ? "Khu vực" : key === "category" ? "Loại" : key === "status" ? "Trạng thái" : key,
              cell: (row: ResourceRow) => String(row[key as keyof ResourceRow] ?? "—"),
            })),
            { key: "actions", header: "", align: "right" as const, cell: (row: ResourceRow) => <span className="table-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(row)}>Sửa</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(row)}>Xóa</button></span> },
          ]}
          empty={<EmptyState icon="users" title={`Chưa có ${config.noun}`} description="Thêm bản ghi để phân công chuyến." />}
        />
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Sửa ${config.noun}` : `Thêm ${config.noun}`}
        size="md"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Hủy</button><button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Đang lưu…" : "Lưu"}</button></>}
      >
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="form-grid-2">
          {config.fields.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={`resource-${field.key}`} required={field.required} className={field.key === "note" || field.key === "address" ? "field--full" : ""}>
              {field.key === "status" ? (
                <select id={`resource-${field.key}`} className="input" value={form[field.key] || "active"} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}>
                  <option value="active">Hoạt động</option><option value="inactive">Tạm ngưng</option>
                </select>
              ) : field.key === "category" ? (
                <select id={`resource-${field.key}`} className="input" value={form[field.key] || "hotel"} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}>
                  <option value="hotel">Khách sạn</option><option value="restaurant">Nhà hàng</option><option value="transport">Vận chuyển</option><option value="other">Khác</option>
                </select>
              ) : (
                <input id={`resource-${field.key}`} type={field.type || "text"} className="input" value={form[field.key] || ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} />
              )}
            </Field>
          ))}
        </div>
      </Modal>
    </>
  );
}
