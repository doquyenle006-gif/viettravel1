import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSessionStore } from "../../lib/session";
import { isApiError } from "../../lib/api";
import { passwordStrength, validEmail, validPhone, normalizePhoneInput } from "../../lib/validate";
import { Seo } from "../../components/Seo";
import { Field, Notice } from "../../components/ui";
import { CoverArt } from "../../components/CoverArt";
import { useToast } from "../../components/Toast";

export default function RegisterPage() {
  const register = useSessionStore((state) => state.register);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "", confirm: "", marketingConsent: false, termsAccepted: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const strength = passwordStrength(form.password);
  const from = (location.state as { from?: string } | null)?.from;

  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (form.fullName.trim().length < 2) nextErrors.fullName = "Nhập họ tên từ 2 ký tự.";
    if (!validEmail(form.email)) nextErrors.email = "Email chưa đúng định dạng.";
    if (form.phone && !validPhone(normalizePhoneInput(form.phone))) nextErrors.phone = "Số điện thoại chưa đúng.";
    if (form.password.length < 8) nextErrors.password = "Mật khẩu tối thiểu 8 ký tự.";
    if (form.password !== form.confirm) nextErrors.confirm = "Mật khẩu nhập lại chưa khớp.";
    if (!form.termsAccepted) nextErrors.termsAccepted = "Bạn cần đồng ý điều khoản.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setLoading(true);
    setFormError(null);
    try {
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone ? normalizePhoneInput(form.phone) : undefined,
        password: form.password,
        marketingConsent: form.marketingConsent,
        termsAccepted: form.termsAccepted,
      });
      toast.success("Tài khoản đã được tạo. Hãy xác minh email.");
      navigate("/verify-email?pending=1", { replace: true, state: { from } });
    } catch (error) {
      if (isApiError(error)) {
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
      <Seo title="Đăng ký" noindex />
      <div className="auth-page">
        <div className="auth-visual">
          <CoverArt seed="sapa" alt="" />
          <div className="auth-visual-body">
            <p className="eyebrow" style={{ color: "#f0c79f" }}>Bắt đầu hành trình</p>
            <h1>Một tài khoản, mọi chuyến đi</h1>
            <p>Quản lý đơn, nhận voucher, đổi ngày và đánh giá chuyến đi sau khi hoàn thành.</p>
          </div>
        </div>
        <div className="auth-form-wrap">
          <div className="auth-card">
            <h1>Đăng ký</h1>
            <p>Vai trò mặc định là khách hàng. Email cần được xác minh trước khi đặt tour.</p>
            {formError ? <Notice tone="danger">{formError}</Notice> : null}
            <form onSubmit={submit} noValidate>
              <Field label="Họ và tên" htmlFor="reg-name" required error={errors.fullName}>
                <input id="reg-name" className="input" value={form.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" required />
              </Field>
              <Field label="Email" htmlFor="reg-email" required error={errors.email}>
                <input id="reg-email" type="email" className="input" value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" required />
              </Field>
              <Field label="Số điện thoại" htmlFor="reg-phone" error={errors.phone} hint="Tùy chọn — dùng để liên hệ khi chuyến có thay đổi.">
                <input id="reg-phone" type="tel" className="input" value={form.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" />
              </Field>
              <Field label="Mật khẩu" htmlFor="reg-password" required error={errors.password} hint="Tối thiểu 8 ký tự, không dùng mật khẩu phổ biến.">
                <input id="reg-password" type="password" className="input" value={form.password} onChange={(event) => update("password", event.target.value)} autoComplete="new-password" required minLength={8} />
                <span className="strength-meter" aria-hidden="true">{[0, 1, 2, 3].map((index) => <span key={index} className={form.password && index < strength.score ? "on" : ""} />)}</span>
                {form.password ? <span className="strength-label">Độ mạnh: {strength.label}</span> : null}
              </Field>
              <Field label="Nhập lại mật khẩu" htmlFor="reg-confirm" required error={errors.confirm}>
                <input id="reg-confirm" type="password" className="input" value={form.confirm} onChange={(event) => update("confirm", event.target.value)} autoComplete="new-password" required />
              </Field>
              <label className="checkbox-row" style={{ marginBottom: 8 }}>
                <input type="checkbox" checked={form.marketingConsent} onChange={(event) => update("marketingConsent", event.target.checked)} />
                <span>Nhận thông tin ưu đãi qua email. Bạn có thể hủy đăng ký bất kỳ lúc nào.</span>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={form.termsAccepted} onChange={(event) => update("termsAccepted", event.target.checked)} />
                <span>
                  Tôi đã đọc và đồng ý <a href="/policies/dieu-khoan" target="_blank" rel="noopener noreferrer">Điều khoản sử dụng</a> và{" "}
                  <a href="/policies/chinh-sach-huy" target="_blank" rel="noopener noreferrer">Chính sách hủy</a>.
                </span>
              </label>
              {errors.termsAccepted ? <p className="field-error">{errors.termsAccepted}</p> : null}
              <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading} style={{ marginTop: 18 }}>
                {loading ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
              </button>
            </form>
            <div className="auth-links">
              <span>Đã có tài khoản? <Link to="/login" state={{ from }}>Đăng nhập</Link></span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
