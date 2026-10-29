import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Departure, Quote, TourDetail } from "../types";
import { api, ApiError, isApiError } from "../lib/api";
import { useApi } from "../lib/hooks";
import { usePublicConfig } from "../lib/config";
import { formatDate, formatDateLong, formatDuration, formatVnd } from "../lib/format";
import { Seo } from "../components/Seo";
import { Icon } from "../components/Icon";
import { CoverArt } from "../components/CoverArt";
import { TourCard } from "../components/TourCard";
import { DepartureCalendar, PaxStepper, PriceSummary } from "../components/booking";
import { Breadcrumbs, EmptyState, ErrorState, Notice, RatingStars, Skeleton } from "../components/ui";
import { Modal } from "../components/Modal";

const MEALS: Record<string, string> = { breakfast: "Sáng", lunch: "Trưa", dinner: "Tối" };

function PolicyTable({ tiers }: { tiers: { minDaysBefore: number; maxDaysBefore: number | null; feePercent: number }[] }) {
  return (
    <table className="policy-table">
      <caption className="sr-only">Bảng phí hủy theo số ngày trước khởi hành</caption>
      <thead><tr><th>Hủy trước ngày khởi hành</th><th>Phí hủy</th></tr></thead>
      <tbody>
        {tiers.map((tier) => (
          <tr key={`${tier.minDaysBefore}-${tier.maxDaysBefore}`}>
            <td>{tier.maxDaysBefore === null ? `Từ ${tier.minDaysBefore} ngày` : tier.minDaysBefore === 0 ? "Ngày khởi hành / no-show" : `${tier.minDaysBefore}–${tier.maxDaysBefore} ngày`}</td>
            <td><strong>{tier.feePercent}%</strong></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface BookingWidgetProps {
  tour: TourDetail;
  selected: Departure | null;
  adults: number;
  children: number;
  infants: number;
  quote: Quote | null;
  loading: boolean;
  quoteError: string | null;
  onSelect: (departure: Departure) => void;
  onPaxChange: (value: { adults: number; children: number; infants: number }) => void;
  onBook: () => void;
  maxPaxOnline: number;
  compact?: boolean;
}

function BookingWidget({ tour, selected, adults, children, infants, quote, loading, quoteError, onSelect, onPaxChange, onBook, maxPaxOnline, compact }: BookingWidgetProps) {
  const seatsLeft = selected?.seatsLeft ?? Math.min(10, tour.maxPax);
  const limit = Math.min(seatsLeft, maxPaxOnline, tour.maxPax);
  return (
    <div className="booking-widget">
      <div className="price-hero">
        <strong>{selected ? formatVnd(selected.priceAdult) : tour.priceFrom ? formatVnd(tour.priceFrom) : "Liên hệ"}</strong>
        <span>/ khách · đã gồm thuế</span>
      </div>
      {selected ? (
        <p className="trust-note" style={{ marginBottom: 10 }}>
          <Icon name="calendar" size={14} /> {formatDateLong(selected.departureDate)} · {selected.meetingTime} · còn {selected.seatsLeft} chỗ
        </p>
      ) : null}
      <div className="book-field">
        <label>Chọn ngày khởi hành</label>
        <DepartureCalendar departures={tour.departures} selectedId={selected?.id ?? null} onSelect={onSelect} />
      </div>
      <div className="book-field">
        <label>Số khách</label>
        <PaxStepper
          adults={adults}
          children={children}
          infants={infants}
          onChange={onPaxChange}
          seatsLeft={seatsLeft}
          maxPax={Math.max(1, limit)}
          infantMax={tour.ageInfantMax}
          childMax={tour.ageChildMax}
          disabled={!selected}
        />
      </div>
      <PriceSummary quote={quote} loading={loading} error={quoteError} compact={compact} />
      <button type="button" className="btn btn-primary btn-block btn-lg" onClick={onBook} disabled={!selected || !quote || loading}>
        {quote ? "Đặt ngay" : "Chọn ngày khởi hành"}
      </button>
      <p className="booking-note">Chưa trừ tiền · Giữ chỗ tạm thời khi tạo đơn</p>
      <div className="trust-note" style={{ justifyContent: "center", marginTop: 8 }}>
        <Icon name="shield" size={13} /> Giá và tồn chỗ do máy chủ xác nhận
      </div>
    </div>
  );
}

export default function TourDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const config = usePublicConfig();
  const tourState = useApi<TourDetail>(slug ? `/tours/${encodeURIComponent(slug)}` : null, [slug]);
  const tour = tourState.data;
  const [selected, setSelected] = useState<Departure | null>(null);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!tour) return;
    const first = tour.departures.find((departure) => departure.status === "open" && departure.seatsLeft > 0) || null;
    setSelected(first);
    setAdults(2);
    setChildren(0);
    setInfants(0);
  }, [tour]);

  const maxPaxOnline = config.maxPaxOnline;
  useEffect(() => {
    if (!selected) {
      setQuote(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      setQuoteError(null);
      api<Quote>("/bookings/quote", {
        method: "POST",
        body: { departureId: selected.id, adults, children, infants },
        signal: controller.signal,
      })
        .then((data) => {
          setQuote(data);
          setQuoteError(null);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setQuote(null);
          if (isApiError(error)) {
            const extra = error.extra as { seatsLeft?: number } | undefined;
            setQuoteError(extra?.seatsLeft !== undefined ? `Chuyến chỉ còn ${extra.seatsLeft} chỗ. Vui lòng giảm số khách.` : error.message);
          } else {
            setQuoteError("Chưa tính được giá. Vui lòng thử lại.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setQuoteLoading(false);
        });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [selected, adults, children, infants]);

  const gallery = useMemo(() => {
    if (!tour) return [];
    if (tour.images && tour.images.length) return tour.images;
    return [0, 1, 2].map((variant) => ({ url: "", alt: `${tour.name} — ảnh ${variant + 1}`, variant }));
  }, [tour]);

  const book = () => {
    if (!selected) {
      setSheetOpen(true);
      return;
    }
    const params = new URLSearchParams({
      departure: String(selected.id), adults: String(adults), children: String(children), infants: String(infants),
    });
    navigate(`/checkout?${params.toString()}`);
  };

  const onPaxChange = (value: { adults: number; children: number; infants: number }) => {
    setAdults(value.adults);
    setChildren(value.children);
    setInfants(value.infants);
  };

  if (tourState.loading && !tour) {
    return (
      <div className="container detail-page" aria-busy="true">
        <Skeleton height={360} /><Skeleton height={32} width="50%" /><Skeleton height={20} width="70%" /><Skeleton height={160} />
      </div>
    );
  }
  if (tourState.error) {
    if (tourState.error instanceof ApiError && tourState.error.code === "NOT_FOUND") {
      return (
        <div className="container narrow-page">
          <EmptyState
            icon="compass"
            title="Tour không tồn tại hoặc đang tạm ẩn"
            description="Có thể tour đã ngừng mở bán. Hãy thử tìm hành trình khác."
            action={<Link to="/tours" className="btn btn-primary">Xem các tour khác</Link>}
          />
        </div>
      );
    }
    return <div className="container narrow-page"><ErrorState error={tourState.error} onRetry={tourState.reload} /></div>;
  }
  if (!tour) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: tour.name,
    description: tour.seoDescription || tour.summary,
    touristType: "Nội địa",
    itinerary: tour.itinerary.map((day) => ({ "@type": "TouristAttraction", name: day.title })),
    ...(tour.ratingCount > 0 && tour.ratingAvg ? {
      aggregateRating: { "@type": "AggregateRating", ratingValue: tour.ratingAvg, reviewCount: tour.ratingCount },
    } : {}),
    offers: tour.priceFrom ? {
      "@type": "Offer", price: tour.priceFrom, priceCurrency: "VND",
      availability: "https://schema.org/InStock", url: `${window.location.origin}/tours/${tour.slug}`,
    } : undefined,
  };

  const widget = (
    <BookingWidget
      tour={tour}
      selected={selected}
      adults={adults}
      children={children}
      infants={infants}
      quote={quote}
      loading={quoteLoading}
      quoteError={quoteError}
      onSelect={(departure) => { setSelected(departure); if (departure.seatsLeft < adults + children) { setAdults(Math.min(adults, departure.seatsLeft)); setChildren(0); } }}
      onPaxChange={onPaxChange}
      onBook={book}
      maxPaxOnline={maxPaxOnline}
    />
  );

  return (
    <>
      <Seo
        title={tour.seoTitle || tour.name}
        description={tour.seoDescription || tour.summary}
        jsonLd={jsonLd}
      />
      <div className="container detail-page">
        <Breadcrumbs items={[{ label: "Trang chủ", href: "/" }, { label: "Tour", href: "/tours" }, { label: tour.name }]} />
        <div className="detail-layout">
          <div>
            <div className="gallery">
              <div className="gallery-main">
                {gallery[0]?.url ? <img className="cover-img" src={gallery[0].url} alt={gallery[0].alt} /> : <CoverArt seed={tour.slug} variant={0} alt={tour.name} />}
              </div>
              <div className="gallery-side">
                {gallery.slice(1, 3).map((image, index) => (
                  <div key={`${image.url}-${index}`}>
                    {image.url ? <img className="cover-img" src={image.url} alt={image.alt} /> : <CoverArt seed={tour.slug} variant={index + 1} alt={image.alt} />}
                  </div>
                ))}
              </div>
            </div>

            <div className="detail-meta" style={{ marginTop: 18 }}>
              <span className="chip chip--info"><Icon name="map-pin" size={13} /> {tour.destinationName}</span>
              <span><Icon name="clock" size={14} /> {formatDuration(tour.durationDays, tour.durationNights)}</span>
              <span><Icon name="star" size={14} /> {tour.ratingCount ? `${tour.ratingAvg?.toFixed(1)} (${tour.ratingCount} đánh giá)` : "Chưa có đánh giá"}</span>
              <span><Icon name="users" size={14} /> Tối đa {tour.maxPax} khách</span>
            </div>
            <h1 className="detail-title">{tour.name}</h1>
            <p className="page-description" style={{ marginTop: 10 }}>{tour.summary}</p>

            <section className="detail-section">
              <h2>Điểm nổi bật</h2>
              <div className="highlight-list">
                {tour.highlights.map((item) => (
                  <span key={item} className="highlight-item"><Icon name="sparkles" size={15} /> {item}</span>
                ))}
              </div>
              <div className="prose" style={{ marginTop: 16 }}><p>{tour.description}</p></div>
            </section>

            <section className="detail-section" id="lich-trinh">
              <h2>Lịch trình {tour.durationDays} ngày</h2>
              <div className="itinerary">
                {tour.itinerary.map((day) => (
                  <details key={day.dayNo} className="itinerary-day" open={day.dayNo === 1}>
                    <summary>
                      <span className="day-badge">N{day.dayNo}</span>
                      <strong>{day.title}</strong>
                      <Icon name="chevron-down" size={16} />
                    </summary>
                    <div className="itinerary-content">
                      <p>{day.content}</p>
                      <div className="itinerary-tags">
                        {day.meals.map((meal) => <span key={meal} className="itinerary-tag">Bữa {MEALS[meal]}</span>)}
                        {day.accommodation ? <span className="itinerary-tag"><Icon name="home" size={11} /> {day.accommodation}</span> : null}
                        {day.places.map((place) => <span key={place} className="itinerary-tag"><Icon name="map-pin" size={11} /> {place}</span>)}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </section>

            <section className="detail-section">
              <h2>Bao gồm & không bao gồm</h2>
              <div className="inclusion-grid">
                <div className="inclusion-box">
                  <h3><Icon name="check-circle" size={15} /> Bao gồm</h3>
                  <ul>{tour.inclusions.map((item) => <li key={item}><Icon name="check" size={14} /> {item}</li>)}</ul>
                </div>
                <div className="inclusion-box">
                  <h3><Icon name="x" size={15} /> Không bao gồm</h3>
                  <ul>{tour.exclusions.map((item) => <li key={item}><Icon name="x" size={14} /> {item}</li>)}</ul>
                </div>
              </div>
              {tour.notes ? <Notice tone="neutral" title="Lưu ý">{tour.notes}</Notice> : null}
            </section>

            <section className="detail-section">
              <h2>Chính sách hủy — {tour.cancellationPolicy.name}</h2>
              <PolicyTable tiers={tour.cancellationPolicy.tiers} />
              <p className="field-hint">Phí hủy không vượt quá số tiền đã thanh toán. Khi công ty hủy chuyến, khách được hoàn 100% hoặc chuyển lịch miễn phí.</p>
            </section>

            {tour.destination?.lat && tour.destination?.lng ? (
              <section className="detail-section">
                <h2>Vị trí</h2>
                <div className="mini-map">
                  <iframe
                    title={`Bản đồ ${tour.destination.name}`}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${tour.destination.lng - 0.12}%2C${tour.destination.lat - 0.09}%2C${tour.destination.lng + 0.12}%2C${tour.destination.lat + 0.09}&layer=mapnik&marker=${tour.destination.lat}%2C${tour.destination.lng}`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </section>
            ) : null}

            <section className="detail-section" id="danh-gia">
              <h2>Đánh giá từ khách đã đi</h2>
              <div className="inline-actions" style={{ marginBottom: 14 }}>
                <RatingStars value={tour.ratingAvg || 0} size={18} />
                <strong style={{ fontSize: 20, color: "var(--green)" }}>{tour.ratingAvg ? tour.ratingAvg.toFixed(1) : "—"}/5</strong>
                <span className="muted">({tour.ratingCount} đánh giá đã duyệt)</span>
              </div>
              {tour.reviews.length ? (
                <div className="review-list">
                  {tour.reviews.map((review) => (
                    <article key={review.id} className="review-item">
                      <header><strong>{review.user}</strong><span><RatingStars value={review.rating} size={13} /> <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time></span></header>
                      <p>{review.comment}</p>
                      {review.reply ? <div className="review-reply"><strong>VietTrails phản hồi:</strong> {review.reply}</div> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState icon="star" title="Chưa có đánh giá" description="Đánh giá chỉ hiển thị sau khi được duyệt và đến từ khách đã hoàn thành chuyến." />
              )}
            </section>

            {tour.related.length ? (
              <section className="detail-section">
                <h2>Tour liên quan</h2>
                <div className="grid-tours">{tour.related.map((item) => <TourCard key={item.id} tour={item} />)}</div>
              </section>
            ) : null}
          </div>

          <aside className="detail-aside">
            <div className="booking-box">
              {!selected ? (
                <Notice tone="warning" title="Chưa có lịch mở bán">
                  Chuyến hiện chưa có lịch còn chỗ. <Link to="/contact" className="text-link">Liên hệ tư vấn</Link> để được hỗ trợ.
                </Notice>
              ) : null}
              {widget}
            </div>
          </aside>
        </div>
      </div>

      <div className="mobile-book-bar">
        <div>
          <span>Từ</span>
          <strong>{selected ? formatVnd(selected.priceAdult) : formatVnd(tour.priceFrom)}</strong>
          <span> / khách</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setSheetOpen(true)}>Chọn ngày & đặt</button>
      </div>

      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Chọn ngày khởi hành & số khách"
        sheet
        size="lg"
      >
        {widget}
      </Modal>
    </>
  );
}
