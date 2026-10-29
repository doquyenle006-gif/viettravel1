import { Link } from "react-router-dom";
import type { TourSummary } from "../types";
import { formatDate, formatDuration, formatVnd } from "../lib/format";
import { CoverArt } from "./CoverArt";
import { Icon } from "./Icon";

export function TourCard({ tour }: { tour: TourSummary }) {
  const lowSeats = tour.seatsLeftNext !== null && tour.seatsLeftNext > 0 && tour.seatsLeftNext <= 5;
  return (
    <article className="tour-card">
      <Link to={`/tours/${tour.slug}`} className="tour-card-media" aria-label={`Xem tour ${tour.name}`}>
        <CoverArt seed={tour.cover?.replace(/^art:/, "") || tour.slug} alt={tour.name} className="tour-card-cover" />
        <span className="tour-card-category">{tour.category}</span>
        {lowSeats ? <span className="tour-card-seats"><Icon name="flash" size={13} /> Chỉ còn {tour.seatsLeftNext} chỗ</span> : null}
      </Link>
      <div className="tour-card-body">
        <div className="tour-card-meta">
          <span><Icon name="map-pin" size={13} /> {tour.destinationName}</span>
          <span>{formatDuration(tour.durationDays, tour.durationNights)}</span>
        </div>
        <h3><Link to={`/tours/${tour.slug}`}>{tour.name}</Link></h3>
        {tour.summary ? <p className="tour-card-summary">{tour.summary}</p> : null}
        <div className="tour-card-rating">
          <span className={`rating-inline ${tour.ratingAvg ? "" : "rating-inline--empty"}`}>
            <Icon name="star" size={14} />
            {tour.ratingAvg ? tour.ratingAvg.toFixed(1) : "Mới"}
          </span>
          <span className="muted">{tour.ratingCount ? `${tour.ratingCount} đánh giá` : "Chưa có đánh giá"}</span>
          {tour.nextDeparture ? <span className="muted">· {formatDate(tour.nextDeparture)}</span> : null}
        </div>
        <div className="tour-card-footer">
          <div>
            <span className="price-label">Từ</span>
            <strong className="price">{formatVnd(tour.priceFrom)}</strong>
            <span className="price-unit">/ khách</span>
          </div>
          <Link to={`/tours/${tour.slug}`} className="btn btn-outline btn-sm">Chi tiết</Link>
        </div>
      </div>
    </article>
  );
}
