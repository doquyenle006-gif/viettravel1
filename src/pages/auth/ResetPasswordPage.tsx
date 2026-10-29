import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, isApiError } from "../../lib/api";
import { passwordStrength } from "../../lib/validate";
import { Seo } from "../../components/Seo";
import { Field, Notice } from "../../components/ui";
import { useToast } from "../../components/Toast";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const invite = params.get("invite") === "1";
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const strength = passwordStrength(password);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Mật khẩu tối thiểu 8 ký tự.");
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu nhập lại chưa khớp.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password } });
      toast.success(invite ? "Tài khoản đã được kích hoạt." : "Mật khẩu đã được đặt lại.");
      navigate("/login?reset=1", { replace: true });
    } catch (err) {
      setError(isApiError(err) ? err.message : "Liên kết không còn hiệu lực.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Seo title={invite ? "Kích hoạt tài khoản" : "Đặt lại mật khẩu"} noindex />
      <div className="container narrow-page" style={{ maxWidth: 520 }}>
        <div className="panel">
          <h1 style={{ color: "var(--green)", fontSize: 28 }}>{invite ? "Kích hoạt tài khoản" : "Đặt lại mật khẩu"}</h1>
          {!token ? (
            <Notice tone="danger" title="Thiếu liên kết">Liên kết đặt lại không hợp lệ. Vui lòng yêu cầu lại từ trang quên mật khẩu.</Notice>
          ) : (
            <form onSubmit={submit} noValidate>
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <Field label="Mật khẩu mới" htmlFor="reset-password" required hint="Tối thiểu 8 ký tự, không dùng mật khẩu phổ biến.">
                <input id="reset-password" type="password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={8} />
                <span className="strength-meter" aria-hidden="true">{[0, 1, 2, 3].map((index) => <span key={index} className={password && index < strength.score ? "on" : ""} />)}</span>
                {password ? <span className="strength-label">Độ mạnh: {strength.label}</span> : null}
              </Field>
              <Field label="Nhập lại mật khẩu" htmlFor="reset-confirm" required>
                <input id="reset-confirm" type="password" className="input" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required />
              </Field>
              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>{loading ? "Đang lưu…" : invite ? "Kích hoạt tài khoản" : "Đặt lại mật khẩu"}</button>
            </form>
          )}
          <p style={{ marginTop: 18, fontSize: 13 }}><Link to="/login">← Về đăng nhập</Link></p>
        </div>
      </div>
    </>
  );
}
