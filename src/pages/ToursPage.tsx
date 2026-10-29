import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Destination, Meta, TourSummary } from "../types";
import { useApi } from "../lib/hooks";
import { formatVnd } from "../lib/format";
import { Seo } from "../components/Seo";
import { TourCard } from "../components/TourCard";
import { Icon } from "../components/Icon";
import { EmptyState, ErrorState, Pagination, Skeleton } from "../components/ui";

interface ToursMeta extends Meta {
  facets?: {
    categories: { slug: string; name: string; count: number }[];
    regions: { value: string; label: string; count: number }[];
    priceRange: { min: number; max: number } | null;
  };
}

const REGIONS = [
  { value: "north", label: "Miền Bắc" },
  { value: "central", label: "Miền Trung" },
  { value: "south", label: "Miền Nam" },
];

const SORTS = [
  { value: "featured", label: "Nổi bật" },
  { value: "price_asc", label: "Giá thấp → cao" },
  { value: "price_desc", label: "Giá cao → thấp" },
  { value: "date", label: "Ngày khởi hành gần nhất" },
  { value: "rating", label: "Đánh giá cao" },
];

const PRICE_RANGES = [
  { value: "", label: "Mọi mức giá" },
  { value: "0-3000000", label: "Dưới 3 triệu" },
  { value: "3000000-5000000", label: "3 – 5 triệu" },
  { value: "5000000-8000000", label: "5 – 8 triệu" },
  { value: "8000000-", label: "Trên 8 triệu" },
];

const DURATIONS = [
  { value: "", label: "Mọi thời lượng" },
  { value: "1-2", label: "1 – 2 ngày" },
  { value: "3-4", label: "3 – 4 ngày" },
  { value: "5-7", label: "5 – 7 ngày" },
  { value: "8-", label: "8 ngày trở lên" },
];

