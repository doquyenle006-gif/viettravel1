import crypto from "node:crypto";

export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function nowIso() {
  return new Date().toISOString();
}

export function todayVN(at = new Date()) {
  return new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Business date (Asia/Ho_Chi_Minh) of an ISO instant. */
export function vnDateOf(iso) {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function dayNumber(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function addDays(isoDate, days) {
  return new Date((dayNumber(isoDate) + days) * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromDate, toDate) {
  return dayNumber(toDate) - dayNumber(fromDate);
}

/** End of the given business date in Vietnam time, expressed as a UTC instant. */
export function endOfDayVN(isoDate) {
  return new Date(dayNumber(isoDate) * DAY_MS + DAY_MS - VN_OFFSET_MS - 1000).toISOString();
}

export function addHoursIso(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 3600 * 1000).toISOString();
}

export function money(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

export function roundUpTo(n, step) {
  return Math.ceil(Number(n || 0) / step) * step;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function idNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export function deepClone(value) {
  return structuredClone(value);
}

export function publicId(prefix = "") {
  return prefix + crypto.randomBytes(6).toString("hex");
}

export function bookingCode(date = new Date()) {
  const y = String(date.getUTCFullYear()).slice(-2);
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 5; i++) tail += alphabet[crypto.randomInt(0, alphabet.length)];
  return `VT${y}${m}${d}-${tail}`;
}

export function longCode(prefix = "VT") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function hmac(value, secret) {
  return crypto.createHmac("sha256", secret).update(String(value)).digest("hex");
}

export function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/* ---------- password hashing (scrypt) ---------- */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function maskDocument(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length <= 4) return "••••";
  return `••••${text.slice(-4)}`;
}

export function maskEmail(email) {
  const [name, domain] = String(email).split("@");
  if (!domain) return "•••";
  return `${name.slice(0, 2)}•••@${domain}`;
}

export function ageOn(dob, onDate) {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export function classifyPassenger(dob, departureDate, infantMax, childMax) {
  const age = ageOn(dob, departureDate);
  if (age < infantMax) return "infant";
  if (age < childMax) return "child";
  return "adult";
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email)) && String(email).length <= 254;
}

export function normalizePhone(phone) {
  let p = String(phone ?? "").replace(/[\s.\-()]/g, "");
  if (p.startsWith("+84")) p = `0${p.slice(3)}`;
  else if (p.startsWith("84") && p.length >= 10) p = `0${p.slice(2)}`;
  return p;
}

export function validatePhone(phone) {
  return /^0\d{8,10}$/.test(normalizePhone(phone));
}

export function normalizeCoupon(code) {
  return String(code ?? "").trim().toUpperCase();
}

export function parsePage(query, defaultPerPage = 12) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const perPage = clamp(parseInt(query.perPage, 10) || defaultPerPage, 1, 100);
  return { page, perPage };
}

export function paginate(items, page, perPage) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  return {
    rows: items.slice((safePage - 1) * perPage, safePage * perPage),
    meta: { page: safePage, perPage, total, totalPages },
  };
}

export function includesSearch(haystack, needle) {
  if (!needle) return true;
  return normalizeText(haystack).includes(normalizeText(needle));
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(",")}}`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatVndServer(n) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n || 0);
}
