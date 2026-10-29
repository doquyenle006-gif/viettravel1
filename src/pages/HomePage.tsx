import { Link } from "react-router-dom";
import { useApi } from "../lib/hooks";
import { usePublicConfig } from "../lib/config";
import type { HomeData } from "../types";
import { Seo } from "../components/Seo";
import { Icon, type IconName } from "../components/Icon";
import { SearchBar } from "../components/SearchBar";
import { TourCard } from "../components/TourCard";
import { CoverArt } from "../components/CoverArt";
import { EmptyState, ErrorState, RatingStars, Skeleton } from "../components/ui";
import { formatDate, formatVnd } from "../lib/format";

const TRUST: { icon: IconName; title: string; text: string }[] = [
  { icon: "shield", title: "Thanh toán an toàn", text: "Xác nhận giao dịch từ máy chủ, bảo vệ dữ liệu" },
  { icon: "calendar", title: "Lịch khởi hành rõ ràng", text: "Tồn chỗ cập nhật, không bán vượt sức chứa" },
  { icon: "users", title: "Hướng dẫn viên bản địa", text: "Đồng hành cùng người hiểu nơi bạn đến" },
  { icon: "refresh", title: "Hủy linh hoạt", text: "Chính sách theo bậc, minh bạch trước khi đặt" },
];

