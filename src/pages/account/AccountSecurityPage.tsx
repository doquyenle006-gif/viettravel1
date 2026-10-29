import { useState } from "react";
import { api, isApiError } from "../../lib/api";
import { useSession, useSessionStore } from "../../lib/session";
import { useApi } from "../../lib/hooks";
import { formatDateTime } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { ChangePasswordForm } from "../../app/guards";
import { Field, Notice, PageLoader } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { Icon } from "../../components/Icon";

interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  current: boolean;
}

interface MfaStatus { enabled: boolean }
interface MfaSetup { secret: string; otpauthUrl: string; codePreview?: string }

export default function AccountSecurityPage() {
  const { user } = useSession();
  const setUser = useSessionStore((state) => state.setUser);
  const toast = useToast();
  const sessions = useApi<SessionRow[]>("/me/sessions", [user?.id]);
  const mfa = useApi<MfaStatus>("/me/mfa", [user?.id]);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  if (!user) return null;

  const startSetup = async () => {
    setMfaBusy(true);
    setMfaError(null);
    try {
      const data = await api<MfaSetup>("/me/mfa/setup", { method: "POST" });
      setSetup(data);
    } catch (error) {
      setMfaError(isApiError(error) ? error.message : "Chưa khởi tạo được 2FA.");
    } finally {
      setMfaBusy(false);
    }
  };

  const enableMfa = async () => {
    setMfaBusy(true);
    setMfaError(null);
    try {
      await api("/me/mfa/enable", { method: "POST", body: { code } });
      toast.success("Đã bật xác thực hai yếu tố.");
      setSetup(null);
      setCode("");
      mfa.reload();
      const me = await api<{ user: typeof user }>("/me");
      setUser(me.user);
    } catch (error) {
      setMfaError(isApiError(error) ? error.message : "Mã xác thực chưa đúng.");
    } finally {
      setMfaBusy(false);
    }
  };

  const disableMfa = async () => {
    setMfaBusy(true);
    setMfaError(null);
    try {
      await api("/me/mfa/disable", { method: "POST", body: { password, code } });
      toast.success("Đã tắt xác thực hai yếu tố.");
      setPassword("");
      setCode("");
      mfa.reload();
      const me = await api<{ user: typeof user }>("/me");
      setUser(me.user);
    } catch (error) {
      setMfaError(isApiError(error) ? error.message : "Chưa tắt được 2FA.");
    } finally {
      setMfaBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await api(`/me/sessions/${id}`, { method: "DELETE" });
      toast.success("Đã thu hồi phiên đăng nhập.");
      sessions.reload();
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "Chưa thu hồi được phiên.");
    }
  };

  const revokeAll = async () => {
    try {
      await api("/me/sessions/revoke-all", { method: "POST" });
      toast.success("Đã đăng xuất khỏi mọi thiết bị.");
      window.location.href = "/login";
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "Chưa thu hồi được các phiên.");
    }
  };

  const requestDeletion = async () => {
    try {
      const data = await api<{ message: string }>("/me/delete-request", { method: "POST" });
      setDeleteMessage(data.message);
    } catch (error) {
      setDeleteMessage(isApiError(error) ? error.message : "Chưa gửi được yêu cầu.");
    }
  };

  return (
    <>
      <Seo title="Bảo mật" noindex />
      <h1>Bảo mật</h1>
      <div className="detail-card profile-form">
        <h2>Đổi mật khẩu</h2>
        <ChangePasswordForm />
      </div>

      <div className="detail-card">
        <h2>Xác thực hai yếu tố (2FA)</h2>
        {mfaError ? <Notice tone="danger">{mfaError}</Notice> : null}
        {mfa.loading ? <PageLoader label="Đang tải trạng thái 2FA" /> : mfa.data?.enabled ? (
          <>
            <Notice tone="success" title="2FA đang bật">Mỗi lần đăng nhập bạn cần nhập mã từ ứng dụng xác thực.</Notice>
            <Field label="Mật khẩu hiện tại" htmlFor="mfa-password" required><input id="mfa-password" type="password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></Field>
            <Field label="Mã 2FA" htmlFor="mfa-code" required><input id="mfa-code" className="input" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" /></Field>
            <button type="button" className="btn btn-danger" onClick={disableMfa} disabled={mfaBusy}>{mfaBusy ? "Đang xử lý…" : "Tắt 2FA"}</button>
          </>
        ) : setup ? (
          <>
            <p className="muted" style={{ fontSize: 13 }}>Nhập mã bí mật bên dưới vào ứng dụng xác thực (Google Authenticator, Authy…) rồi nhập mã 6 chữ số để xác nhận.</p>
            <div className="review-summary" style={{ marginBottom: 12 }}>
              <div><span>Mã bí mật</span><strong style={{ fontFamily: "monospace" }}>{setup.secret}</strong></div>
              <div><span>Ứng dụng</span><a className="text-link" href={setup.otpauthUrl}>Mở liên kết otpauth</a></div>
            </div>
            <Field label="Mã xác thực 6 chữ số" htmlFor="mfa-enable-code" required><input id="mfa-enable-code" className="input" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" /></Field>
            <button type="button" className="btn btn-primary" onClick={enableMfa} disabled={mfaBusy || code.length !== 6}>{mfaBusy ? "Đang bật…" : "Bật 2FA"}</button>
          </>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Bật 2FA để bảo vệ tài khoản, đặc biệt với vai trò quản trị/kế toán.</p>
            <button type="button" className="btn btn-outline" onClick={startSetup} disabled={mfaBusy}>{mfaBusy ? "Đang khởi tạo…" : "Bật xác thực hai yếu tố"}</button>
          </>
        )}
      </div>

      <div className="detail-card">
        <h2>Phiên đăng nhập</h2>
        {sessions.loading ? <PageLoader label="Đang tải phiên" /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Thiết bị/IP</th><th>Bắt đầu</th><th>Hoạt động cuối</th><th>Hết hạn</th><th>Hành động</th></tr></thead>
              <tbody>
                {sessions.data?.map((session) => (
                  <tr key={session.id}>
                    <td><span className="row-title">{session.ip || "Không rõ IP"}</span><span className="row-sub">{session.userAgent?.slice(0, 70) || "Không rõ thiết bị"}</span></td>
                    <td>{formatDateTime(session.createdAt)}</td>
                    <td>{formatDateTime(session.lastActivityAt)}</td>
                    <td>{formatDateTime(session.expiresAt)}</td>
                    <td>{session.current ? <span className="chip chip--ok chip--sm">Phiên hiện tại</span> : <button type="button" className="btn btn-ghost btn-sm" onClick={() => revoke(session.id)}>Thu hồi</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className="btn btn-outline" style={{ marginTop: 12 }} onClick={revokeAll}><Icon name="logout" size={15} /> Đăng xuất khỏi mọi thiết bị</button>
      </div>

      <div className="detail-card">
        <h2>Xóa tài khoản</h2>
        <p className="muted" style={{ fontSize: 13 }}>Yêu cầu xóa sẽ ẩn danh hóa dữ liệu cá nhân sau khi hoàn tất nghĩa vụ lưu trữ tài chính. Không thể xóa khi còn đơn đang hiệu lực.</p>
        {deleteMessage ? <Notice tone="info">{deleteMessage}</Notice> : null}
        {!deleteOpen ? (
          <button type="button" className="btn btn-ghost" style={{ color: "var(--danger)" }} onClick={() => setDeleteOpen(true)}>Yêu cầu xóa tài khoản</button>
        ) : (
          <div className="inline-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-danger" onClick={requestDeletion}>Xác nhận gửi yêu cầu</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDeleteOpen(false)}>Hủy</button>
          </div>
        )}
      </div>
    </>
  );
}
