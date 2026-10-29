import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useSessionStore } from "../../lib/session";
import { usePublicConfig } from "../../lib/config";
import { isApiError } from "../../lib/api";
import { Seo } from "../../components/Seo";
import { CoverArt } from "../../components/CoverArt";
import { Field, Notice } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toast";

const DEMO = [
  { role: "Khách hàng", email: "customer@viettrails.vn" },
  { role: "Quản trị", email: "admin@viettrails.vn" },
  { role: "Bán hàng", email: "sales@viettrails.vn" },
  { role: "Kế toán", email: "accountant@viettrails.vn" },
  { role: "Điều hành", email: "operator@viettrails.vn" },
];

export default function LoginPage() {
  const login = useSessionStore((state) => state.login);
  const config = usePublicConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fromState = (location.state as { from?: string } | null)?.from;
  const from = fromState && fromState.startsWith("/") && !fromState.startsWith("//") ? fromState : "/account/bookings";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setFormError(null);
    setErrors({});
    try {
      await login(email.trim(), password, mfaRequired ? totp : undefined);
      toast.success("Đăng nhập thành công.");
      navigate(from, { replace: true });
    } catch (error) {
      if (isApiError(error)) {
        if (error.extra?.mfaRequired) setMfaRequired(true);
        setFormError(error.message);
        if (error.fields) setErrors(error.fields);
      } else {
        setFormError("Không kết nối được máy chủ. Vui lòng thử lại.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Seo title="Đăng nhập" noindex />
      <div className="auth-page">
        <div className="auth-visual">
          <CoverArt seed="halong" alt="" />
          <div className="auth-visual-body">
            <p className="eyebrow" style={{ color: "#f0c79f" }}>Chào mừng trở lại</p>
            <h1>Hành trình đang chờ bạn</h1>
            <p>Đăng nhập để quản lý đơn, thanh toán phần còn lại và nhận voucher điện tử.</p>
          </div>
        </div>
        <div className="auth-form-wrap">
          <div className="auth-card">
            {params.get("reset") === "1" ? <Notice tone="success" title="Mật khẩu đã được đặt lại">Bạn có thể đăng nhập bằng mật khẩu mới.</Notice> : null}
            <h1>Đăng nhập</h1>
            <p>Dùng email và mật khẩu tài khoản VietTrails.</p>
            {formError ? <Notice tone="danger">{formError}</Notice> : null}
            <form onSubmit={submit} noValidate>
              <Field label="Email" htmlFor="login-email" required error={errors.email}>
                <input
                  id="login-email"
                  type="email"
                  className="input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="Mật khẩu" htmlFor="login-password" required error={errors.password}>
                <div className="input-group" style={{ position: "relative" }}>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className="input"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button type="button" className="icon-btn" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} style={{ position: "absolute", right: 4, top: 2 }}>
                    <Icon name={showPassword ? "eye-off" : "eye"} size={17} />
                  </button>
                </div>
              </Field>
              {mfaRequired ? (
                <Field label="Mã xác thực hai yếu tố" htmlFor="login-totp" required error={errors.totp} hint="Nhập mã 6 chữ số từ ứng dụng xác thực.">
                  <input id="login-totp" className="input" inputMode="numeric" maxLength={6} value={totp} onChange={(event) => setTotp(event.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" />
                </Field>
              ) : null}
              <div className="auth-links">
                <Link to="/forgot-password">Quên mật khẩu?</Link>
                <span>Chưa có tài khoản? <Link to="/register" state={{ from }}>Đăng ký</Link></span>
              </div>
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading} style={{ marginTop: 18 }}>
                {loading ? "Đang đăng nhập…" : "Đăng nhập"}
              </button>
            </form>
            {config.devOutbox ? (
              <div className="panel panel--flat" style={{ marginTop: 22, padding: 16, background: "var(--surface-2)" }}>
                <strong style={{ fontSize: 12.5 }}>Tài khoản demo</strong>
                <p className="field-hint">Mật khẩu chung: <code>Demo@1234</code>. Dùng để thử các vai trò.</p>
                <div className="tag-list" style={{ marginTop: 8 }}>
                  {DEMO.map((account) => (
                    <button key={account.email} type="button" className="tag" onClick={() => { setEmail(account.email); setPassword("Demo@1234"); setMfaRequired(false); }}>
                      {account.role}: {account.email}
                    </button>
                  ))}
                </div>
                <Link to="/dev-outbox" className="text-link" style={{ fontSize: 12, display: "inline-block", marginTop: 8 }}>Mở hộp thư mô phỏng →</Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
