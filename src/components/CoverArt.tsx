import type { CSSProperties } from "react";

interface Theme {
  sky: [string, string];
  sun: string;
  far: string;
  mid: string;
  near: string;
  water: string;
  accent: string;
  kind: "coast" | "mountain" | "heritage" | "river";
}

const THEMES: Record<string, Theme> = {
  halong: { sky: ["#dceee9", "#f7ede0"], sun: "#f0b37e", far: "#7fa79b", mid: "#3f7264", near: "#1f4a3d", water: "#2f6f70", accent: "#e0a56f", kind: "coast" },
  sapa: { sky: ["#cfe3e8", "#eef0e3"], sun: "#f4c17a", far: "#8ba69a", mid: "#4d7560", near: "#264b3a", water: "#7ea89b", accent: "#d6a067", kind: "mountain" },
  danang: { sky: ["#d7ecf0", "#f6efe2"], sun: "#efb169", far: "#95b7bd", mid: "#3c7a87", near: "#20515c", water: "#3f97a8", accent: "#e6b46f", kind: "coast" },
  hoian: { sky: ["#f5dcc4", "#f7e8d7"], sun: "#e89a5f", far: "#c08d68", mid: "#8a5c45", near: "#4f3227", water: "#6b8b83", accent: "#e9b45e", kind: "heritage" },
  nhatrang: { sky: ["#d8eef1", "#f7f0df"], sun: "#f2bd72", far: "#8dc2c6", mid: "#2f8893", near: "#1d5c66", water: "#2aa3b5", accent: "#f0c180", kind: "coast" },
  phuquoc: { sky: ["#f8dcc6", "#f8ecd8"], sun: "#ee9e5b", far: "#d8a47d", mid: "#4c8d86", near: "#245e5b", water: "#2d8b91", accent: "#f3bd76", kind: "coast" },
  dalat: { sky: ["#d8e5da", "#f4eee0"], sun: "#f2cf8b", far: "#9bb49b", mid: "#54745a", near: "#294432", water: "#86a796", accent: "#d9a05b", kind: "mountain" },
  ninhbinh: { sky: ["#d9e8d8", "#f3ecdc"], sun: "#edbd7a", far: "#94b18d", mid: "#4f7552", near: "#29452f", water: "#6e9a7d", accent: "#d2a269", kind: "river" },
  hue: { sky: ["#e8d9d2", "#f6eadb"], sun: "#e7a86d", far: "#b08f80", mid: "#77584c", near: "#432f2b", water: "#718a83", accent: "#dba562", kind: "heritage" },
  cantho: { sky: ["#f7e3c9", "#f7edda"], sun: "#edaa63", far: "#c7a47c", mid: "#6f8e6c", near: "#3d5c43", water: "#7d9c83", accent: "#e5ad66", kind: "river" },
  hagiang: { sky: ["#dfe4e1", "#f1ece1"], sun: "#edc489", far: "#a6aca7", mid: "#6a706b", near: "#393f3b", water: "#7d958c", accent: "#d3a166", kind: "mountain" },
  quynhon: { sky: ["#d9edf1", "#f7f0df"], sun: "#f0b976", far: "#8bbdc1", mid: "#36828b", near: "#1f5961", water: "#2fa0ad", accent: "#ecc17a", kind: "coast" },
  default: { sky: ["#dce9e1", "#f6efe3"], sun: "#eab27a", far: "#9bb2a3", mid: "#557a63", near: "#2c4b3a", water: "#477f72", accent: "#d5a06b", kind: "mountain" },
};

function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i++) value = (value * 31 + text.charCodeAt(i)) % 1000003;
  return value;
}

function seeded(seed: string, index: number): number {
  return ((hash(`${seed}:${index}`) % 1000) / 1000);
}

