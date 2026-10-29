import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { usePublicConfig } from "../../lib/config";
import { Seo } from "../../components/Seo";
import { Field, Notice } from "../../components/ui";
import { validEmail } from "../../lib/validate";

export default function ForgotPasswordPage() {
  const config = usePublicConfig();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validEmail(email)) {
      setError("Email chưa đúng định dạng.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email: email.trim().toLowerCase() } });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Seo title="Quên mật khẩu" noindex />
      <div className="container narrow-page" style={{ maxWidth: 520 }}>
        <div className="panel">
          <h1 style={{ color: "var(--green)", fontSize: 28 }}>Quên mật khẩu</h1>
          <p className="muted" style={{ marginBottom: 18 }}>Nhập email đăng ký. Nếu email tồn tại, chúng tôi sẽ gửi hướng dẫn đặt lại.</p>
          {sent ? (
            <Notice tone="info" title="Đã gửi hướng dẫn">
              Nếu email tồn tại trong hệ thống, bạn sẽ nhận được liên kết đặt lại mật khẩu. Liên kết có hiệu lực 30 phút.
            </Notice>
          ) : (
            <form onSubmit={submit} noValidate>
              <Field label="Email" htmlFor="forgot-email" required error={error || undefined}>
                <input id="forgot-email" type="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              </Field>
              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>{loading ? "Đang gửi…" : "Gửi hướng dẫn"}</button>
            </form>
          )}
          {config.devOutbox ? (
            <p className="field-hint" style={{ marginTop: 16 }}>
              Môi trường demo: <Link className="text-link" to="/dev-outbox">mở hộp thư mô phỏng</Link> để lấy liên kết đặt lại.
            </p>
          ) : null}
          <p style={{ marginTop: 18, fontSize: 13 }}><Link to="/login">← Quay lại đăng nhập</Link></p>
        </div>
      </div>
    </>
  );
}
