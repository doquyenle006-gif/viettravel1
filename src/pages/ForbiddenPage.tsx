import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";
import { Icon } from "../components/Icon";

export default function ForbiddenPage() {
  return (
    <>
      <Seo title="Không đủ quyền" noindex />
      <div className="container narrow-page">
        <div className="empty-state">
          <span className="empty-icon" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}><Icon name="lock" size={28} /></span>
          <h1 style={{ color: "var(--green)", fontSize: 32 }}>Bạn không có quyền truy cập</h1>
          <p>Tài khoản hiện tại không được phép mở trang này. Nếu bạn cho rằng đây là nhầm lẫn, hãy liên hệ quản trị viên.</p>
          <div className="inline-actions" style={{ justifyContent: "center", marginTop: 20 }}>
            <Link to="/" className="btn btn-primary">Về trang chủ</Link>
            <Link to="/account/bookings" className="btn btn-outline">Đơn của tôi</Link>
          </div>
        </div>
      </div>
    </>
  );
}
