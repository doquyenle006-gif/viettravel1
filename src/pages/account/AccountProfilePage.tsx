import { useState } from "react";
import { Link } from "react-router-dom";
import { api, isApiError } from "../../lib/api";
import { useSessionStore } from "../../lib/session";
import { normalizePhoneInput, validPhone } from "../../lib/validate";
import { Seo } from "../../components/Seo";
import { Field, Notice } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { Icon } from "../../components/Icon";
import type { SessionUser } from "../../types";

export default function AccountProfilePage() {
  const user = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const toast = useToast();
  const [form, setForm] = useState({ fullName: user?.fullName || "", phone: user?.phone || "", marketingConsent: user?.marketingConsent || false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ password: "", newEmail: "" });
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);

  if (!user) return null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (form.fullName.trim().length < 2) nextErrors.fullName = "Họ tên tối thiểu 2 ký tự.";
    if (form.phone && !validPhone(normalizePhoneInput(form.phone))) nextErrors.phone = "Số điện thoại chưa đúng.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      const data = await api<{ user: SessionUser }>("/me", {
        method: "PATCH",
        body: { fullName: form.fullName.trim(), phone: form.phone ? normalizePhoneInput(form.phone) : "", marketingConsent: form.marketingConsent },
      });
      setUser(data.user);
      toast.success("Hồ sơ đã được cập nhật.");
    } catch (error) {
      if (isApiError(error)) {
        setErrors(error.fields || {});
        toast.error(error.message);
      } else toast.error("Chưa lưu được hồ sơ.");
    } finally {
      setSaving(false);
    }
  };

  const changeEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailSaving(true);
    setEmailError(null);
    setEmailMessage(null);
    try {
      const data = await api<{ message: string }>("/me/email", { method: "POST", body: emailForm });
      setEmailMessage(data.message);
      setEmailForm({ password: "", newEmail: "" });
    } catch (error) {
      setEmailError(isApiError(error) ? error.message : "Chưa gửi được yêu cầu đổi email.");
    } finally {
      setEmailSaving(false);
    }
  };

  return (
    <>
      <Seo title="Hồ sơ" noindex />
      <h1>Hồ sơ</h1>
      {!user.emailVerified ? (
        <Notice tone="warning" title="Email chưa xác minh">
          Bạn cần xác minh email trước khi đặt tour. <Link to="/verify-email" className="text-link">Gửi lại liên kết xác minh</Link>
        </Notice>
      ) : null}
      <div className="detail-card profile-form">
        <h2>Thông tin cơ bản</h2>
        <form onSubmit={save} noValidate>
          <Field label="Họ và tên" htmlFor="profile-name" required error={errors.fullName}>
            <input id="profile-name" className="input" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="profile-email" hint="Email dùng để đăng nhập. Đổi email cần xác minh lại.">
            <input id="profile-email" className="input" value={user.email} readOnly disabled />
          </Field>
          <Field label="Số điện thoại" htmlFor="profile-phone" error={errors.phone}>
            <input id="profile-phone" type="tel" className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" />
          </Field>
          <label className="checkbox-row" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={form.marketingConsent} onChange={(event) => setForm({ ...form, marketingConsent: event.target.checked })} />
            <span>Nhận thông tin ưu đãi và tin tức từ VietTrails.</span>
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</button>
        </form>
      </div>
      <div className="detail-card">
        <h2>Đổi email {emailOpen ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEmailOpen(false)}>Đóng</button> : <button type="button" className="btn btn-outline btn-sm" onClick={() => setEmailOpen(true)}>Bắt đầu</button>}</h2>
        {!emailOpen ? <p className="muted" style={{ fontSize: 13 }}>Email hiện tại: <strong>{user.email}</strong>. Đổi email sẽ gửi liên kết xác minh tới địa chỉ mới.</p> : (
          <form onSubmit={changeEmail} noValidate>
            {emailMessage ? <Notice tone="success">{emailMessage}</Notice> : null}
            {emailError ? <Notice tone="danger">{emailError}</Notice> : null}
            <Field label="Email mới" htmlFor="new-email" required>
              <input id="new-email" type="email" className="input" value={emailForm.newEmail} onChange={(event) => setEmailForm({ ...emailForm, newEmail: event.target.value })} autoComplete="email" />
            </Field>
            <Field label="Mật khẩu hiện tại" htmlFor="email-password" required>
              <input id="email-password" type="password" className="input" value={emailForm.password} onChange={(event) => setEmailForm({ ...emailForm, password: event.target.value })} autoComplete="current-password" />
            </Field>
            <button type="submit" className="btn btn-primary" disabled={emailSaving}>{emailSaving ? "Đang gửi…" : "Gửi liên kết xác minh"}</button>
          </form>
        )}
      </div>
      <div className="detail-card">
        <h2>Bảo mật</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Quản lý mật khẩu, phiên đăng nhập và xác thực hai yếu tố.</p>
        <Link to="/account/security" className="btn btn-outline"><Icon name="shield" size={15} /> Mở cài đặt bảo mật</Link>
      </div>
    </>
  );
}
