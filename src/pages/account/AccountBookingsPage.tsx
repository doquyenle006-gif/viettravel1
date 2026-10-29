import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { BookingSummary, Meta } from "../../types";
import { useApi } from "../../lib/hooks";
import { formatDate, formatPax, formatVnd } from "../../lib/format";
import { Seo } from "../../components/Seo";
import { CoverArt } from "../../components/CoverArt";
import { HoldCountdown } from "../../components/booking";
import { EmptyState, ErrorState, Pagination, Skeleton, StatusChip, Tabs } from "../../components/ui";
import { Icon } from "../../components/Icon";

const TABS = [
  { id: "", label: "Tất cả" },
  { id: "pending", label: "Đang giữ chỗ" },
  { id: "confirmed", label: "Đã xác nhận" },
  { id: "completed", label: "Đã hoàn thành" },
  { id: "cancelled", label: "Đã hủy" },
  { id: "expired", label: "Hết hạn" },
];

export default function AccountBookingsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const page = Number(params.get("page") || 1);
  const [q, setQ] = useState(params.get("q") || "");
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (q) query.set("q", q);
  query.set("page", String(page));
  query.set("perPage", "10");
  const state = useApi<BookingSummary[]>(`/me/bookings?${query.toString()}`, [status, page, q]);
  const meta = state.meta as Meta | undefined;

  const setStatus = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set("status", id); else next.delete("status");
    next.delete("page");
    setParams(next, { replace: true });
  };
  const setPage = (value: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(value));
    setParams(next, { replace: true });
  };

  return (
    <>
      <Seo title="Đơn của tôi" noindex />
      <div className="page-header">
        <div>
          <p className="eyebrow">Tài khoản</p>
          <h1>Đơn của tôi</h1>
          <p className="page-description">Theo dõi trạng thái, thanh toán, voucher và yêu cầu thay đổi.</p>
        </div>
        <Link to="/tours" className="btn btn-primary">Đặt tour mới</Link>
      </div>
      <form className="search-bar search-bar--compact" onSubmit={(event) => { event.preventDefault(); setPage(1); }} style={{ marginBottom: 14 }} role="search">
        <div className="search-field search-field--grow">
          <label htmlFor="booking-q"><Icon name="search" size={13} /> Tìm đơn</label>
          <input id="booking-q" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Mã đơn hoặc tên tour" />
        </div>
        <button type="submit" className="btn btn-outline">Tìm</button>
      </form>
      <Tabs items={TABS} value={status} onChange={setStatus} />
      <div style={{ marginTop: 16 }}>
        {state.loading ? (
          <div className="booking-list">{[1, 2, 3].map((item) => <Skeleton key={item} height={120} />)}</div>
        ) : state.error ? (
          <ErrorState error={state.error} onRetry={state.reload} />
        ) : !state.data?.length ? (
          <EmptyState
            icon="ticket"
            title={status ? "Không có đơn ở trạng thái này" : "Bạn chưa có đơn nào"}
            description="Khi đặt tour, đơn của bạn sẽ xuất hiện tại đây."
            action={<Link to="/tours" className="btn btn-primary">Khám phá tour</Link>}
          />
        ) : (
          <>
            <div className="booking-list">
              {state.data.map((booking) => (
                <article key={booking.code} className="booking-card">
                  <Link to={`/account/bookings/${booking.code}`} className="booking-cover" aria-hidden="true" tabIndex={-1}>
                    <CoverArt seed={booking.tour.slug} alt="" />
                  </Link>
                  <div>
                    <div className="inline-actions" style={{ gap: 8, flexWrap: "wrap" }}>
                      <span className="order-code" style={{ fontSize: 13 }}>{booking.code}</span>
                      <StatusChip status={booking.status} kind="booking" size="sm" />
                      <StatusChip status={booking.paymentStatus} kind="payment" size="sm" />
                    </div>
                    <h3 style={{ marginTop: 6 }}><Link to={`/account/bookings/${booking.code}`}>{booking.tour.name}</Link></h3>
                    <div className="booking-meta">
                      <span><Icon name="calendar" size={13} /> {formatDate(booking.departure.departureDate)}</span>
                      <span><Icon name="users" size={13} /> {formatPax(booking.adults, booking.children, booking.infants)}</span>
                      <span><Icon name="map-pin" size={13} /> {booking.tour.destinationName}</span>
                    </div>
                    {booking.status === "pending" && booking.holdExpiresAt ? (
                      <div style={{ marginTop: 8 }}><HoldCountdown expiresAt={booking.holdExpiresAt} label="Giữ chỗ đến" /></div>
                    ) : null}
                    {booking.status === "confirmed" && booking.remaining > 0 ? (
                      <p className="booking-hint"><Icon name="alert" size={13} /> Còn {formatVnd(booking.remaining)} · hạn {formatDate(booking.balanceDueDate)}</p>
                    ) : null}
                  </div>
                  <div className="booking-aside">
                    <span className="field-hint">Tổng tiền</span>
                    <strong>{formatVnd(booking.total)}</strong>
                    <span>Đã trả {formatVnd(booking.grossPaid)}</span>
                    {booking.allowedActions.includes("pay_deposit") || booking.allowedActions.includes("pay_balance") ? (
                      <Link to={`/booking/${booking.code}/pay`} className="btn btn-primary btn-sm" style={{ marginTop: 4 }}>Thanh toán</Link>
                    ) : (
                      <Link to={`/account/bookings/${booking.code}`} className="btn btn-outline btn-sm" style={{ marginTop: 4 }}>Xem chi tiết</Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Pagination page={meta?.page || page} totalPages={meta?.totalPages || 1} total={meta?.total} perPage={meta?.perPage} onChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
