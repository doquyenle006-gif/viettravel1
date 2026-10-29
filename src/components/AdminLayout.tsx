import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession, useSessionStore } from "../lib/session";
import { useApi } from "../lib/hooks";
import { api } from "../lib/api";
import { useToast } from "./Toast";
import { Icon, type IconName } from "./Icon";
import { roleText } from "../lib/roles";

interface NavItem { to: string; label: string; icon: IconName; perm: string; end?: boolean }
interface NavGroup { title: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    title: "Vận hành",
    items: [
      { to: "/admin", label: "Tổng quan", icon: "grid", perm: "admin:access", end: true },
      { to: "/admin/bookings", label: "Đơn hàng", icon: "ticket", perm: "booking:read" },
      { to: "/admin/departures", label: "Lịch khởi hành", icon: "calendar", perm: "departure:read" },
      { to: "/admin/tours", label: "Sản phẩm tour", icon: "compass", perm: "tour:read" },
      { to: "/admin/tickets", label: "Hỗ trợ & ticket", icon: "message", perm: "ticket:handle" },
      { to: "/admin/resources/guides", label: "HDV · xe · NCC", icon: "users", perm: "operations:manage" },
    ],
  },
  {
    title: "Tài chính",
    items: [
      { to: "/admin/payments", label: "Thanh toán", icon: "credit-card", perm: "payment:read" },
      { to: "/admin/refunds", label: "Hoàn tiền", icon: "refresh", perm: "refund:read" },
      { to: "/admin/invoices", label: "Hóa đơn", icon: "file-text", perm: "invoice:read" },
      { to: "/admin/customers", label: "Khách hàng", icon: "user", perm: "customer:read" },
    ],
  },
  {
    title: "Tăng trưởng",
    items: [
      { to: "/admin/coupons", label: "Mã giảm giá", icon: "sparkles", perm: "coupon:read" },
      { to: "/admin/reviews", label: "Đánh giá", icon: "star", perm: "review:read" },
      { to: "/admin/content", label: "Nội dung", icon: "edit", perm: "content:manage" },
      { to: "/admin/reports", label: "Báo cáo", icon: "trending", perm: "report:view" },
    ],
  },
  {
    title: "Hệ thống",
    items: [
      { to: "/admin/users", label: "Người dùng & vai trò", icon: "shield", perm: "user:manage" },
      { to: "/admin/settings", label: "Cài đặt", icon: "settings", perm: "settings:manage" },
      { to: "/admin/audit-logs", label: "Nhật ký & cảnh báo", icon: "clipboard", perm: "audit:view" },
    ],
  },
];

export function AdminLayout() {
  const { user } = useSession();
  const logout = useSessionStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const alerts = useApi<{ id: number; status: string }[]>(user?.permissions.includes("audit:view") ? "/admin/alerts" : null, [user?.id]);
  const openAlerts = alerts.data?.filter((item) => item.status === "open").length || 0;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  if (!user) return null;
  const can = (permission: string) => user.permissions.includes(permission);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    navigate(`/admin/bookings?q=${encodeURIComponent(query.trim())}`);
    setQuery("");
  };

  const doLogout = async () => {
    await logout();
    toast.success("Đã đăng xuất khỏi khu quản trị.");
    navigate("/login");
  };

  return (
    <div className={`admin-shell ${sidebarOpen ? "admin-shell--open" : ""}`}>
      <button type="button" className="admin-backdrop" aria-label="Đóng menu" onClick={() => setSidebarOpen(false)} />
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <Link to="/admin" aria-label="VietTrails quản trị">
            <span className="brand-mark"><Icon name="compass" size={22} /></span>
            <span><strong>VietTrails</strong><small>Trung tâm vận hành</small></span>
          </Link>
          <button type="button" className="icon-btn admin-close" aria-label="Đóng menu" onClick={() => setSidebarOpen(false)}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <nav className="admin-nav" aria-label="Quản trị">
          {GROUPS.map((group) => {
            const items = group.items.filter((item) => can(item.perm));
            if (!items.length) return null;
            return (
              <div key={group.title} className="admin-nav-group">
                <p>{group.title}</p>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `admin-nav-link ${isActive ? "admin-nav-link--active" : ""}`}
                  >
                    <Icon name={item.icon} size={17} />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="admin-sidebar-footer">
          <Link to="/" className="admin-nav-link"><Icon name="home" size={17} /> Về trang khách</Link>
          <div className="admin-user">
            <span className="avatar avatar--sm">{user.fullName.slice(0, 1)}</span>
            <span><strong>{user.email.split("@")[0]}</strong><small>{roleText(user.roles)}</small></span>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="icon-btn admin-menu-btn" aria-label="Mở menu quản trị" onClick={() => setSidebarOpen(true)}>
            <Icon name="menu" size={20} />
          </button>
          <form className="admin-search" onSubmit={submitSearch} role="search">
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Tìm mã đơn, khách, tour…"
              aria-label="Tìm nhanh"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>
          <div className="admin-topbar-actions">
            {can("audit:view") ? (
              <Link to="/admin/audit-logs?tab=alerts" className="icon-btn icon-btn--badge" aria-label={`Cảnh báo, ${openAlerts} đang mở`}>
                <Icon name="alert" size={19} />
                {openAlerts ? <span className="badge-dot">{openAlerts > 9 ? "9+" : openAlerts}</span> : null}
              </Link>
            ) : null}
            <div className="admin-role">
              <span className="avatar avatar--sm">{user.fullName.slice(0, 1)}</span>
              <span className="hide-mobile"><strong>{user.fullName}</strong><small>{roleText(user.roles)}</small></span>
            </div>
            <button type="button" className="icon-btn" aria-label="Đăng xuất" onClick={doLogout}>
              <Icon name="logout" size={19} />
            </button>
          </div>
        </header>
        <main id="main-content" className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export async function markAlertRead(): Promise<void> {
  await api("/admin/alerts").catch(() => null);
}
