import { Link } from "react-router-dom";
import { useApi } from "../lib/hooks";
import { Seo } from "../components/Seo";
import { ErrorState, Notice, PageLoader } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { Icon } from "../components/Icon";

interface Mail {
  id: number;
  to: string;
  subject: string;
  body: string;
  link: string | null;
  type: string;
  createdAt: string;
}

export default function DevOutboxPage() {
  const mails = useApi<Mail[]>("/dev/outbox");
  return (
    <>
      <Seo title="Hộp thư mô phỏng" noindex />
      <div className="container narrow-page">
        <p className="eyebrow">Môi trường demo</p>
        <h1 style={{ color: "var(--green)", marginBottom: 8 }}>Hộp thư mô phỏng</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          Đây là email do hệ thống tạo ra trong môi trường phát triển. Không có email thật nào được gửi. Các liên kết xác minh và đặt lại mật khẩu hoạt động thật với máy chủ.
        </p>
        <Notice tone="warning" title="Chỉ dùng khi phát triển">
          Trang này không tồn tại ở môi trường production. Không chia sẻ liên kết trong hộp thư này cho người khác.
        </Notice>
        {mails.loading ? <PageLoader label="Đang tải hộp thư" /> : mails.error ? <ErrorState error={mails.error} onRetry={mails.reload} /> : (
          <div className="dev-outbox">
            {!mails.data?.length ? <p className="muted">Chưa có email nào.</p> : null}
            {mails.data?.map((mail) => (
              <article key={mail.id} className="dev-mail">
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <h3>{mail.subject}</h3>
                  <span className="chip chip--muted chip--sm">{mail.type}</span>
                </div>
                <p>Tới: {mail.to} · {formatDateTime(mail.createdAt)}</p>
                <p>{mail.body}</p>
                {mail.link ? <Link to={mail.link} className="btn btn-outline btn-sm"><Icon name="arrow-right" size={14} /> Mở liên kết</Link> : null}
              </article>
            ))}
          </div>
        )}
        <p style={{ marginTop: 20 }}><Link to="/login">← Về đăng nhập</Link></p>
      </div>
    </>
  );
}
