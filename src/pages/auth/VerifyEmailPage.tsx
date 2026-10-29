import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { usePublicConfig } from "../../lib/config";
import { useSessionStore } from "../../lib/session";
import { Seo } from "../../components/Seo";
import { Field, Notice, PageLoader } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { VerifyWall } from "../../app/guards";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const pending = params.get("pending") === "1";
  const config = usePublicConfig();
  const user = useSessionStore((state) => state.user);
  const refreshMe = useSessionStore((state) => state.refreshMe);
  const [state, setState] = useState<"idle" | "checking" | "success" | "error">(token ? "checking" : "idle");
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (!token || fired.current) return;
    fired.current = true;
    api<{ verified: boolean; email: string }>("/auth/verify-email", { method: "POST", body: { token } })
      .then(async (data) => {
        setState("success");
        setMessage(data.email);
        await refreshMe();
      })
      .catch((error: Error) => {
        setState("error");
        setMessage(error.message);
      });
  }, [token, refreshMe]);

  const resend = async (event: React.FormEvent) => {
    event.preventDefault();
    setResending(true);
    setResendMessage(null);
    try {
      const data = await api<{ message: string }>("/auth/resend-verification", { method: "POST", body: { email } });
      setResendMessage(data.message);
    } catch (error) {
      setResendMessage(error instanceof Error ? error.message : "Chưa gửi được liên kết.");
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <Seo title="Xác minh email" noindex />
      <div className="container narrow-page">
        <div className="panel">
          {state === "checking" ? <PageLoader label="Đang xác minh email" /> : null}
          {state === "success" ? (
            <div className="empty-state">
              <span className="empty-icon" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}><Icon name="check-circle" size={28} /></span>
              <h1 style={{ color: "var(--green)", fontSize: 28 }}>Email đã được xác minh</h1>
              <p>Tài khoản <strong>{message}</strong> đã sẵn sàng để đặt tour.</p>
              <div className="inline-actions" style={{ justifyContent: "center", marginTop: 20 }}>
                <Link to="/tours" className="btn btn-primary">Khám phá tour</Link>
                <Link to="/account/bookings" className="btn btn-outline">Đơn của tôi</Link>
              </div>
            </div>
          ) : null}
          {state === "error" ? (
            <div className="empty-state">
              <span className="empty-icon" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}><Icon name="x-circle" size={28} /></span>
              <h1 style={{ color: "var(--green)", fontSize: 26 }}>Không xác minh được</h1>
              <p>{message}</p>
              <p className="field-hint">Liên kết chỉ dùng một lần và có hiệu lực 24 giờ. Hãy yêu cầu gửi lại bên dưới.</p>
              <form onSubmit={resend} style={{ maxWidth: 380, margin: "20px auto 0", textAlign: "left" }}>
                <Field label="Email đã đăng ký" htmlFor="verify-email" required>
                  <input id="verify-email" type="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </Field>
                <button type="submit" className="btn btn-primary btn-block" disabled={resending}>{resending ? "Đang gửi…" : "Gửi lại liên kết"}</button>
                {resendMessage ? <Notice tone="info">{resendMessage}</Notice> : null}
              </form>
            </div>
          ) : null}
          {state === "idle" ? (
            user && !user.emailVerified ? (
              <VerifyWall email={user.email} />
            ) : pending ? (
              user ? <VerifyWall email={user.email} /> : (
                <div>
                  <h1 style={{ color: "var(--green)" }}>Kiểm tra email</h1>
                  <p>Chúng tôi đã gửi liên kết xác minh. Nếu chưa nhận được, hãy nhập email để gửi lại.</p>
                  <form onSubmit={resend} style={{ marginTop: 16 }}>
                    <Field label="Email" htmlFor="verify-email" required>
                      <input id="verify-email" type="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} required />
                    </Field>
                    <button type="submit" className="btn btn-primary" disabled={resending}>{resending ? "Đang gửi…" : "Gửi lại liên kết"}</button>
                    {resendMessage ? <Notice tone="info">{resendMessage}</Notice> : null}
                  </form>
                </div>
              )
            ) : (
              <div>
                <h1 style={{ color: "var(--green)" }}>Xác minh email</h1>
                <p>Mở liên kết trong email xác minh để kích hoạt quyền đặt tour. Liên kết có hiệu lực 24 giờ.</p>
                <form onSubmit={resend} style={{ marginTop: 16 }}>
                  <Field label="Email" htmlFor="verify-email" required>
                    <input id="verify-email" type="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} required />
                  </Field>
                  <button type="submit" className="btn btn-primary" disabled={resending}>{resending ? "Đang gửi…" : "Gửi lại liên kết"}</button>
                  {resendMessage ? <Notice tone="info">{resendMessage}</Notice> : null}
                </form>
              </div>
            )
          ) : null}
          {config.devOutbox ? (
            <div className="panel panel--flat" style={{ marginTop: 20, background: "var(--surface-2)" }}>
              <strong style={{ fontSize: 12.5 }}>Môi trường demo</strong>
              <p className="field-hint">Email không được gửi ra ngoài. <Link className="text-link" to="/dev-outbox">Mở hộp thư mô phỏng</Link> để lấy liên kết.</p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
