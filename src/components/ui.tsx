import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ApiError } from "../lib/api";
import type { NetworkError } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { Icon, type IconName } from "./Icon";
import { Modal } from "./Modal";

/* ---------------- Status ---------------- */

type StatusKind = "booking" | "payment" | "txn" | "departure" | "tour" | "refund" | "change" | "review" | "ticket" | "user";
type Tone = "pending" | "ok" | "info" | "danger" | "muted";

const STATUS_TABLE: Record<StatusKind, Record<string, { label: string; adminLabel?: string; tone: Tone; icon: IconName }>> = {
  booking: {
    pending: { label: "Đang giữ chỗ", adminLabel: "Chờ xử lý", tone: "pending", icon: "clock" },
    confirmed: { label: "Đã xác nhận", tone: "ok", icon: "check" },
    completed: { label: "Đã hoàn thành", tone: "info", icon: "flag" },
    cancelled: { label: "Đã hủy", tone: "danger", icon: "x" },
    expired: { label: "Hết hạn giữ chỗ", adminLabel: "Hết hạn", tone: "muted", icon: "clock" },
  },
  payment: {
    unpaid: { label: "Chưa thanh toán", tone: "pending", icon: "clock" },
    deposit_paid: { label: "Đã đặt cọc", tone: "info", icon: "wallet" },
    paid: { label: "Đã thanh toán đủ", tone: "ok", icon: "check-circle" },
    partially_refunded: { label: "Đã hoàn một phần", tone: "info", icon: "refresh" },
    refunded: { label: "Đã hoàn tiền", tone: "muted", icon: "refresh" },
  },
  txn: {
    initiated: { label: "Đã khởi tạo", tone: "muted", icon: "clock" },
    pending: { label: "Đang chờ", tone: "pending", icon: "clock" },
    succeeded: { label: "Thành công", tone: "ok", icon: "check-circle" },
    failed: { label: "Thất bại", tone: "danger", icon: "x-circle" },
    cancelled: { label: "Đã hủy", tone: "muted", icon: "x" },
    expired: { label: "Hết hạn", tone: "muted", icon: "clock" },
  },
  departure: {
    draft: { label: "Nháp", tone: "muted", icon: "edit" },
    open: { label: "Đang mở bán", tone: "ok", icon: "check-circle" },
    full: { label: "Hết chỗ", tone: "info", icon: "users" },
    closed: { label: "Đã đóng bán", tone: "muted", icon: "lock" },
    departed: { label: "Đã khởi hành", tone: "info", icon: "compass" },
    completed: { label: "Đã kết thúc", tone: "info", icon: "flag" },
    cancelled: { label: "Đã hủy", tone: "danger", icon: "x" },
  },
  tour: {
    draft: { label: "Nháp", tone: "muted", icon: "edit" },
    published: { label: "Đang hiển thị", tone: "ok", icon: "check-circle" },
    hidden: { label: "Đang ẩn", tone: "muted", icon: "eye-off" },
    archived: { label: "Lưu trữ", tone: "muted", icon: "lock" },
  },
  refund: {
    requested: { label: "Chờ duyệt", tone: "pending", icon: "clock" },
    approved: { label: "Đã duyệt", tone: "info", icon: "check" },
    processing: { label: "Đang hoàn", tone: "info", icon: "refresh" },
    completed: { label: "Đã hoàn", tone: "ok", icon: "check-circle" },
    rejected: { label: "Từ chối", tone: "danger", icon: "x-circle" },
    failed: { label: "Hoàn thất bại", tone: "danger", icon: "alert" },
  },
  change: {
    submitted: { label: "Chờ duyệt", tone: "pending", icon: "clock" },
    approved: { label: "Đã duyệt", tone: "ok", icon: "check" },
    rejected: { label: "Từ chối", tone: "danger", icon: "x-circle" },
    completed: { label: "Hoàn tất", tone: "info", icon: "check-circle" },
    withdrawn: { label: "Đã rút", tone: "muted", icon: "x" },
  },
  review: {
    pending: { label: "Chờ duyệt", tone: "pending", icon: "clock" },
    approved: { label: "Đã duyệt", tone: "ok", icon: "check" },
    rejected: { label: "Từ chối", tone: "danger", icon: "x-circle" },
    hidden: { label: "Đã ẩn", tone: "muted", icon: "eye-off" },
  },
  ticket: {
    open: { label: "Mới", tone: "pending", icon: "message" },
    in_progress: { label: "Đang xử lý", tone: "info", icon: "clock" },
    waiting_customer: { label: "Chờ khách", tone: "info", icon: "user" },
    resolved: { label: "Đã giải quyết", tone: "ok", icon: "check-circle" },
    closed: { label: "Đã đóng", tone: "muted", icon: "lock" },
  },
  user: {
    active: { label: "Đang hoạt động", tone: "ok", icon: "check-circle" },
    locked: { label: "Đã khóa", tone: "danger", icon: "lock" },
  },
};

