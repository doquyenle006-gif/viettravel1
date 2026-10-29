import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.mjs";

export const BACKUP_DIR = path.join(DATA_DIR, "backups");
export const BACKUP_KEEP = Math.max(1, Number(process.env.VIETTRAILS_BACKUP_KEEP || 14));
export const BACKUP_INTERVAL_HOURS = Math.max(1, Number(process.env.VIETTRAILS_BACKUP_HOURS || 24));

const FILE_PATTERN = /^db-\d{8}T\d{9}Z\.json$/;
const REQUIRED_COLLECTIONS = ["destinations", "categories", "tours", "departures", "users", "bookings", "payments"];

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function timestamp(date = new Date()) {
  return date.toISOString().replace(/[-:.]/g, "");
}

function ensureDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
}

function safePath(filename) {
  if (!FILE_PATTERN.test(filename)) return null;
  const resolved = path.resolve(BACKUP_DIR, filename);
  if (!resolved.startsWith(`${BACKUP_DIR}${path.sep}`)) return null;
  return resolved;
}

function countsOf(db) {
  const counts = {};
  for (const [key, value] of Object.entries(db)) {
    if (Array.isArray(value)) counts[key] = value.length;
  }
  return counts;
}

export function listBackups() {
  ensureDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter((name) => FILE_PATTERN.test(name))
    .map((name) => {
      const file = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(file);
      return { filename: name, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function latestBackup() {
  return listBackups()[0] || null;
}

export function backupDue(now = Date.now()) {
  const latest = latestBackup();
  if (!latest) return true;
  return now - new Date(latest.createdAt).getTime() >= BACKUP_INTERVAL_HOURS * 3600 * 1000;
}

export function pruneBackups() {
  const backups = listBackups();
  const removed = [];
  for (const item of backups.slice(BACKUP_KEEP)) {
    fs.rmSync(path.join(BACKUP_DIR, item.filename), { force: true });
    removed.push(item.filename);
  }
  return removed;
}

/**
 * Write an atomic snapshot of the database, verify it can be parsed back and
 * return a checksum for the handoff/audit trail. Backups live outside db.json
 * and are ignored by Git (`server/data/`).
 */
export function createBackup(db, { reason = "manual", actorId = null } = {}) {
  ensureDir();
  const createdAt = new Date();
  const filename = `db-${timestamp(createdAt)}.json`;
  const target = path.join(BACKUP_DIR, filename);
  const body = JSON.stringify({ ...db, _backup: { reason, actorId, createdAt: createdAt.toISOString() } }, null, 2);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, target);

  const verification = verifyBackup(filename);
  if (!verification.valid) {
    fs.rmSync(target, { force: true });
    throw new Error(`Bản sao lưu không vượt qua kiểm tra: ${verification.errors.join("; ")}`);
  }
  const removed = pruneBackups();
  return {
    filename,
    path: target,
    size: fs.statSync(target).size,
    checksum: verification.checksum,
    createdAt: createdAt.toISOString(),
    reason,
    counts: verification.counts,
    removed,
  };
}

/**
 * Dry-run restore check: parse the snapshot and assert required collections
 * exist with the right shape. Never overwrites the live database.
 */
export function verifyBackup(filename) {
  const file = safePath(filename);
  if (!file || !fs.existsSync(file)) return { filename, valid: false, errors: ["Không tìm thấy tệp sao lưu."] };
  const errors = [];
  let parsed;
  let checksum = null;
  try {
    const text = fs.readFileSync(file, "utf8");
    checksum = sha256(text);
    parsed = JSON.parse(text);
  } catch (error) {
    return { filename, valid: false, errors: [`Không đọc được JSON: ${error.message}`] };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) errors.push("Nội dung không phải đối tượng cơ sở dữ liệu.");
  if (!parsed?.settings || typeof parsed.settings !== "object" || Array.isArray(parsed.settings)) errors.push("Thiếu bảng settings.");
  for (const key of REQUIRED_COLLECTIONS) {
    if (!Array.isArray(parsed?.[key])) errors.push(`Thiếu bảng ${key}.`);
  }
  if (!parsed?._seq || typeof parsed._seq !== "object") errors.push("Thiếu bộ đếm _seq.");
  const counts = parsed && typeof parsed === "object" ? countsOf(parsed) : {};
  return {
    filename,
    valid: errors.length === 0,
    errors,
    size: fs.statSync(file).size,
    checksum,
    createdAt: fs.statSync(file).mtime.toISOString(),
    counts,
  };
}
