import { Link, useParams } from "react-router-dom";
import { useApi } from "../lib/hooks";
import type { Destination } from "../types";
import { Seo } from "../components/Seo";
import { CoverArt } from "../components/CoverArt";
import { TourCard } from "../components/TourCard";
import { Breadcrumbs, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { Icon } from "../components/Icon";

export default function DestinationDetailPage() {
  const { slug } = useParams();
  const state = useApi<Destination>(slug ? `/destinations/${encodeURIComponent(slug)}` : null, [slug]);
  const destination = state.data;
  if (state.loading) return <div className="container detail-page"><Skeleton height={300} /><Skeleton height={40} width="45%" /></div>;
  if (state.error) return <div className="container narrow-page"><ErrorState error={state.error} onRetry={state.reload} /></div>;
  if (!destination) return null;
  return (
    <>
      <Seo title={`${destination.name} — Điểm đến`} description={destination.description} />
      <div className="container detail-page">
        <Breadcrumbs items={[{ label: "Trang chủ", href: "/" }, { label: "Điểm đến", href: "/destinations" }, { label: destination.name }]} />
        <div className="dest-hero">
          <CoverArt seed={destination.slug} alt={destination.name} />
          <div className="dest-hero-body">
            <p className="eyebrow" style={{ color: "#f0c79f" }}>{destination.province}</p>
            <h1>{destination.name}</h1>
            <p>{destination.description}</p>
          </div>
        </div>
        <div className="inline-actions" style={{ marginTop: 18 }}>
          <Link to={`/tours?destination=${destination.slug}`} className="btn btn-primary">Tour tại {destination.name}</Link>
          <span className="trust-note"><Icon name="compass" size={15} /> {destination.tours?.length ?? 0} tour đang mở bán</span>
        </div>

        <section className="detail-section">
          <h2>Hành trình tại {destination.name}</h2>
          {destination.tours?.length ? (
            <div className="grid-tours">{destination.tours.map((tour) => <TourCard key={tour.id} tour={tour} />)}</div>
          ) : (
            <EmptyState icon="compass" title="Chưa có tour đang mở bán" description="Liên hệ để được tư vấn lịch trình riêng." action={<Link to="/contact" className="btn btn-outline">Liên hệ tư vấn</Link>} />
          )}
        </section>

        {destination.lat && destination.lng ? (
          <section className="detail-section">
            <h2>Vị trí</h2>
            <div className="mini-map">
              <iframe
                title={`Bản đồ ${destination.name}`}
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${destination.lng - 0.12}%2C${destination.lat - 0.09}%2C${destination.lng + 0.12}%2C${destination.lat + 0.09}&layer=mapnik&marker=${destination.lat}%2C${destination.lng}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
