import type { CSSProperties } from "react";

export type IconName =
  | "clock" | "check" | "check-circle" | "x" | "x-circle" | "alert" | "info" | "calendar"
  | "users" | "chevron-left" | "chevron-right" | "chevron-down" | "arrow-right" | "arrow-left"
  | "star" | "search" | "menu" | "phone" | "mail" | "map-pin" | "ticket" | "credit-card"
  | "download" | "eye" | "eye-off" | "lock" | "plus" | "minus" | "trash" | "edit" | "filter"
  | "copy" | "logout" | "settings" | "grid" | "book" | "flag" | "compass" | "shield" | "user"
  | "refresh" | "upload" | "printer" | "sun" | "wifi-off" | "file-text" | "trending" | "wallet"
  | "clipboard" | "message" | "chevron-up" | "external" | "sparkles" | "home" | "flash";

const PATHS: Record<IconName, string> = {
  clock: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  check: "M5 12l5 5L20 7",
  "check-circle": "M9 12l2 2 4-5M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  x: "M6 6l12 12M18 6L6 18",
  "x-circle": "M15 9l-6 6M9 9l6 6M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z",
  info: "M12 16v-5M12 8h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  "chevron-left": "M15 18l-6-6 6-6",
  "chevron-right": "M9 18l6-6-6-6",
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-up": "M18 15l-6-6-6 6",
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  "arrow-left": "M19 12H5M11 18l-6-6 6-6",
  star: "M12 2.5l2.9 6 6.6.9-4.8 4.7 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.4l6.6-.9 2.9-6z",
  search: "M21 21l-4.35-4.35M19 11a8 8 0 11-16 0 8 8 0 0116 0z",
  menu: "M4 6h16M4 12h16M4 18h16",
  phone: "M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 10a16 16 0 006 6l1.4-1.3a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z",
  mail: "M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zM22 6l-10 7L2 6",
  "map-pin": "M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1118 0zM12 13a3 3 0 100-6 3 3 0 000 6z",
  ticket: "M2 9a3 3 0 010-6h20a3 3 0 010 6v6a3 3 0 010 6H2a3 3 0 010-6V9zM13 5v2M13 17v2M13 11v2",
  "credit-card": "M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2zM1 10h22",
  download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 100-6 3 3 0 000 6z",
  "eye-off": "M17.9 17.9A10.4 10.4 0 0112 20C5 20 1 12 1 12a18.5 18.5 0 015.1-5.9M9.9 4.2A9.1 9.1 0 0112 4c7 0 11 8 11 8a18.6 18.6 0 01-2.2 3.2M14.1 14.1a3 3 0 11-4.2-4.2M1 1l22 22",
  lock: "M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2zM7 11V7a5 5 0 0110 0v4",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  trash: "M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6",
  edit: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  filter: "M22 3H2l8 9.5V19l4 2v-8.5L22 3z",
  copy: "M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  book: "M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 016.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z",
  flag: "M4 22V4a6 6 0 016 0 6 6 0 006 0v10a6 6 0 01-6 0 6 6 0 00-6 0",
  compass: "M12 22a10 10 0 100-20 10 10 0 000 20zM16.2 7.8l-2.3 6.1-6.1 2.3 2.3-6.1 6.1-2.3z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  refresh: "M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15",
  upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  printer: "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z",
  sun: "M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  "wifi-off": "M1 1l22 22M16.7 16.7a6 6 0 00-9.4 0M5 12.9a11 11 0 015.2-2.7M2 8.8a16 16 0 014.2-2.3M12 20h.01M19.8 15.2a16 16 0 00-2.6-2.1M22 8.8a16 16 0 00-8-4.5",
  "file-text": "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  trending: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  wallet: "M21 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 000 4h4v-4h-4z",
  clipboard: "M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 2h6a1 1 0 011 1v3a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z",
  message: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z",
  external: "M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3",
  sparkles: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 17l.9 2.1L22 20l-2.1.9L19 23l-.9-2.1L16 20l2.1-.9L19 17z",
  home: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  flash: "M13 2L3 14h8l-1 8 10-12h-8l1-8z",
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, className = "", strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ "--icon-size": `${size}px` } as CSSProperties}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
