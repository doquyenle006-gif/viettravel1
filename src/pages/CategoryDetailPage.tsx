import { Link, useParams } from "react-router-dom";
import { useApi } from "../lib/hooks";
import type { Category } from "../types";
import { Seo } from "../components/Seo";
import { TourCard } from "../components/TourCard";
import { Breadcrumbs, EmptyState, ErrorState, Skeleton } from "../components/ui";

export default function CategoryDetailPage() {
  const { slug } = useParams();
  const state = useApi<Category>(slug ? `/categories/${encodeURIComponent(slug)}` : null, [slug]);
  const category = state.data;
  if (state.loading) return <div className="container detail-page"><Skeleton height={80} /><Skeleton height={300} /></div>;
  if (state.error) return <div className="container narrow-page"><ErrorState error={state.error} onRetry={state.reload} /></div>;
  if (!category) return null;
  return (
    <>
      <Seo title={category.name} description={category.description} />
      <div className="container detail-page">
        <Breadcrumbs items={[{ label: "Trang chủ", href: "/" }, { label: "Trải nghiệm", href: "/danh-muc" }, { label: category.name }]} />
        <div className="category-header" style={{ paddingTop: 8 }}>
          <div>
            <p className="eyebrow">Danh mục trải nghiệm</p>
            <h1>{category.name}</h1>
            <p>{category.description}</p>
          </div>
          <Link to={`/tours?category=${category.slug}`} className="btn btn-outline">Xem dạng danh sách</Link>
        </div>
        {category.tours?.length ? (
          <div className="grid-tours">{category.tours.map((tour) => <TourCard key={tour.id} tour={tour} />)}</div>
        ) : (
          <EmptyState icon="compass" title="Chưa có tour trong danh mục này" action={<Link to="/tours" className="btn btn-primary">Xem tất cả tour</Link>} />
        )}
      </div>
    </>
  );
}
