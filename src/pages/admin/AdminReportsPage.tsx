import { useState } from "react";
import type { AdminDepartureRow, AdminBookingRow } from "../../types";
import { api, isApiError } from "../../lib/api";
import { useApi } from "../../lib/hooks";
import { useSession } from "../../lib/session";
import { downloadBlob, formatDate, formatNumber, formatVnd, todayIso } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { DataTable, EmptyState, ErrorState, Field, Notice, Skeleton } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { AdminHeader, AdminTabs, useAdminParams } from "./shared";

interface RevenueReport {
  from: string; to: string; collected: number; refunded: number; net: number; recognized: number;
  byDay: { date: string; amount: number }[];
  byTour: { tourId: number; tourName: string; recognized: number; bookings: number }[];
  payments: { merchantRef: string; amount: number; method: string; paidAt: string }[];
  refunds: { id: number; amount: number; processedAt: string }[];
  note: string;
}
interface OccupancyReport { from: string; to: string; rows: AdminDepartureRow[]; summary: { departures: number; totalCapacity: number; totalSeats: number; fillRate: number } }
interface CancellationReport { from: string; to: string; cancelled: number; expired: number; rate: number; reasons: { reason: string; count: number }[]; rows: AdminBookingRow[] }
interface DebtReport { today: string; total: number; buckets: { key: string; label: string; amount: number; rows: AdminBookingRow[] }[]; rows: (AdminBookingRow & { dueDays: number })[] }
interface ProfitReport { from: string; to: string; rows: { departureId: number; tourName: string; departureDate: string; bookings: number; revenue: number; cost: number; profit: number; margin: number }[]; total: { revenue: number; cost: number; profit: number } }
interface CouponReport { rows: { id: number; code: string; name: string; usedCount: number; usageLimit: number | null; usages: number; discount: number; revenue: number; completed: number; conversionRate: number; active: boolean; validTo: string }[] }
interface ChannelReport { from: string; to: string; channels: { channel: string; count: number; confirmed: number; value: number }[] }

const MONTH_START = `${todayIso().slice(0, 7)}-01`;

