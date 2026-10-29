import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApi } from "../lib/hooks";
import { usePublicConfig } from "../lib/config";
import { useSession, useSessionStore } from "../lib/session";
import type { Notification } from "../types";
import { Icon } from "../components/Icon";
import { useToast } from "../components/Toast";
import { formatDateTime } from "../lib/format";

const NAV = [
  { to: "/tours", label: "Tour" },
  { to: "/destinations", label: "Điểm đến" },
  { to: "/danh-muc", label: "Cảm hứng" },
  { to: "/contact", label: "Liên hệ" },
];

export function SiteLayout() {
  const { user, status } = useSession();
  const config = usePublicConfig();
  const logout = useSessionStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const notifications = useApi<Notification[]>(user ? "/me/notifications" : null, [user?.id]);
  const unread = notifications.data?.filter((item) => !item.readAt).length || 0;

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
    setBellOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (accountOpen && accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
      if (bellOpen && bellRef.current && !bellRef.current.contains(event.target as Node)) setBellOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [accountOpen, bellOpen]);

  const markRead = async () => {
    if (unread > 0) {
      try {
        await api("/me/notifications/read", { method: "POST" });
        notifications.reload();
      } catch {
        // Reading notifications is non-critical; keep the UI usable.
      }
    }
  };

  const doLogout = async () => {
    await logout();
    toast.success("Bạn đã đăng xuất.");
    navigate("/");
  };

  return (
    <div className="site">
      <a href="#main-content" className="skip-link">Bỏ qua điều hướng</a>
      <div className="topbar">
        <div className="container topbar-inner">
          <span><Icon name="phone" size={13} /> Hotline 24/7: <a href={`tel:${config.hotline.replace(/\s/g, "")}`}>{config.hotline}</a></span>
          <span className="topbar-right"><Icon name="shield" size={13} /> Thanh toán an toàn · Xác nhận tức thì</span>
        </div>
      </div>

      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="brand" aria-label="VietTrails — trang chủ">
            <span className="brand-mark"><Icon name="compass" size={24} /></span>
            <span>
              <strong>VietTrails</strong>
              <small>Hành trình Việt</small>
            </span>
          </Link>

          <nav className="main-nav" aria-label="Điều hướng chính">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? "nav-link nav-link--active" : "nav-link"}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            {status === "authenticated" && user ? (
              <>
                <div className="dropdown" ref={bellRef}>
                  <button
                    type="button"
                    className="icon-btn icon-btn--badge"
                    aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ""}`}
                    aria-expanded={bellOpen}
                    onClick={() => {
                      setBellOpen((open) => !open);
                      if (!bellOpen) void markRead();
                    }}
                  >
                    <Icon name="message" size={20} />
                    {unread > 0 ? <span className="badge-dot">{unread > 9 ? "9+" : unread}</span> : null}
                  </button>
                  {bellOpen ? (
                    <div className="dropdown-panel notification-panel">
                      <div className="dropdown-head">
                        <strong>Thông báo</strong>
                        <Link to="/account/bookings" className="text-link">Đơn của tôi</Link>
                      </div>
                      {notifications.loading ? <p className="muted pad">Đang tải…</p> : null}
                      {!notifications.loading && !notifications.data?.length ? <p className="muted pad">Chưa có thông báo.</p> : null}
                      <ul className="notification-list">
                        {notifications.data?.slice(0, 6).map((item) => (
                          <li key={item.id} className={item.readAt ? "" : "notification-unread"}>
                            {item.link ? <Link to={item.link} onClick={() => setBellOpen(false)}><strong>{item.title}</strong><span>{item.content}</span><small>{formatDateTime(item.createdAt)}</small></Link>
                              : <span><strong>{item.title}</strong><span>{item.content}</span></span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <div className="dropdown" ref={accountRef}>
                  <button
                    type="button"
                    className="account-button"
                    aria-expanded={accountOpen}
                    onClick={() => setAccountOpen((open) => !open)}
                  >
                    <span className="avatar">{user.fullName.slice(0, 1)}</span>
                    <span className="account-name">{user.fullName.split(" ").slice(-1)[0]}</span>
                    <Icon name="chevron-down" size={14} />
                  </button>
                  {accountOpen ? (
                    <div className="dropdown-panel account-menu">
                      <div className="account-menu-head">
                        <strong>{user.fullName}</strong>
                        <span>{user.email}</span>
                        {!user.emailVerified ? <span className="chip chip--pending chip--sm">Chưa xác minh email</span> : null}
                      </div>
                      <Link to="/account/bookings" onClick={() => setAccountOpen(false)}><Icon name="ticket" size={16} /> Đơn của tôi</Link>
                      <Link to="/account/profile" onClick={() => setAccountOpen(false)}><Icon name="user" size={16} /> Hồ sơ</Link>
                      <Link to="/account/security" onClick={() => setAccountOpen(false)}><Icon name="shield" size={16} /> Bảo mật</Link>
                      {user.permissions.includes("admin:access") ? (
                        <Link to="/admin" onClick={() => setAccountOpen(false)}><Icon name="grid" size={16} /> Khu quản trị</Link>
                      ) : null}
                      <button type="button" onClick={doLogout}><Icon name="logout" size={16} /> Đăng xuất</button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm hide-mobile">Đăng nhập</Link>
                <Link to="/register" className="btn btn-primary btn-sm">Đăng ký</Link>
              </>
            )}
            <button
              type="button"
              className="icon-btn mobile-menu-btn"
              aria-label="Mở menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              <Icon name={mobileOpen ? "x" : "menu"} size={22} />
            </button>
          </div>
        </div>
        {mobileOpen ? (
          <nav className="mobile-nav" aria-label="Điều hướng di động">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to}>{item.label}</NavLink>
            ))}
            {status !== "authenticated" ? (
              <>
                <Link to="/login">Đăng nhập</Link>
                <Link to="/register">Đăng ký</Link>
              </>
            ) : (
              <Link to="/account/bookings">Đơn của tôi</Link>
            )}
          </nav>
        ) : null}
      </header>

      <OfflineBanner />

      <main id="main-content" className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand">
            <Link to="/" className="brand brand--footer">
              <span className="brand-mark"><Icon name="compass" size={24} /></span>
              <span><strong>VietTrails</strong><small>Hành trình Việt, trọn vẹn từng khoảnh khắc</small></span>
            </Link>
            <p>Công ty lữ hành nội địa tổ chức tour ghép đoàn và đoàn riêng, vận hành theo lịch khởi hành cố định.</p>
            <p className="footer-contact"><Icon name="phone" size={14} /> {config.hotline} · <Icon name="mail" size={14} /> {config.supportEmail}</p>
          </div>
          <div>
            <h3>Khám phá</h3>
            <Link to="/tours">Tất cả tour</Link>
            <Link to="/destinations">Điểm đến</Link>
            <Link to="/danh-muc">Danh mục</Link>
            <Link to="/contact">Tour theo yêu cầu</Link>
          </div>
          <div>
            <h3>Hỗ trợ</h3>
            <Link to="/policies/chinh-sach-huy">Chính sách hủy</Link>
            <Link to="/policies/thanh-toan">Hướng dẫn thanh toán</Link>
            <Link to="/policies/dieu-khoan">Điều khoản sử dụng</Link>
            <Link to="/policies/quyen-rieng-tu">Quyền riêng tư</Link>
          </div>
          <div>
            <h3>Thanh toán</h3>
            <p className="footer-payments">VNPay · MoMo · ZaloPay</p>
            <p className="footer-payments">Chuyển khoản / VietQR</p>
            <p className="footer-note">Giá hiển thị đã bao gồm thuế. Giao dịch được xác nhận bởi máy chủ VietTrails.</p>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} VietTrails. Bản demo vận hành.</span>
          <span>Múi giờ Asia/Ho_Chi_Minh · Tiền tệ VND</span>
        </div>
      </footer>
    </div>
  );
}

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="offline-banner" role="alert">
      <Icon name="wifi-off" size={16} /> Bạn đang ngoại tuyến. Các thao tác gửi đi sẽ không được thực hiện.
    </div>
  );
}
