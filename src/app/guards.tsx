import { useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useSession, useSessionStore } from "../lib/session";
import { useApi } from "../lib/hooks";
import { useToast } from "../components/Toast";
import { EmptyState, Field, PageLoader } from "../components/ui";
import { Icon } from "../components/Icon";

export function safeFrom(location: { pathname: string; search?: string; hash?: string }): string {
  const from = `${location.pathname}${location.search || ""}${location.hash || ""}`;
  if (!from.startsWith("/") || from.startsWith("//")) return "/account/bookings";
  return from;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const location = useLocation();
  if (status === "loading") return <PageLoader label="Đang kiểm tra phiên đăng nhập" />;
  if (status === "anonymous") {
    return <Navigate to="/login" state={{ from: safeFrom(location) }} replace />;
  }
  return <>{children}</>;
}

export function RequireVerified({ children }: { children: ReactNode }) {
  const { user } = useSession();
  if (user && !user.emailVerified) return <VerifyWall email={user.email} />;
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status === "loading") return <PageLoader label="Đang tải" />;
  if (status === "authenticated") return <Navigate to="/account/bookings" replace />;
  return <>{children}</>;
}

export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { user, status } = useSession();
  if (status === "loading") return <PageLoader label="Đang kiểm tra quyền" />;
  if (!user || !user.permissions.includes(permission)) return <Navigate to="/403" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, status } = useSession();
  const location = useLocation();
  if (status === "loading") return <PageLoader label="Đang kiểm tra quyền" />;
  if (!user) return <Navigate to="/login" state={{ from: safeFrom(location) }} replace />;
  if (!user.permissions.includes("admin:access")) return <Navigate to="/403" replace />;
  return <>{children}</>;
}

export function VerifyWall({ email }: { email: string }) {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const config = useApi<{ devOutbox: boolean }>("/config/public");
  const resend = async () => {
    setSending(true);
    try {
      await api("/auth/resend-verification", { method: "POST", body: { email } });
      setSent(true);
      toast.success("Đã gửi lại liên kết xác minh.", "Kiểm tra email");
    } catch {
      toast.error("Chưa gửi được liên kết. Vui lòng thử lại sau.");
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="container narrow-page">
      <div className="panel verify-wall">
        <span className="empty-icon"><Icon name="mail" size={28} /></span>
        <h1>Xác minh email để tiếp tục</h1>
        <p>
          Chúng tôi đã gửi liên kết xác minh tới <strong>{email}</strong>. Mở email và bấm liên kết để xác minh tài khoản trước khi đặt tour.
        </p>
        <div className="inline-actions">
          <button type="button" className="btn btn-primary" onClick={resend} disabled={sending}>
            {sending ? "Đang gửi…" : sent ? "Gửi lại lần nữa" : "Gửi lại liên kết"}
          </button>
          <a className="btn btn-ghost" href="/account/profile">Về hồ sơ</a>
        </div>
        <EmptyState
          icon="info"
          title="Môi trường demo"
          description={config.data?.devOutbox
            ? "Email không được gửi ra ngoài. Mở hộp thư mô phỏng để lấy liên kết xác minh."
            : "Vui lòng kiểm tra hộp thư đến và thư rác."}
          action={config.data?.devOutbox ? <a className="btn btn-outline btn-sm" href="/dev-outbox">Mở hộp thư mô phỏng</a> : undefined}
        />
      </div>
    </div>
  );
}

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/me/password", { method: "POST", body: { currentPassword, newPassword } });
      toast.success("Mật khẩu đã được cập nhật.");
      setCurrentPassword("");
      setNewPassword("");
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không đổi được mật khẩu.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="stack-form" noValidate>
      {error ? <div className="notice notice--danger" role="alert">{error}</div> : null}
      <Field label="Mật khẩu hiện tại" htmlFor="current-password" required>
        <input
          id="current-password"
          type="password"
          className="input"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
      </Field>
      <Field label="Mật khẩu mới" htmlFor="new-password" required hint="Tối thiểu 8 ký tự, nên có chữ hoa, số và ký tự đặc biệt.">
        <input
          id="new-password"
          type="password"
          className="input"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          minLength={8}
        />
      </Field>
      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Đang lưu…" : "Đổi mật khẩu"}</button>
    </form>
  );
}

export function useLogout() {
  const logout = useSessionStore((state) => state.logout);
  return async () => {
    await logout();
  };
}
