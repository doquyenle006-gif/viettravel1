const VND = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

export function formatVnd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return VND.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("vi-VN").format(value ?? 0);
}

/** Format a business date (YYYY-MM-DD) without timezone drift. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  if (isoDate.includes("T")) {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric",
    }).format(new Date(isoDate));
  }
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function formatDateLong(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const date = parseBusinessDate(isoDate);
  if (!date) return isoDate;
  const weekdays = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  return `${weekdays[date.getUTCDay()]}, ${formatDate(isoDate)}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

export function formatDuration(days: number, nights: number): string {
  return `${days}N${nights}Đ`;
}

export function parseBusinessDate(isoDate: string): Date | null {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

export function todayIso(): string {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600 * 1000);
  return vn.toISOString().slice(0, 10);
}

export function addDaysIso(isoDate: string, days: number): string {
  const date = parseBusinessDate(isoDate);
  if (!date) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function diffDays(fromIso: string, toIso: string): number {
  const a = parseBusinessDate(fromIso);
  const b = parseBusinessDate(toIso);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function monthLabel(year: number, month: number): string {
  return `Tháng ${month}/${year}`;
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return phone;
}

export function formatPax(adults: number, children: number, infants: number): string {
  const parts = [`${adults} người lớn`];
  if (children > 0) parts.push(`${children} trẻ em`);
  if (infants > 0) parts.push(`${infants} em bé`);
  return parts.join(" · ");
}

export function maskId(id: string | null | undefined): string {
  if (!id) return "—";
  if (id.length <= 4) return "••••";
  return `••••${id.slice(-4)}`;
}

export function remainingParts(ms: number): { hours: number; minutes: number; seconds: number; label: string } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return {
    hours, minutes, seconds,
    label: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
  };
}

export function downloadBlob(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openHtmlDocument(html: string, filename = "VietTrails-document.html"): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank");
  if (opened) {
    opened.opener = null;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function countdownFrom(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  return new Date(expiresAt).getTime() - Date.now();
}

export function statusTone(status: string): "pending" | "ok" | "info" | "danger" | "muted" | "warn" {
  switch (status) {
    case "pending":
    case "requested":
    case "submitted":
    case "open":
    case "initiated":
    case "unpaid":
    case "deposit_paid":
      return "pending";
    case "confirmed":
    case "succeeded":
    case "completed":
    case "approved":
    case "paid":
    case "published":
    case "checked_in":
      return "ok";
    case "in_progress":
    case "processing":
    case "partially_refunded":
    case "departed":
    case "waiting_customer":
    case "full":
      return "info";
    case "cancelled":
    case "failed":
    case "rejected":
    case "expired":
    case "locked":
    case "hidden":
    case "refunded":
    case "closed":
    case "archived":
    case "draft":
      return "danger";
    case "resolved":
      return "ok";
    default:
      return "muted";
  }
}
