import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Pagination, type TabItem } from "../../components/ui";
import { formatVnd } from "../../lib/format";

export function AdminHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="admin-page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </header>
  );
}

export function AdminTabs({ items, value, onChange }: { items: TabItem[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs report-tabs" role="tablist" aria-label="Chọn mục">
      {items.map((item) => (
        <button key={item.id} type="button" role="tab" aria-selected={value === item.id} className={`tab ${value === item.id ? "tab--active" : ""}`} onClick={() => onChange(item.id)}>
          {item.label}
          {item.badge ? <span className="tab-badge">{item.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function useAdminParams() {
  const [params, setParams] = useSearchParams();
  const get = (key: string, fallback = "") => params.get(key) || fallback;
  const update = (key: string, value: string, resetPage = true) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (resetPage) next.delete("page");
    setParams(next, { replace: true });
  };
  const updateMany = (values: Record<string, string>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    if (resetPage) next.delete("page");
    setParams(next, { replace: true });
  };
  const setPage = (page: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    setParams(next, { replace: true });
  };
  return { params, setParams, get, update, updateMany, setPage };
}

export function AdminPagination({ page, totalPages, total, perPage, onChange }: {
  page: number;
  totalPages: number;
  total?: number;
  perPage?: number;
  onChange: (page: number) => void;
}) {
  return <Pagination page={page} totalPages={totalPages} total={total} perPage={perPage} onChange={onChange} />;
}

export function Money({ value }: { value: number | null | undefined }) {
  return <span className="num">{formatVnd(value)}</span>;
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return <div><span>{label}</span><strong>{children}</strong></div>;
}

export const SEVERITY_LABELS: Record<string, string> = {
  low: "Thấp", medium: "Trung bình", high: "Cao", critical: "Nghiêm trọng",
};

export const CATEGORY_LABELS: Record<string, string> = {
  hotel: "Khách sạn", restaurant: "Nhà hàng", transport: "Vận chuyển", other: "Khác",
};

export const CHANNEL_LABELS: Record<string, string> = {
  web: "Website", counter: "Tại quầy", phone: "Điện thoại", agent: "Đại lý",
};