export default function AdminReportsPage() {
  const { get, update } = useAdminParams();
  const { user } = useSession();
  const toast = useToast();
  const tab = get("tab", "revenue");
  const from = get("from", MONTH_START);
  const to = get("to", todayIso());
  const canFinancial = user?.permissions.includes("report:financial") ?? false;
  const [exporting, setExporting] = useState(false);

  const revenue = useApi<RevenueReport>(tab === "revenue" ? `/admin/reports/revenue?from=${from}&to=${to}` : null, [from, to]);
  const occupancy = useApi<OccupancyReport>(tab === "occupancy" ? `/admin/reports/occupancy?from=${from}&to=${to}` : null, [from, to]);
  const cancellations = useApi<CancellationReport>(tab === "cancellations" ? `/admin/reports/cancellations?from=${from}&to=${to}` : null, [from, to]);
  const debt = useApi<DebtReport>(tab === "debt" ? "/admin/reports/debt" : null, []);
  const profit = useApi<ProfitReport>(tab === "profit" ? `/admin/reports/profit?from=${from}&to=${to}` : null, [from, to]);
  const coupons = useApi<CouponReport>(tab === "coupons" ? "/admin/reports/coupons" : null, []);
  const channels = useApi<ChannelReport>(tab === "channels" ? `/admin/reports/channels?from=${from}&to=${to}` : null, [from, to]);

  const exportReport = async () => {
    if (!["revenue", "debt", "occupancy", "profit"].includes(tab)) return;
    setExporting(true);
    try {
      const data = await api<{ filename: string; csv: string; rowCount: number }>(`/admin/reports/export?type=${tab}&from=${from}&to=${to}`);
      downloadBlob(data.filename, data.csv, "text/csv;charset=utf-8");
      toast.success(`Đã xuất ${formatNumber(data.rowCount)} dòng.`);
    } catch (err) { toast.error(isApiError(err) ? err.message : "Chưa xuất được báo cáo."); }
    finally { setExporting(false); }
  };

  const items = [
    { id: "revenue", label: "Doanh thu" },
    { id: "occupancy", label: "Lấp đầy" },
    { id: "cancellations", label: "Hủy" },
    ...(canFinancial ? [{ id: "debt", label: "Công nợ" }, { id: "profit", label: "Lợi nhuận chuyến" }] : []),
    { id: "coupons", label: "Mã giảm giá" },
    { id: "channels", label: "Kênh bán" },
  ];

  return (
    <>
      <Seo title="Báo cáo" noindex />
      <AdminHeader
        title="Báo cáo & phân tích"
        description="Doanh thu đã thu và ghi nhận, lấp đầy, hủy, công nợ, lợi nhuận và hiệu quả khuyến mãi."
        actions={<button type="button" className="btn btn-outline btn-sm" onClick={exportReport} disabled={exporting || !["revenue", "debt", "occupancy", "profit"].includes(tab)}>{exporting ? "Đang xuất…" : "Xuất CSV"}</button>}
      />
      <AdminTabs items={items} value={tab} onChange={(value) => update("tab", value === "revenue" ? "" : value)} />
      <div className="admin-toolbar" style={{ marginTop: 14 }}>
        <Field label="Từ ngày" htmlFor="report-from"><input id="report-from" type="date" className="input" value={from} onChange={(event) => update("from", event.target.value, false)} /></Field>
        <Field label="Đến ngày" htmlFor="report-to"><input id="report-to" type="date" className="input" value={to} onChange={(event) => update("to", event.target.value, false)} /></Field>
        <span className="trust-note">Kỳ {formatDate(from)} – {formatDate(to)} · Múi giờ Asia/Ho_Chi_Minh</span>
      </div>

      {tab === "revenue" ? (
        revenue.loading ? <Skeleton height={320} /> : revenue.error ? <ErrorState error={revenue.error} onRetry={revenue.reload} /> : revenue.data ? (
          <>
            <div className="stat-grid">
              <div className="stat-card stat-card--ok"><span>Doanh thu đã thu</span><strong>{formatVnd(revenue.data.net)}</strong><small>Đã trừ hoàn tiền</small></div>
              <div className="stat-card stat-card--info"><span>Doanh thu ghi nhận</span><strong>{formatVnd(revenue.data.recognized)}</strong><small>Theo ngày chuyến kết thúc</small></div>
              <div className="stat-card"><span>Tổng thu</span><strong>{formatVnd(revenue.data.collected)}</strong><small>Trước hoàn tiền</small></div>
              <div className="stat-card stat-card--danger"><span>Đã hoàn</span><strong>{formatVnd(revenue.data.refunded)}</strong><small>Trong kỳ</small></div>
            </div>
            <Notice tone="neutral">{revenue.data.note}</Notice>
            <div className="admin-grid">
              <div className="admin-card">
                <h2>Doanh thu theo ngày</h2>
                <div className="chart-bars">
                  {revenue.data.byDay.map((row) => (
                    <div key={row.date} className="chart-row">
                      <span>{formatDate(row.date)}</span>
                      <span className="chart-track"><span className="chart-fill" style={{ width: `${Math.min(100, Math.max(2, (row.amount / Math.max(...revenue.data!.byDay.map((item) => item.amount), 1)) * 100))}%` }} /></span>
                      <strong>{formatVnd(row.amount)}</strong>
                    </div>
                  ))}
                </div>
                {!revenue.data.byDay.length ? <p className="muted">Không có giao dịch trong kỳ.</p> : null}
              </div>
              <div className="admin-card">
                <h2>Doanh thu theo tour</h2>
                <div className="chart-bars">
                  {revenue.data.byTour.map((row) => (
                    <div key={row.tourId} className="chart-row">
                      <span>{row.tourName}</span>
                      <span className="chart-track"><span className="chart-fill" style={{ width: `${Math.min(100, Math.max(2, (row.recognized / Math.max(...revenue.data!.byTour.map((item) => item.recognized), 1)) * 100))}%` }} /></span>
                      <strong>{formatVnd(row.recognized)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null
      ) : null}

      {tab === "occupancy" ? (
        occupancy.loading ? <Skeleton height={320} /> : occupancy.error ? <ErrorState error={occupancy.error} onRetry={occupancy.reload} /> : occupancy.data ? (
          <>
            <div className="stat-grid">
              <div className="stat-card"><span>Số chuyến</span><strong>{occupancy.data.summary.departures}</strong></div>
              <div className="stat-card"><span>Tổng chỗ</span><strong>{occupancy.data.summary.totalCapacity}</strong></div>
              <div className="stat-card"><span>Chỗ đã bán</span><strong>{occupancy.data.summary.totalSeats}</strong></div>
              <div className="stat-card stat-card--ok"><span>Tỷ lệ lấp đầy</span><strong>{occupancy.data.summary.fillRate}%</strong></div>
            </div>
            <DataTable
              rows={occupancy.data.rows}
              rowKey={(row) => row.id}
              columns={[
                { key: "date", header: "Ngày", cell: (row) => formatDate(row.departureDate) },
                { key: "tour", header: "Tour", cell: (row) => row.tourName },
                { key: "seats", header: "Chỗ", cell: (row) => `${row.seatsTaken}/${row.capacity}` },
                { key: "fill", header: "Lấp đầy", cell: (row) => `${row.fillRate}%` },
                { key: "collected", header: "Đã thu", align: "right", cell: (row) => formatVnd(row.collected) },
                { key: "outstanding", header: "Còn thiếu", align: "right", cell: (row) => formatVnd(row.outstanding) },
              ]}
              empty={<p className="muted">Không có chuyến trong kỳ.</p>}
            />
          </>
        ) : null
      ) : null}

      {tab === "cancellations" ? (
        cancellations.loading ? <Skeleton height={320} /> : cancellations.error ? <ErrorState error={cancellations.error} onRetry={cancellations.reload} /> : cancellations.data ? (
          <>
            <div className="stat-grid">
              <div className="stat-card stat-card--danger"><span>Đơn hủy</span><strong>{cancellations.data.cancelled}</strong></div>
              <div className="stat-card"><span>Hết hạn giữ chỗ</span><strong>{cancellations.data.expired}</strong></div>
              <div className="stat-card stat-card--pending"><span>Tỷ lệ hủy</span><strong>{cancellations.data.rate}%</strong></div>
            </div>
            <div className="admin-grid">
              <div className="admin-card">
                <h2>Lý do hủy</h2>
                {cancellations.data.reasons.map((reason) => <div key={reason.reason} className="admin-kv"><div><span>{reason.reason}</span><strong>{reason.count}</strong></div></div>)}
                {!cancellations.data.reasons.length ? <p className="muted">Không có hủy trong kỳ.</p> : null}
              </div>
              <div className="admin-card">
                <h2>Danh sách hủy</h2>
                <div className="booking-list">
                  {cancellations.data.rows.slice(0, 8).map((row) => (
                    <div key={row.code} className="admin-kv"><div><span>{row.code} · {row.customerName}</span><strong>{formatVnd(row.total)}</strong></div></div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : null
      ) : null}

      {tab === "debt" ? (
        debt.loading ? <Skeleton height={320} /> : debt.error ? <ErrorState error={debt.error} onRetry={debt.reload} /> : debt.data ? (
          <>
            <div className="debt-buckets">
              {debt.data.buckets.map((bucket) => (
                <div key={bucket.key} className={`debt-bucket ${bucket.key !== "inTerm" ? "debt-bucket--danger" : ""}`}>
                  <span>{bucket.label}</span><strong>{formatVnd(bucket.amount)}</strong><span>{bucket.rows.length} đơn</span>
                </div>
              ))}
            </div>
            <DataTable
              rows={debt.data.rows}
              rowKey={(row) => row.code}
              columns={[
                { key: "code", header: "Đơn", cell: (row) => row.code },
                { key: "customer", header: "Khách", cell: (row) => row.customerName },
                { key: "departure", header: "Khởi hành", cell: (row) => formatDate(row.departureDate) },
                { key: "total", header: "Tổng", align: "right", cell: (row) => formatVnd(row.total) },
                { key: "paid", header: "Đã thu", align: "right", cell: (row) => formatVnd(row.paid) },
                { key: "remaining", header: "Còn thiếu", align: "right", cell: (row) => formatVnd(row.remaining) },
                { key: "due", header: "Tuổi nợ", cell: (row) => row.dueDays > 0 ? <span style={{ color: "var(--danger)" }}>{row.dueDays} ngày</span> : "Trong hạn" },
              ]}
              empty={<EmptyState icon="wallet" title="Không có công nợ" description="Tất cả đơn đã thanh toán đủ." />}
            />
          </>
        ) : null
      ) : null}

      {tab === "profit" ? (
        profit.loading ? <Skeleton height={320} /> : profit.error ? <ErrorState error={profit.error} onRetry={profit.reload} /> : profit.data ? (
          <>
            <div className="stat-grid">
              <div className="stat-card"><span>Doanh thu ghi nhận</span><strong>{formatVnd(profit.data.total.revenue)}</strong></div>
              <div className="stat-card"><span>Chi phí</span><strong>{formatVnd(profit.data.total.cost)}</strong></div>
              <div className={`stat-card ${profit.data.total.profit >= 0 ? "stat-card--ok" : "stat-card--danger"}`}><span>Lợi nhuận</span><strong>{formatVnd(profit.data.total.profit)}</strong></div>
            </div>
            <DataTable
              rows={profit.data.rows}
              rowKey={(row) => row.departureId}
              columns={[
                { key: "date", header: "Ngày", cell: (row) => formatDate(row.departureDate) },
                { key: "tour", header: "Tour", cell: (row) => row.tourName },
                { key: "bookings", header: "Đơn", align: "center", cell: (row) => row.bookings },
                { key: "revenue", header: "Doanh thu", align: "right", cell: (row) => formatVnd(row.revenue) },
                { key: "cost", header: "Chi phí", align: "right", cell: (row) => formatVnd(row.cost) },
                { key: "profit", header: "Lợi nhuận", align: "right", cell: (row) => formatVnd(row.profit) },
                { key: "margin", header: "Biên", align: "right", cell: (row) => `${row.margin}%` },
              ]}
              empty={<p className="muted">Chưa có chuyến hoàn thành trong kỳ.</p>}
            />
          </>
        ) : null
      ) : null}

      {tab === "coupons" ? (
        coupons.loading ? <Skeleton height={320} /> : coupons.error ? <ErrorState error={coupons.error} onRetry={coupons.reload} /> : coupons.data ? (
          <DataTable
            rows={coupons.data.rows}
            rowKey={(row) => row.id}
            columns={[
              { key: "code", header: "Mã", cell: (row) => <><span className="row-title">{row.code}</span><span className="row-sub">{row.name}</span></> },
              { key: "usage", header: "Lượt dùng", cell: (row) => `${row.usedCount}/${row.usageLimit || "∞"}` },
              { key: "discount", header: "Tổng giảm", align: "right", cell: (row) => formatVnd(row.discount) },
              { key: "revenue", header: "Doanh thu", align: "right", cell: (row) => formatVnd(row.revenue) },
              { key: "conversion", header: "Tỷ lệ hoàn tất", align: "right", cell: (row) => `${row.conversionRate}%` },
              { key: "valid", header: "Hết hạn", cell: (row) => formatDate(row.validTo) },
            ]}
            empty={<p className="muted">Chưa có mã giảm giá.</p>}
          />
        ) : null
      ) : null}

      {tab === "channels" ? (
        channels.loading ? <Skeleton height={320} /> : channels.error ? <ErrorState error={channels.error} onRetry={channels.reload} /> : channels.data ? (
          <DataTable
            rows={channels.data.channels}
            rowKey={(row) => row.channel}
            columns={[
              { key: "channel", header: "Kênh", cell: (row) => row.channel === "web" ? "Website" : row.channel === "counter" ? "Tại quầy" : row.channel === "phone" ? "Điện thoại" : "Đại lý" },
              { key: "count", header: "Số đơn", align: "center", cell: (row) => row.count },
              { key: "confirmed", header: "Đã xác nhận", align: "center", cell: (row) => row.confirmed },
              { key: "value", header: "Giá trị", align: "right", cell: (row) => formatVnd(row.value) },
            ]}
          />
        ) : null
      ) : null}
    </>
  );
}