export default function HomePage() {
  const config = usePublicConfig();
  const home = useApi<HomeData>("/home");
  const data = home.data;
  const banner = data?.banners[0];
  const heroTour = data?.featured[0];

  return (
    <>
      <Seo
        title="Hành trình Việt, trọn vẹn từng khoảnh khắc"
        description="VietTrails — tour trọn gói trong nước, lịch khởi hành linh hoạt, giá minh bạch, hỗ trợ 24/7."
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "TravelAgency",
          name: "VietTrails",
          telephone: config.hotline,
          email: config.supportEmail,
          areaServed: "Việt Nam",
        }}
      />
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="hero-eyebrow"><Icon name="sparkles" size={13} /> Tour trọn gói · Khởi hành theo lịch</span>
            <h1 className="hero-title">
              {(() => {
                const title = (banner?.title || "Đi chậm để thấy Việt Nam trọn vẹn").replace(/khoảnh khắc/g, "khoảnh\u00A0khắc");
                const [lead, tail] = title.split("trọn vẹn");
                return tail === undefined ? title : <>{lead}<em>trọn vẹn</em>{tail}</>;
              })()}
            </h1>
            <p className="hero-sub">{banner?.subtitle || "Chọn lịch khởi hành phù hợp, đặt cọc giữ chỗ và để VietTrails lo phần còn lại."}</p>
            <SearchBar destinations={data?.destinations || []} />
            <div className="hero-stats">
              <div><strong>{data?.stats.tours || 12}+</strong><span>Hành trình đang mở bán</span></div>
              <div><strong>{data?.stats.destinations || 12}</strong><span>Điểm đến khắp Việt Nam</span></div>
              <div><strong>{data?.stats.ratingAvg ? `${data.stats.ratingAvg.toFixed(1)}/5` : "Mới"}</strong><span>{data?.stats.reviewCount ? `${data.stats.reviewCount} đánh giá đã duyệt` : "Đang chờ đánh giá đầu tiên"}</span></div>
            </div>
          </div>
          <div className="hero-art">
            <CoverArt seed={heroTour?.cover?.replace(/^art:/, "") || banner?.image?.replace(/^art:/, "") || "halong"} alt="" />
            <div className="hero-card">
              <span className="avatar"><Icon name="compass" size={17} /></span>
              <span>
                <strong>{heroTour?.name || "Hành trình nổi bật"}</strong>
                <span>{heroTour?.nextDeparture ? `Khởi hành ${formatDate(heroTour.nextDeparture)}` : "Lịch khởi hành linh hoạt"} · Từ {formatVnd(heroTour?.priceFrom ?? null)}</span>
              </span>
              <span className="rating-inline"><Icon name="star" size={14} /> {heroTour?.ratingAvg ? heroTour.ratingAvg.toFixed(1) : "Mới"}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Cam kết dịch vụ">
        <div className="container trust-grid">
          {TRUST.map((item) => (
            <div className="trust-item" key={item.title}>
              <span className="trust-icon"><Icon name={item.icon} size={19} /></span>
              <div><strong>{item.title}</strong><span>{item.text}</span></div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">Được chọn nhiều</p>
              <h2 className="section-title">Hành trình nổi bật</h2>
              <p className="section-sub">Những chuyến đi được khách VietTrails đánh giá cao, còn chỗ trong thời gian tới.</p>
            </div>
            <Link to="/tours" className="section-link">Xem tất cả <Icon name="arrow-right" size={16} /></Link>
          </div>
          {home.loading ? (
            <div className="grid-tours">
              {[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} height={360} />)}
            </div>
          ) : home.error ? (
            <ErrorState error={home.error} onRetry={home.reload} />
          ) : data?.featured.length ? (
            <div className="grid-tours">
              {data.featured.map((tour) => <TourCard key={tour.id} tour={tour} />)}
            </div>
          ) : (
            <EmptyState title="Chưa có tour đang mở bán" description="Vui lòng quay lại sau hoặc liên hệ để nhận thông báo." />
          )}
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">Chọn theo cảm hứng</p>
              <h2 className="section-title">Bạn muốn đi đâu?</h2>
            </div>
            <Link to="/danh-muc" className="section-link">Tất cả danh mục <Icon name="arrow-right" size={16} /></Link>
          </div>
          <div className="category-grid">
            {(data?.categories || []).map((category) => (
              <Link key={category.id} to={`/tours?category=${category.slug}`} className="category-card">
                <span className="category-icon"><Icon name={category.slug === "bien-dao" ? "sun" : category.slug === "nui-trekking" ? "compass" : category.slug === "nghi-duong" ? "sparkles" : "book"} size={22} /></span>
                <strong>{category.name}</strong>
                <span>{category.tourCount} tour đang mở bán</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {data && data.banners.length > 1 ? (
        <section className="section section--tight">
          <div className="container banner-grid">
            {data.banners.slice(1, 3).map((item) => (
              <Link key={item.id} to={item.ctaHref} className="promo-card">
                <CoverArt seed={item.image.replace(/^art:/, "")} alt="" />
                <div className="promo-body">
                  <p className="eyebrow" style={{ color: "#f0c79f" }}>Ưu đãi đang mở</p>
                  <h3>{item.title}</h3>
                  <p>{item.subtitle}</p>
                  <span className="btn btn-accent btn-sm">{item.ctaLabel} <Icon name="arrow-right" size={14} /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">Điểm đến</p>
              <h2 className="section-title">Miền đất đang chờ</h2>
              <p className="section-sub">Từ vịnh đá vôi đến phố cổ đèn lồng, mỗi điểm đến là một nhịp sống riêng.</p>
            </div>
            <Link to="/destinations" className="section-link">Khám phá điểm đến <Icon name="arrow-right" size={16} /></Link>
          </div>
          <div className="destination-grid">
            {(data?.destinations || []).slice(0, 8).map((destination) => (
              <Link key={destination.id} to={`/destinations/${destination.slug}`} className="destination-card">
                <CoverArt seed={destination.slug} alt="" />
                <div className="destination-card-body">
                  <h3>{destination.name}</h3>
                  <span>{destination.tourCount} tour · Từ {formatVnd(destination.fromPrice ?? null)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <p className="eyebrow">Lắng nghe</p>
              <h2 className="section-title">Khách nói về VietTrails</h2>
            </div>
            <span className="trust-note"><Icon name="shield" size={14} /> Chỉ đánh giá từ khách đã đi</span>
          </div>
          <div className="review-strip">
            {(data?.reviews || []).map((review) => (
              <article key={review.id} className="review-card">
                <span className="review-quote">“</span>
                <RatingStars value={review.rating} size={15} />
                <p>{review.comment}</p>
                <footer><strong>{review.user}</strong><span>{review.tour}</span></footer>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="panel" style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", flexWrap: "wrap", background: "var(--green)", color: "#fff", border: 0, padding: "32px 36px" }}>
            <div>
              <p className="eyebrow" style={{ color: "#f0c79f" }}>Đoàn riêng · Doanh nghiệp</p>
              <h2 style={{ color: "#fff", fontSize: 28, fontFamily: "var(--font-display)" }}>Cần một hành trình riêng?</h2>
              <p style={{ color: "#c9d8ce", marginTop: 6, fontSize: 14 }}>Để lại yêu cầu, đội tư vấn sẽ thiết kế lịch trình theo số người, ngân sách và thời gian của bạn.</p>
            </div>
            <Link to="/contact" className="btn btn-accent btn-lg">Gửi yêu cầu tư vấn <Icon name="arrow-right" size={16} /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