export function StatusChip({ status, kind = "booking", audience = "customer", size = "md" }: {
  status: string;
  kind?: StatusKind;
  audience?: "customer" | "admin";
  size?: "sm" | "md";
}) {
  const entry = STATUS_TABLE[kind][status] || { label: status, tone: "muted" as Tone, icon: "info" as IconName };
  const label = audience === "admin" && entry.adminLabel ? entry.adminLabel : entry.label;
  return (
    <span className={`chip chip--${entry.tone} chip--${size}`}>
      <Icon name={entry.icon} size={size === "sm" ? 13 : 14} />
      <span>{label}</span>
    </span>
  );
}

/* ---------------- Feedback ---------------- */

export function Notice({ tone = "info", title, children, action }: {
  tone?: "info" | "success" | "warning" | "danger" | "neutral";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const icons: Record<string, IconName> = { info: "info", success: "check-circle", warning: "alert", danger: "alert", neutral: "info" };
  return (
    <div className={`notice notice--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={icons[tone]} size={19} />
      <div className="notice-content">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action ? <div className="notice-action">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "", width, height }: { className?: string; width?: string | number; height?: string | number }) {
  return <span className={`skeleton ${className}`.trim()} style={{ width, height, display: "block" }} aria-hidden="true" />;
}

export function EmptyState({ icon = "compass", title, description, action }: {
  icon?: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact = false }: {
  error: ApiError | NetworkError | Error;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const code = "code" in error ? String((error as ApiError).code) : "NETWORK_ERROR";
  const requestId = "requestId" in error ? (error as ApiError).requestId : undefined;
  return (
    <div className={`error-state ${compact ? "error-state--compact" : ""}`} role="alert">
      <span className="error-icon"><Icon name="wifi-off" size={24} /></span>
      <div>
        <h3>Không tải được nội dung</h3>
        <p>{error.message}</p>
        <p className="error-meta">Mã lỗi: {code}{requestId ? ` · Mã yêu cầu: ${requestId.slice(0, 8)}` : ""}</p>
      </div>
      {onRetry ? <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>Thử lại</button> : null}
    </div>
  );
}

export function PageLoader({ label = "Đang tải" }: { label?: string }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

/* ---------------- Buttons & form ---------------- */

export function LoadingButton({ loading, children, className = "btn btn-primary", type = "button", ...props }: {
  loading?: boolean;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  [key: string]: unknown;
}) {
  const { disabled, ...rest } = props as { disabled?: boolean; [key: string]: unknown };
  return (
    <button type={type} className={className} disabled={loading || disabled} {...rest}>
      {loading ? <span className="spinner spinner--sm" aria-hidden="true" /> : null}
      <span>{loading ? "Đang xử lý…" : children}</span>
    </button>
  );
}

export function Field({ label, htmlFor, required, error, hint, children, className = "" }: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${error ? "field--error" : ""} ${className}`.trim()}>
      <label htmlFor={htmlFor}>
        {label} {required ? <span className="field-required">(bắt buộc)</span> : null}
      </label>
      {children}
      {error ? <p className="field-error" id={htmlFor ? `${htmlFor}-error` : undefined}>{error}</p> : null}
      {hint && !error ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function CopyButton({ value, label = "Sao chép" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copy} aria-live="polite">
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Đã sao chép" : label}
    </button>
  );
}

/* ---------------- Tabs, pagination, table ---------------- */

export interface TabItem {
  id: string;
  label: string;
  badge?: number | string;
}

export function Tabs({ items, value, onChange, className = "" }: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={`tabs ${className}`.trim()} role="tablist" aria-label="Chọn mục">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={`tab ${value === item.id ? "tab--active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.badge !== undefined && item.badge !== 0 ? <span className="tab-badge">{item.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, onChange, total, perPage }: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  total?: number;
  perPage?: number;
}) {
  if (totalPages <= 1) {
    return total !== undefined ? (
      <p className="pagination-summary">Hiển thị {total} kết quả</p>
    ) : null;
  }
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = Math.max(1, end - 4); i <= end; i++) pages.push(i);
  const from = perPage ? (page - 1) * perPage + 1 : undefined;
  const to = perPage && total ? Math.min(page * perPage, total) : undefined;
  return (
    <nav className="pagination" aria-label="Phân trang">
      {total !== undefined && perPage ? (
        <span className="pagination-summary">
          {from !== undefined && to !== undefined ? `Hiển thị ${from}–${to} trong ${total}` : `Tổng ${total}`}
        </span>
      ) : null}
      <div className="pagination-controls">
        <button type="button" className="page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Trang trước">
          <Icon name="chevron-left" size={16} />
        </button>
        {pages[0] > 1 ? <span className="page-ellipsis">…</span> : null}
        {pages.map((item) => (
          <button
            key={item}
            type="button"
            className={`page-btn ${item === page ? "page-btn--active" : ""}`}
            aria-current={item === page ? "page" : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ))}
        {pages[pages.length - 1] < totalPages ? <span className="page-ellipsis">…</span> : null}
        <button type="button" className="page-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Trang sau">
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
    </nav>
  );
}

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  hideOnMobile?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, onRowClick, caption }: {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: ApiError | NetworkError | null;
  onRetry?: () => void;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  caption?: string;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} compact />;
  if (loading) {
    return (
      <div className="table-loading" role="status" aria-live="polite">
        <Skeleton height={16} /><Skeleton height={16} /><Skeleton height={16} /><Skeleton height={16} />
        <span className="sr-only">Đang tải dữ liệu…</span>
      </div>
    );
  }
  if (!rows.length) return <>{empty || <EmptyState icon="grid" title="Chưa có dữ liệu" description="Dữ liệu sẽ xuất hiện khi có bản ghi phù hợp." />}</>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={{ width: column.width, textAlign: column.align || "left" }} className={column.hideOnMobile ? "hide-mobile" : ""}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "data-row--clickable" : ""}
            >
              {columns.map((column) => (
                <td key={column.key} style={{ textAlign: column.align || "left" }} className={column.hideOnMobile ? "hide-mobile" : ""}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Stars, timeline, misc ---------------- */

export function RatingStars({ value, onChange, size = 16, showValue = false }: {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  showValue?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const interactive = Boolean(onChange);
  const display = hover || value;
  const buttons = [1, 2, 3, 4, 5];
  return (
    <span className="rating" role={interactive ? "radiogroup" : undefined} aria-label={interactive ? "Chọn số sao" : `Đánh giá ${value} trên 5`}>
      {buttons.map((star) => (
        interactive ? (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} sao`}
            className={`rating-star ${star <= display ? "rating-star--on" : ""}`}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange?.(star)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" && value < 5) onChange?.(value + 1);
              if (event.key === "ArrowLeft" && value > 1) onChange?.(value - 1);
            }}
          >
            <Icon name="star" size={size} />
          </button>
        ) : (
          <span key={star} className={`rating-star ${star <= display ? "rating-star--on" : ""}`} aria-hidden="true">
            <Icon name="star" size={size} />
          </span>
        )
      ))}
      {showValue ? <span className="rating-value">{value > 0 ? value.toFixed(1) : "Chưa có"}</span> : null}
    </span>
  );
}

