import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Destination } from "../types";
import { Icon } from "./Icon";
import { todayIso } from "../lib/format";

interface SearchBarProps {
  destinations?: Destination[];
  compact?: boolean;
  initial?: { q?: string; dateFrom?: string; pax?: string };
}

export function SearchBar({ destinations = [], compact = false, initial = {} }: SearchBarProps) {
  const navigate = useNavigate();
  const id = useId();
  const [q, setQ] = useState(initial.q || "");
  const [dateFrom, setDateFrom] = useState(initial.dateFrom || "");
  const [pax, setPax] = useState(initial.pax || "2");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("destination", q.trim());
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (pax) params.set("pax", pax);
    navigate(`/tours${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <form className={`search-bar ${compact ? "search-bar--compact" : ""}`} onSubmit={submit} role="search" aria-label="Tìm tour">
      <div className="search-field search-field--grow">
        <label htmlFor={`${id}-destination`}><Icon name="map-pin" size={14} /> Điểm đến</label>
        <select id={`${id}-destination`} value={q} onChange={(event) => setQ(event.target.value)}>
          <option value="">Tất cả điểm đến</option>
          {destinations.map((destination) => (
            <option key={destination.id} value={destination.slug}>{destination.name}</option>
          ))}
        </select>
      </div>
      <div className="search-field">
        <label htmlFor={`${id}-date`}><Icon name="calendar" size={14} /> Khởi hành từ</label>
        <input
          id={`${id}-date`}
          type="date"
          min={todayIso()}
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
        />
      </div>
      <div className="search-field search-field--pax">
        <label htmlFor={`${id}-pax`}><Icon name="users" size={14} /> Số khách</label>
        <select id={`${id}-pax`} value={pax} onChange={(event) => setPax(event.target.value)}>
          {[1, 2, 3, 4, 5, 6, 8, 10].map((value) => (
            <option key={value} value={value}>{value} khách</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-accent search-submit">
        <Icon name="search" size={18} />
        <span className={compact ? "sr-only" : ""}>Tìm tour</span>
      </button>
    </form>
  );
}
