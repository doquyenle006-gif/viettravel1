import { useState } from "react";
import { Link } from "react-router-dom";
import { api, isApiError } from "../lib/api";
import { usePublicConfig } from "../lib/config";
import { Seo } from "../components/Seo";
import { Icon } from "../components/Icon";
import { Field, Notice } from "../components/ui";
import { useToast } from "../components/Toast";
import { validEmail, validPhone, normalizePhoneInput } from "../lib/validate";
import { formatVnd } from "../lib/format";

interface InquiryResult {
  code: string;
  receivedAt: string;
  responseWithinHours: number;
}

export default function ContactPage() {
  const config = usePublicConfig();
  const toast = useToast();
  const [form, setForm] = useState({
    fullName: "", email: "", phone: "", type: "custom_tour", subject: "",
    message: "", interestedTour: "", people: "", expectedDate: "", budget: "", website: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<InquiryResult | null>(null);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (form.fullName.trim().length < 2) nextErrors.fullName = "Nhập họ tên.";
    if (!validEmail(form.email)) nextErrors.email = "Email chưa đúng định dạng.";
    if (form.phone && !validPhone(normalizePhoneInput(form.phone))) nextErrors.phone = "Số điện thoại chưa đúng.";
    if (form.message.trim().length < 10) nextErrors.message = "Nội dung tối thiểu 10 ký tự.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSending(true);
    try {
      const data = await api<InquiryResult>("/inquiries", {
        method: "POST",
        body: {
          ...form,
          phone: form.phone ? normalizePhoneInput(form.phone) : "",
          people: form.people ? Number(form.people) : null,
          budget: form.budget ? Number(form.budget) : null,
          expectedDate: form.expectedDate || null,
          subject: form.subject || "Yêu cầu tư vấn tour",
        },
      });
      setResult(data);
      toast.success(`Đã nhận yêu cầu ${data.code}.`);
    } catch (error) {
      if (isApiError(error)) {
        setErrors(error.fields || {});
        toast.error(error.message);
      } else {
        toast.error("Chưa gửi được yêu cầu. Vui lòng thử lại.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Seo title="Liên hệ & tour theo yêu cầu" description="Gửi yêu cầu tư vấn, thiết kế tour riêng hoặc khiếu nại tới VietTrails." />
      <div className="container contact-layout">
        <aside className="contact-info">
          <p className="eyebrow" style={{ color: "#f0c79f" }}>VietTrails</p>
          <h1>Chúng tôi lắng nghe</h1>
          <p>Đội tư vấn sẽ phản hồi trong giờ làm việc. Với yêu cầu đoàn riêng, hãy cho chúng tôi biết số người, thời gian và ngân sách dự kiến.</p>
          <ul>
            <li><Icon name="phone" size={17} /><span><strong>Hotline 24/7</strong><br />{config.hotline}</span></li>
            <li><Icon name="mail" size={17} /><span><strong>Email hỗ trợ</strong><br />{config.supportEmail}</span></li>
            <li><Icon name="map-pin" size={17} /><span><strong>Văn phòng</strong><br />18 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội</span></li>
            <li><Icon name="clock" size={17} /><span><strong>Giờ làm việc</strong><br />Thứ Hai – Thứ Bảy, 08:00 – 18:00</span></li>
          </ul>
          <div style={{ marginTop: 26, padding: 14, background: "rgba(255,255,255,.08)", borderRadius: 10, fontSize: 12.5 }}>
            <Icon name="shield" size={14} /> Thông tin của bạn chỉ được dùng để phản hồi yêu cầu và không chia sẻ cho bên thứ ba.
          </div>
        </aside>

        <div className="panel">
          {result ? (
            <div style={{ textAlign: "center", padding: "30px 10px" }}>
              <span className="empty-icon" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}><Icon name="check-circle" size={28} /></span>
              <h1 style={{ fontSize: 26, color: "var(--green)" }}>Đã nhận yêu cầu của bạn</h1>
              <p className="muted" style={{ marginTop: 8 }}>Mã tham chiếu <strong>{result.code}</strong>. Chúng tôi sẽ phản hồi trong khoảng {result.responseWithinHours} giờ làm việc.</p>
              <div className="inline-actions" style={{ justifyContent: "center", marginTop: 20 }}>
                <Link to="/tours" className="btn btn-primary">Khám phá tour</Link>
                <button type="button" className="btn btn-ghost" onClick={() => { setResult(null); setForm({ ...form, message: "", subject: "" }); }}>Gửi yêu cầu khác</button>
              </div>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 26, color: "var(--green)" }}>Gửi yêu cầu</h1>
              <p className="muted" style={{ marginBottom: 18 }}>Điền thông tin bên dưới, chúng tôi sẽ liên hệ lại.</p>
              <form onSubmit={submit} noValidate>
                {Object.keys(errors).length ? <Notice tone="danger" title="Vui lòng kiểm tra biểu mẫu">Một số trường chưa hợp lệ.</Notice> : null}
                <div className="form-grid">
                  <Field label="Họ và tên" htmlFor="inquiry-name" required error={errors.fullName}>
                    <input id="inquiry-name" className="input" value={form.fullName} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" />
                  </Field>
                  <Field label="Email" htmlFor="inquiry-email" required error={errors.email}>
                    <input id="inquiry-email" type="email" className="input" value={form.email} onChange={(event) => update("email", event.target.value)} autoComplete="email" />
                  </Field>
                  <Field label="Số điện thoại" htmlFor="inquiry-phone" error={errors.phone}>
                    <input id="inquiry-phone" type="tel" className="input" value={form.phone} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" />
                  </Field>
                  <Field label="Loại yêu cầu" htmlFor="inquiry-type" required>
                    <select id="inquiry-type" className="input" value={form.type} onChange={(event) => update("type", event.target.value)}>
                      <option value="custom_tour">Tour theo yêu cầu</option>
                      <option value="support">Tư vấn / hỗ trợ</option>
                      <option value="complaint">Khiếu nại</option>
                    </select>
                  </Field>
                  <Field label="Tiêu đề" htmlFor="inquiry-subject" className="field--full">
                    <input id="inquiry-subject" className="input" value={form.subject} onChange={(event) => update("subject", event.target.value)} placeholder="VD: Tour riêng cho 20 người tại Đà Nẵng" />
                  </Field>
                  {form.type === "custom_tour" ? (
                    <>
                      <Field label="Số người dự kiến" htmlFor="inquiry-people">
                        <input id="inquiry-people" type="number" min={1} max={200} className="input" value={form.people} onChange={(event) => update("people", event.target.value)} />
                      </Field>
                      <Field label="Ngày dự kiến" htmlFor="inquiry-date">
                        <input id="inquiry-date" type="date" className="input" value={form.expectedDate} onChange={(event) => update("expectedDate", event.target.value)} />
                      </Field>
                      <Field label="Ngân sách / người (VND)" htmlFor="inquiry-budget" hint="Chỉ là mức tham khảo, chưa phải báo giá.">
                        <input id="inquiry-budget" type="number" min={0} step={100000} className="input" value={form.budget} onChange={(event) => update("budget", event.target.value)} />
                      </Field>
                      <Field label="Tour quan tâm" htmlFor="inquiry-tour">
                        <input id="inquiry-tour" className="input" value={form.interestedTour} onChange={(event) => update("interestedTour", event.target.value)} placeholder="VD: Đà Nẵng — Hội An" />
                      </Field>
                    </>
                  ) : null}
                  <Field label="Nội dung" htmlFor="inquiry-message" required className="field--full" error={errors.message} hint={`${form.message.length}/3000 ký tự`}>
                    <textarea id="inquiry-message" className="input textarea" rows={6} maxLength={3000} value={form.message} onChange={(event) => update("message", event.target.value)} />
                  </Field>
                  <div className="sr-only" aria-hidden="true">
                    <label htmlFor="inquiry-website">Website</label>
                    <input id="inquiry-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} />
                  </div>
                </div>
                <div className="inline-actions" style={{ marginTop: 10 }}>
                  <button type="submit" className="btn btn-primary" disabled={sending}>{sending ? "Đang gửi…" : "Gửi yêu cầu"}</button>
                  <span className="trust-note"><Icon name="shield" size={13} /> Chống spam bằng kiểm tra phía máy chủ</span>
                </div>
                {form.budget ? <p className="field-hint" style={{ marginTop: 8 }}>Ngân sách tham khảo: {formatVnd(Number(form.budget))} / người.</p> : null}
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