export default function ToursPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [mobileFilters, setMobileFilters] = useState(false);
  const destinations = useApi<Destination[]>("/destinations");
  const queryString = params.toString();
  const tours = useApi<TourSummary[]>(`/tours?${queryString || "perPage=9"}`);
  const list = tours.data || [];
  const meta = tours.meta as ToursMeta | undefined;
  const facets = meta?.facets;

  useEffect(() => {
    setQ(params.get("q") || "");
  }, [params]);

  const get = (key: string, fallback = "") => params.get(key) || fallback;
  const update = (key: string, value: string, resetPage = true) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (resetPage) next.delete("page");
    next.set("perPage", "9");
    setParams(next, { replace: true });
  };
  const updateMany = (entries: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(entries)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    next.set("perPage", "9");
    setParams(next, { replace: true });
  };
  const clearAll = () => {
    setParams({ perPage: "9" }, { replace: true });
    setQ("");
  };
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    update("q", q.trim());
  };

  const price = get("price");
  const duration = get("duration");
  const activeFilters: { label: string; onClear: () => void }[] = [];
  if (get("q")) activeFilters.push({ label: `Từ khóa: ${get("q")}`, onClear: () => update("q", "") });
  if (get("category")) {
    const name = facets?.categories.find((item) => item.slug === get("category"))?.name || get("category");
    activeFilters.push({ label: `Danh mục: ${name}`, onClear: () => update("category", "") });
  }
  if (get("region")) activeFilters.push({ label: `Vùng: ${REGIONS.find((item) => item.value === get("region"))?.label || get("region")}`, onClear: () => update("region", "") });
  if (get("destination")) activeFilters.push({ label: `Điểm đến: ${destinations.data?.find((item) => item.slug === get("destination"))?.name || get("destination")}`, onClear: () => update("destination", "") });
  if (get("dateFrom")) activeFilters.push({ label: `Từ ngày ${get("dateFrom").split("-").reverse().join("/")}`, onClear: () => update("dateFrom", "") });
  if (get("dateTo")) activeFilters.push({ label: `Đến ngày ${get("dateTo").split("-").reverse().join("/")}`, onClear: () => update("dateTo", "") });
  if (get("pax")) activeFilters.push({ label: `${get("pax")} khách`, onClear: () => update("pax", "") });
  if (price) activeFilters.push({ label: PRICE_RANGES.find((item) => item.value === price)?.label || price, onClear: () => update("price", "") });
  if (duration) activeFilters.push({ label: DURATIONS.find((item) => item.value === duration)?.label || duration, onClear: () => update("duration", "") });

  const applyPrice = (value: string) => {
    const [min, max] = value.split("-");
    updateMany({ price: value, priceMin: min || "", priceMax: max || "" });
  };
  const applyDuration = (value: string) => {
    const [min, max] = value.split("-");
    updateMany({ duration: value, durationMin: min || "", durationMax: max || "" });
  };

  const filterPanel = (
    <div className="filter-panel" aria-label="Bộ lọc tour">
      <h2>Tìm tour <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{meta?.total ?? "—"} kết quả</span></h2>
      <div className="filter-group">
        <h3>Danh mục</h3>
        <div className="filter-options">
          <label className="filter-option"><span>Tất cả</span><input type="radio" name="category" checked={!get("category")} onChange={() => update("category", "")} /></label>
          {(facets?.categories || []).map((category) => (
            <label key={category.slug} className="filter-option">
              <span>{category.name} <span className="muted">({category.count})</span></span>
              <input type="radio" name="category" checked={get("category") === category.slug} onChange={() => update("category", category.slug)} />
            </label>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <h3>Vùng miền</h3>
        <div className="filter-options">
          <label className="filter-option"><span>Tất cả</span><input type="radio" name="region" checked={!get("region")} onChange={() => update("region", "")} /></label>
          {REGIONS.map((region) => (
            <label key={region.value} className="filter-option">
              <span>{region.label}</span>
              <input type="radio" name="region" checked={get("region") === region.value} onChange={() => update("region", region.value)} />
            </label>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <h3>Điểm đến</h3>
        <select className="input" value={get("destination")} onChange={(event) => update("destination", event.target.value)} aria-label="Điểm đến">
          <option value="">Tất cả điểm đến</option>
          {(destinations.data || []).map((destination) => <option key={destination.id} value={destination.slug}>{destination.name}</option>)}
        </select>
      </div>
      <div className="filter-group">
        <h3>Ngày khởi hành</h3>
        <div className="filter-range" style={{ display: "grid", gap: 6 }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="field-hint">Từ ngày</span>
            <input className="input" type="date" value={get("dateFrom")} onChange={(event) => update("dateFrom", event.target.value)} />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="field-hint">Đến ngày</span>
            <input className="input" type="date" value={get("dateTo")} onChange={(event) => update("dateTo", event.target.value)} />
          </label>
        </div>
      </div>
      <div className="filter-group">
        <h3>Số khách</h3>
        <select className="input" value={get("pax", "1")} onChange={(event) => update("pax", event.target.value)} aria-label="Số khách">
          {[1, 2, 3, 4, 5, 6, 8, 10].map((value) => <option key={value} value={value}>{value} khách</option>)}
        </select>
      </div>
      <div className="filter-group">
        <h3>Thời lượng</h3>
        <select className="input" value={duration} onChange={(event) => applyDuration(event.target.value)} aria-label="Thời lượng">
          {DURATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      <div className="filter-group">
        <h3>Khoảng giá</h3>
        <select className="input" value={price} onChange={(event) => applyPrice(event.target.value)} aria-label="Khoảng giá">
          {PRICE_RANGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        {facets?.priceRange ? <p className="field-hint">Giá hiện có: {formatVnd(facets.priceRange.min)} – {formatVnd(facets.priceRange.max)}</p> : null}
      </div>
      <div className="filter-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={clearAll}>Xóa bộ lọc</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setMobileFilters(false)}>Áp dụng</button>
      </div>
    </div>
  );

  return (
    <>
      <Seo title="Tất cả tour" description="Tìm và lọc tour theo điểm đến, ngày khởi hành, thời lượng và ngân sách." />
      <div className="container catalog-layout">
        <aside>{filterPanel}</aside>
        <div>
          <div className="results-head">
            <div>
              <p className="eyebrow">Bộ sưu tập hành trình</p>
              <h1>Tìm chuyến đi của bạn</h1>
              <p className="results-count" aria-live="polite">
                {tours.loading ? "Đang tìm tour…" : `${meta?.total ?? 0} tour phù hợp`}
              </p>
            </div>
            <div className="inline-actions">
              <button type="button" className="btn btn-outline btn-sm filter-mobile-toggle" onClick={() => setMobileFilters(true)}>
                <Icon name="filter" size={15} /> Bộ lọc {activeFilters.length ? `(${activeFilters.length})` : ""}
              </button>
              <label className="sort-select">
                <span>Sắp xếp</span>
                <select value={get("sort", "featured")} onChange={(event) => update("sort", event.target.value)}>
                  {SORTS.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          <form className="search-bar search-bar--compact" onSubmit={submitSearch} role="search" style={{ marginBottom: 16 }}>
            <div className="search-field search-field--grow">
              <label htmlFor="tours-q"><Icon name="search" size={13} /> Từ khóa</label>
              <input id="tours-q" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Tên tour, điểm đến…" />
            </div>
            <button type="submit" className="btn btn-primary">Tìm</button>
          </form>

          {activeFilters.length ? (
            <div className="active-filters">
              {activeFilters.map((filter) => (
                <span key={filter.label} className="filter-chip">
                  {filter.label}
                  <button type="button" onClick={filter.onClear} aria-label={`Xóa bộ lọc ${filter.label}`}><Icon name="x" size={12} /></button>
                </span>
              ))}
              <button type="button" className="text-link" onClick={clearAll} style={{ fontSize: 12, background: "none", border: 0 }}>Xóa tất cả</button>
            </div>
          ) : null}

          {tours.loading ? (
            <div className="tours-grid">{[1, 2, 3, 4].map((item) => <Skeleton key={item} height={360} />)}</div>
          ) : tours.error ? (
            <ErrorState error={tours.error} onRetry={tours.reload} />
          ) : list.length === 0 ? (
            <EmptyState
              icon="search"
              title="Không tìm thấy tour phù hợp"
              description="Thử mở rộng khoảng ngày, giảm số khách hoặc xóa bớt bộ lọc."
              action={<button type="button" className="btn btn-primary" onClick={clearAll}>Xóa bộ lọc</button>}
            />
          ) : (
            <>
              <div className="tours-grid">{list.map((tour) => <TourCard key={tour.id} tour={tour} />)}</div>
              <Pagination
                page={Number(get("page", "1"))}
                totalPages={meta?.totalPages || 1}
                total={meta?.total}
                perPage={meta?.perPage}
                onChange={(page) => update("page", String(page), false)}
              />
            </>
          )}
        </div>
      </div>

      {mobileFilters ? (
        <div className="filter-overlay" role="dialog" aria-modal="true" aria-label="Bộ lọc tour" onClick={(event) => {
          if (event.target === event.currentTarget) setMobileFilters(false);
        }}>
          <div className="filter-panel">
            <div className="filter-overlay-head">
              <strong>Bộ lọc</strong>
              <button type="button" className="icon-btn" onClick={() => setMobileFilters(false)} aria-label="Đóng bộ lọc"><Icon name="x" size={18} /></button>
            </div>
            {filterPanel}
          </div>
        </div>
      ) : null}
    </>
  );
}