function mountains(theme: Theme, seed: string, variant: number): string {
  const base = 520 + (variant % 2) * 30;
  const counts = [5, 4, 6];
  return counts.map((count, layer) => {
    const y = base + layer * 70;
    let path = `M0 ${y + 60}`;
    for (let i = 0; i < count; i++) {
      const x = 90 + i * (1100 / count) + seeded(seed, layer * 10 + i) * 60;
      const peak = y - 120 - seeded(seed, layer * 20 + i) * (170 - layer * 30);
      path += ` Q ${x - 70} ${peak + 60} ${x} ${peak} Q ${x + 70} ${peak + 60} ${x + 130} ${y + 20}`;
    }
    path += ` L1200 800 L0 800 Z`;
    const colors = [theme.far, theme.mid, theme.near];
    return `<path d="${path}" fill="${colors[layer]}" opacity="${0.9 - layer * 0.06}"/>`;
  }).join("");
}

function coastScene(theme: Theme, seed: string, variant: number): string {
  const sunX = 760 + (variant % 2) * 120;
  return `
    <circle cx="${sunX}" cy="190" r="72" fill="${theme.sun}" opacity=".9"/>
    <ellipse cx="300" cy="180" rx="150" ry="26" fill="#ffffff" opacity=".35"/>
    <ellipse cx="930" cy="140" rx="120" ry="20" fill="#ffffff" opacity=".3"/>
    ${mountains(theme, seed, variant)}
    <rect x="0" y="620" width="1200" height="180" fill="${theme.water}" opacity=".92"/>
    ${[0, 1, 2, 3].map((i) => `<path d="M${60 + i * 260} ${675 + i * 22} q 60 -24 120 0 t 120 0" stroke="#ffffff" stroke-width="3" fill="none" opacity=".28"/>`).join("")}
    <path d="M0 620 Q 300 570 600 620 T 1200 610 L1200 800 L0 800 Z" fill="${theme.near}" opacity=".2"/>
    <path d="M120 690 h120 l-18 20 h-84 z" fill="#1c342c" opacity=".85"/>
    <rect x="168" y="588" width="8" height="104" fill="#1c342c" opacity=".85"/>
    <path d="M176 596 l64 88 h-64 z" fill="#f7f0df" opacity=".9"/>
  `;
}

