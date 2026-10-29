import { Link } from "react-router-dom";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { formatDateTime, formatVnd } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { Icon } from "../../components/Icon";
import { DataTable, ErrorState, Skeleton, StatusChip } from "../../components/ui";
import type { AdminBookingRow, AdminDepartureRow } from "../../types";
import { AdminHeader } from "./shared";

interface DashboardCard {
  key: string;
  label: string;
  value: number;
  link?: string;
  tone?: string;
  money?: boolean;
  suffix?: string;
}

interface DashboardData {
  cards: DashboardCard[];
  upcoming: AdminDepartureRow[];
  goNogo: AdminDepartureRow[];
  recentBookings: AdminBookingRow[];
  topTours: { id: number; name: string; slug: string; bookings: number; revenue: number }[];
  alerts: { id: number; type: string; severity: string; message: string; status: string; createdAt: string }[];
  revenue: { collected: number; refunded: number; net: number; recognized: number };
  debtTotal: number;
  generatedAt: string;
  today: string;
  role: string;
}

const CARD_PERMISSIONS: Record<string, string[]> = {
  pendingBookings: ["booking:read"], expiringHolds: ["booking:read"], changeRequests: ["booking:read"],
  ticketsOverdue: ["ticket:handle"], paymentsToConfirm: ["payment:read"], flaggedPayments: ["payment:read"],
  refundsPending: ["refund:read"], debtTotal: ["report:financial"], collected: ["report:view"],
  recognized: ["report:view"], occupancy: ["report:view"], cancelRate: ["report:view"],
};

export default function AdminDashboardPage() {
  const state = useApi<DashboardData>("/admin/dashboard");
  const { user } = useSession();
  const data = state.data;
  const can = (permission: string) => user?.permissions.includes(permission) ?? false;
  const isGuide = user?.roles.includes("guide") ?? false;
  if (!data && state.loading) {
    return <div className="admin-grid">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} height={140} />)}</div>;
  }
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!data) return null;
  const cards = data.cards.filter((card) => (CARD_PERMISSIONS[card.key] || ["admin:access"]).some(can));
  const maxRevenue = Math.max(...data.topTours.map((tour) => tour.revenue), 1);
  return (
    <>
      <Seo title="Tổng quan quản trị" noindex />
      <AdminHeader
        title="Tổng quan vận hành"
        description={`Hôm nay ${data.today.split("-").reverse().join("/")} · Dữ liệu cập nhật ${formatDateTime(data.generatedAt)}`}
        actions={<Link to="/admin/reports" className="btn btn-outline btn-sm"><Icon name="trending" size={15} /> Báo cáo</Link>}
      />

      <div className="stat-grid">
        {cards.map((card) => (
          <Link key={card.key} to={card.link || "/admin"} className={`stat-card stat-card--${card.tone || "info"}`}>
            <span>{card.label}</span>
            <strong>{card.money ? formatVnd(card.value) : `${card.value}${card.suffix || ""}`}</strong>
            <small>{card.money ? "VND" : card.suffix ? "Tỷ lệ" : "Bản ghi"}</small>
          </Link>
        ))}
      </div>

      {data.alerts.length ? (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h2>Cảnh báo cần chú ý <Link to="/admin/audit-logs?tab=alerts" className="text-link" style={{ fontSize: 12 }}>Xem tất cả</Link></h2>
          {data.alerts.map((alert) => (
            <div key={alert.id} className={`admin-alert ${alert.severity === "danger" ? "admin-alert--danger" : ""}`}>
              <Icon name="alert" size={15} />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="admin-grid">
        {can("departure:read") ? (
          <section className="admin-card admin-card--span2">
            <h2>Chuyến trong 14 ngày tới <Link to="/admin/departures" className="text-link" style={{ fontSize: 12 }}>Quản lý</Link></h2>
            <DataTable
              rows={data.upcoming}
              rowKey={(row) => row.id}
              columns={[
                { key: "date", header: "Ngày", cell: (row) => <Link to={`/admin/departures/${row.id}`} className="row-title">{row.departureDate.split("-").reverse().join("/")}</Link> },
                { key: "tour", header: "Tour", cell: (row) => <>{row.tourName}<span className="row-sub">{row.meetingTime} · {row.status}</span></> },
                { key: "fill", header: "Lấp đầy", cell: (row) => <>{row.seatsTaken}/{row.capacity}<span className="row-sub">{row.fillRate}%</span></> },
                { key: "outstanding", header: "Còn thiếu", align: "right", cell: (row) => isGuide ? "—" : formatVnd(row.outstanding) },
                { key: "guarantee", header: "Chốt", cell: (row) => row.isGuaranteed ? <span className="chip chip--ok chip--sm">Đảm bảo</span> : <span className="chip chip--pending chip--sm">Chưa chốt</span> },
              ]}
              empty={<p className="muted">Không có chuyến trong 14 ngày tới.</p>}
            />
          </section>
        ) : null}

        {can("booking:read") ? (
          <section className="admin-card">
            <h2>Đơn mới nhất <Link to="/admin/bookings" className="text-link" style={{ fontSize: 12 }}>Tất cả</Link></h2>
            <div className="booking-list">
              {data.recentBookings.map((booking) => (
                <Link key={booking.code} to={`/admin/bookings/${booking.code}`} className="detail-card" style={{ padding: 12, marginBottom: 8 }}>
                  <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                    <strong style={{ fontSize: 13 }}>{booking.customerName}</strong>
                    <StatusChip status={booking.status} kind="booking" audience="admin" size="sm" />
                  </div>
                  <span className="row-sub">{booking.code} · {booking.tour.name} · {isGuide ? "—" : formatVnd(booking.total)}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {can("departure:read") && data.goNogo.length ? (
          <section className="admin-card">
            <h2>Chốt đoàn sắp tới</h2>
            {data.goNogo.map((row) => (
              <Link key={row.id} to={`/admin/departures/${row.id}`} className="admin-alert" style={{ textDecoration: "none" }}>
                <Icon name="clock" size={15} />
                <span>{row.departureDate.split("-").reverse().join("/")} — {row.tourName} · {row.seatsTaken}/{row.minPaxToRun} khách tối thiểu</span>
              </Link>
            ))}
          </section>
        ) : null}

        {can("report:view") ? (
          <section className="admin-card admin-card--span2">
            <h2>Top tour theo doanh thu</h2>
            <div className="chart-bars">
              {data.topTours.map((tour) => (
                <div key={tour.id} className="chart-row">
                  <span>{tour.name}</span>
                  <span className="chart-track"><span className="chart-fill" style={{ width: `${Math.max(4, (tour.revenue / maxRevenue) * 100)}%` }} /></span>
                  <strong>{formatVnd(tour.revenue)}</strong>
                </div>
              ))}
            </div>
            <div className="summary-list" style={{ marginTop: 16 }}>
              <div><span>Doanh thu đã thu (tháng)</span><strong>{formatVnd(data.revenue.net)}</strong></div>
              <div><span>Doanh thu ghi nhận (tháng)</span><strong>{formatVnd(data.revenue.recognized)}</strong></div>
              {can("report:financial") ? <div><span>Công nợ phải thu</span><strong>{formatVnd(data.debtTotal)}</strong></div> : null}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
