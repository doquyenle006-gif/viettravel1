import { NavLink, Outlet, Link } from "react-router-dom";
import { useSession } from "../../lib/session";
import { Icon } from "../../components/Icon";
import { formatDate } from "../../lib/format";

export default function AccountLayout() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <div className="container account-layout">
      <aside className="account-nav" aria-label="Tài khoản">
        <NavLink to="/account/bookings" className={({ isActive }) => isActive ? "active" : ""}><Icon name="ticket" size={17} /> Đơn của tôi</NavLink>
        <NavLink to="/account/profile" className={({ isActive }) => isActive ? "active" : ""}><Icon name="user" size={17} /> Hồ sơ</NavLink>
        <NavLink to="/account/security" className={({ isActive }) => isActive ? "active" : ""}><Icon name="shield" size={17} /> Bảo mật</NavLink>
        <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, padding: "12px 10px 4px", fontSize: 12 }}>
          <strong>{user.fullName}</strong>
          <div className="muted" style={{ marginTop: 2 }}>{user.email}</div>
          {!user.emailVerified ? <Link to="/verify-email" className="text-link" style={{ display: "inline-block", marginTop: 6 }}>Xác minh email</Link> : null}
          <div className="field-hint" style={{ marginTop: 6 }}>Thành viên từ {formatDate(user.createdAt)}</div>
        </div>
      </aside>
      <div className="account-main">
        <Outlet />
      </div>
    </div>
  );
}