export interface TimelineEvent {
  id: string | number;
  title: string;
  description?: ReactNode;
  at: string;
  actor?: string;
  tone?: "ok" | "pending" | "danger" | "info" | "muted";
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <EmptyState icon="clock" title="Chưa có lịch sử" description="Các thay đổi của đơn sẽ được ghi tại đây." />;
  return (
    <ol className="timeline">
      {events.map((event) => (
        <li key={event.id} className={`timeline-item timeline-item--${event.tone || "info"}`}>
          <span className="timeline-dot" aria-hidden="true" />
          <div className="timeline-content">
            <div className="timeline-head">
              <strong>{event.title}</strong>
              <time dateTime={event.at}>{formatDateTime(event.at)}</time>
            </div>
            {event.description ? <div className="timeline-desc">{event.description}</div> : null}
            {event.actor ? <span className="timeline-actor">{event.actor}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, consequence, confirmLabel = "Xác nhận", tone = "danger", requireReason, reasonLabel = "Lý do", loading = false, children }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  consequence: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  requireReason?: boolean;
  reasonLabel?: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const disabled = loading || (requireReason && reason.trim().length < 5);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
          <button
            type="button"
            className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
            disabled={disabled}
            onClick={() => onConfirm(reason.trim())}
          >
            {loading ? "Đang xử lý…" : confirmLabel}
          </button>
        </>
      )}
    >
      <div className="confirm-consequence">{consequence}</div>
      {children}
      {requireReason ? (
        <Field label={reasonLabel} htmlFor="confirm-reason" required error={reason.length > 0 && reason.trim().length < 5 ? "Tối thiểu 5 ký tự." : undefined}>
          <textarea
            id="confirm-reason"
            className="input textarea"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ghi rõ lý do để lưu nhật ký"
          />
        </Field>
      ) : null}
    </Modal>
  );
}

export function InfoList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="info-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Đường dẫn">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 ? <Icon name="chevron-right" size={13} /> : null}
          {item.href ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
