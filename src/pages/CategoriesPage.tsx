import { Link } from "react-router-dom";
import { useApi } from "../lib/hooks";
import type { Category } from "../types";
import { Seo } from "../components/Seo";
import { Icon } from "../components/Icon";
import { EmptyState, ErrorState, Skeleton } from "../components/ui";

export default function CategoriesPage() {
  const state = useApi<Category[]>("/categories");
  return (
    <>
      <Seo title="Danh mục trải nghiệm" description="Chọn cảm hứng cho chuyến đi: biển đảo, núi rừng, di sản hay nghỉ dưỡng." />
      <div className="container">
        <div className="category-header">
          <div>
            <p className="eyebrow">Chọn theo cảm hứng</p>
            <h1>Trải nghiệm</h1>
            <p>Mỗi người đi một kiểu. Chọn nhịp điệu phù hợp với bạn.</p>
          </div>
        </div>
        {state.loading ? <div className="category-grid">{[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} height={150} />)}</div>
          : state.error ? <ErrorState error={state.error} onRetry={state.reload} />
            : state.data?.length ? (
              <div className="category-grid" style={{ paddingBottom: 70 }}>
                {state.data.map((category) => (
                  <Link key={category.id} to={`/tours?category=${category.slug}`} className="category-card">
                    <span className="category-icon"><Icon name={category.slug === "bien-dao" ? "sun" : category.slug === "nui-trekking" ? "compass" : category.slug === "nghi-duong" ? "sparkles" : "book"} size={22} /></span>
                    <strong>{category.name}</strong>
                    <span>{category.description}</span>
                    <span className="muted">{category.tourCount} tour</span>
                  </Link>
                ))}
              </div>
            ) : <EmptyState title="Chưa có danh mục" />}
      </div>
    </>
  );
}
