import { Link } from "react-router-dom";
import { useApi } from "../lib/hooks";
import type { Destination } from "../types";
import { Seo } from "../components/Seo";
import { CoverArt } from "../components/CoverArt";
import { EmptyState, ErrorState, Skeleton } from "../components/ui";
import { Icon } from "../components/Icon";
import { formatVnd } from "../lib/format";

export default function DestinationsPage() {
  const destinations = useApi<Destination[]>("/destinations");
  return (
    <>
      <Seo title="Điểm đến" description="Khám phá các điểm đến trên khắp Việt Nam cùng VietTrails." />
      <div className="container">
        <div className="category-header">
          <div>
            <p className="eyebrow">Bản đồ hành trình</p>
            <h1>Điểm đến</h1>
            <p>Mỗi vùng đất là một nhịp sống riêng — chọn nơi bạn muốn chậm lại.</p>
          </div>
          <span className="trust-note"><Icon name="compass" size={15} /> {destinations.data?.length ?? 0} điểm đến đang mở bán</span>
        </div>
        {destinations.loading ? (
          <div className="destination-grid">{[1, 2, 3, 4, 5, 6, 7, 8].map((item) => <Skeleton key={item} height={320} />)}</div>
        ) : destinations.error ? (
          <ErrorState error={destinations.error} onRetry={destinations.reload} />
        ) : destinations.data?.length ? (
          <div className="destination-grid" style={{ paddingBottom: 70 }}>
            {destinations.data.map((destination) => (
              <Link key={destination.id} to={`/destinations/${destination.slug}`} className="destination-card">
                <CoverArt seed={destination.slug} alt={destination.name} />
                <div className="destination-card-body">
                  <h3>{destination.name}</h3>
                  <span>{destination.province} · {destination.tourCount} tour · Từ {formatVnd(destination.fromPrice ?? null)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon="map-pin" title="Chưa có điểm đến" description="Vui lòng quay lại sau." />
        )}
      </div>
    </>
  );
}