function heritageScene(theme: Theme, seed: string, variant: number): string {
  const buildings = Array.from({ length: 7 }, (_, i) => {
    const width = 90 + seeded(seed, i) * 40;
    const x = 120 + i * 140;
    const height = 130 + seeded(seed, i + 10) * 90;
    return `<g><rect x="${x}" y="${560 - height}" width="${width}" height="${height}" fill="${i % 2 ? theme.mid : theme.near}" opacity=".9"/>
      <path d="M${x - 16} ${560 - height} L${x + width / 2} ${500 - height} L${x + width + 16} ${560 - height} Z" fill="${theme.near}"/>
      <rect x="${x + width / 2 - 8}" y="${560 - height + 50}" width="16" height="26" fill="${theme.accent}" opacity=".9"/>
      ${i % 2 === 0 ? `<circle cx="${x + width / 2}" cy="${560 - height + 26}" r="13" fill="${theme.accent}" opacity=".95"/>` : ""}
    </g>`;
  }).join("");
  return `
    <circle cx="900" cy="220" r="60" fill="${theme.sun}" opacity=".7"/>
    ${mountains(theme, seed, variant)}
    ${buildings}
    <rect x="0" y="650" width="1200" height="150" fill="${theme.water}" opacity=".85"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${180 + i * 170}" cy="${470 + (i % 2) * 30}" r="9" fill="${theme.accent}" opacity=".9"/>`).join("")}
    <path d="M0 650 q 300 30 600 0 t 600 10" stroke="${theme.accent}" stroke-width="2" fill="none" opacity=".5"/>
  `;
}

function riverScene(theme: Theme, seed: string, variant: number): string {
  return `
    <circle cx="260" cy="180" r="64" fill="${theme.sun}" opacity=".85"/>
    ${mountains(theme, seed, variant)}
    <rect x="0" y="620" width="1200" height="180" fill="${theme.water}" opacity=".9"/>
    <path d="M0 610 q 300 40 600 0 t 600 20" stroke="${theme.far}" stroke-width="6" fill="none" opacity=".4"/>
    <path d="M180 690 h150 l-24 26 h-102 z" fill="#2a4236"/>
    <rect x="248" y="640" width="6" height="50" fill="#2a4236"/>
    <path d="M254 644 l-42 46 h42 z" fill="#f4ecdd" opacity=".9"/>
    <path d="M760 720 h120 l-20 22 h-80 z" fill="#1f3a2e"/>
    <rect x="816" y="676" width="6" height="44" fill="#1f3a2e"/>
    <path d="M822 680 l38 40 h-38 z" fill="#f4ecdd" opacity=".85"/>
    ${[0, 1, 2, 3].map((i) => `<path d="M${420 + i * 120} ${650 + i * 15} q 30 -12 60 0" stroke="#fff" stroke-width="2" fill="none" opacity=".25"/>`).join("")}
  `;
}

function mountainScene(theme: Theme, seed: string, variant: number): string {
  return `
    <circle cx="${850 - variant * 80}" cy="170" r="58" fill="${theme.sun}" opacity=".8"/>
    <ellipse cx="330" cy="300" rx="230" ry="34" fill="#ffffff" opacity=".26"/>
    <ellipse cx="860" cy="360" rx="260" ry="28" fill="#ffffff" opacity=".2"/>
    ${mountains(theme, seed, variant)}
    <path d="M0 640 Q 200 560 400 620 T 800 600 T 1200 630 L1200 800 L0 800 Z" fill="${theme.near}" opacity=".55"/>
    ${[0, 1, 2, 3].map((i) => `<path d="M${70 + i * 300} ${700 + i * 10} q 80 -40 160 0" stroke="${theme.accent}" stroke-width="3" fill="none" opacity=".35"/>`).join("")}
    ${[0, 1, 2].map((i) => `<path d="M${180 + i * 320} 640 l 18 -70 l 18 70 z" fill="#20382b" opacity=".7"/>`).join("")}
  `;
}

interface CoverArtProps {
  seed: string;
  variant?: number;
  className?: string;
  alt?: string;
  style?: CSSProperties;
}

export function CoverArt({ seed, variant = 0, className = "", alt = "", style }: CoverArtProps) {
  const key = seed.replace(/^art:/, "").toLowerCase();
  const theme = THEMES[key] || THEMES.default;
  const id = `cover-${key.replace(/[^a-z0-9]/g, "")}-${variant}`;
  const scene = theme.kind === "coast" ? coastScene(theme, key, variant)
    : theme.kind === "heritage" ? heritageScene(theme, key, variant)
      : theme.kind === "river" ? riverScene(theme, key, variant)
        : mountainScene(theme, key, variant);
  return (
    <svg
      className={`cover-art ${className}`.trim()}
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      role={alt ? "img" : "presentation"}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      style={style}
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={theme.sky[0]} />
          <stop offset="100%" stopColor={theme.sky[1]} />
        </linearGradient>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={theme.water} />
          <stop offset="100%" stopColor={theme.near} />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill={`url(#${id}-sky)`} />
      <g dangerouslySetInnerHTML={{ __html: scene }} />
      <rect width="1200" height="800" fill={`url(#${id}-water)`} opacity="0" />
    </svg>
  );
}

export function TourCover({ cover, seed, alt, variant = 0, className = "" }: {
  cover: string | null | undefined;
  seed: string;
  alt: string;
  variant?: number;
  className?: string;
}) {
  if (cover && (cover.startsWith("http") || cover.startsWith("data:"))) {
    return <img className={`cover-img ${className}`.trim()} src={cover} alt={alt} loading="lazy" decoding="async" />;
  }
  return <CoverArt seed={cover?.replace(/^art:/, "") || seed} variant={variant} alt={alt} className={className} />;
}
