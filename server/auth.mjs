import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.mjs";
import { hmac, nowIso, randomToken, sha256, timingSafeEqual, verifyPassword } from "./util.mjs";
import { permissionsFor } from "./permissions.mjs";

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;

let cachedSecret = null;
export function authSecret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.AUTH_SECRET) {
    cachedSecret = process.env.AUTH_SECRET;
    return cachedSecret;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, ".auth-secret");
  if (fs.existsSync(file)) {
    cachedSecret = fs.readFileSync(file, "utf8").trim();
  } else {
    cachedSecret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

export function signAccess(userId, sessionId) {
  const payload = Buffer.from(JSON.stringify({
    uid: userId, sid: sessionId, exp: Date.now() + ACCESS_TTL_MS,
  })).toString("base64url");
  return `${payload}.${hmac(payload, authSecret())}`;
}

export function verifyAccessToken(db, token) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!timingSafeEqual(signature, hmac(payload, authSecret()))) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!data.exp || data.exp < Date.now()) return null;
  const session = db.sessions.find((s) => s.id === data.sid && !s.revokedAt);
  if (!session) return null;
  const user = db.users.find((u) => u.id === data.uid);
  if (!user || user.status !== "active") return null;
  return { user, session };
}

export function createSession(db, user, meta = {}) {
  const sid = randomToken(12);
  const secret = randomToken(32);
  const session = {
    id: sid,
    userId: user.id,
    refreshHash: sha256(secret),
    ip: meta.ip || null,
    userAgent: meta.userAgent || null,
    createdAt: nowIso(),
    lastActivityAt: nowIso(),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
    revokedAt: null,
  };
  db.sessions.push(session);
  return { session, refreshToken: `${sid}.${secret}`, accessToken: signAccess(user.id, sid) };
}

export function rotateRefresh(db, refreshToken, meta = {}) {
  if (!refreshToken || !refreshToken.includes(".")) return null;
  const [sid, secret] = refreshToken.split(".");
  const session = db.sessions.find((s) => s.id === sid);
  if (!session || session.revokedAt) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  if (!timingSafeEqual(session.refreshHash, sha256(secret))) return null;
  const user = db.users.find((u) => u.id === session.userId);
  if (!user || user.status !== "active") return null;
  const nextSecret = randomToken(32);
  session.refreshHash = sha256(nextSecret);
  session.lastActivityAt = nowIso();
  session.ip = meta.ip || session.ip;
  session.userAgent = meta.userAgent || session.userAgent;
  return {
    user, session,
    refreshToken: `${sid}.${nextSecret}`,
    accessToken: signAccess(user.id, sid),
  };
}

export function revokeSession(db, sessionId, userId = null) {
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return false;
  if (userId !== null && session.userId !== userId) return false;
  session.revokedAt = nowIso();
  return true;
}

export function revokeAllSessions(db, userId) {
  let count = 0;
  for (const session of db.sessions) {
    if (session.userId === userId && !session.revokedAt) {
      session.revokedAt = nowIso();
      count++;
    }
  }
  return count;
}

export function sanitizeUser(db, user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    roles: user.roles,
    primaryRole: user.roles[0] || "customer",
    permissions: permissionsFor(user.roles),
    emailVerified: Boolean(user.emailVerifiedAt),
    emailVerifiedAt: user.emailVerifiedAt,
    status: user.status,
    marketingConsent: user.marketingConsent,
    mfaEnabled: Boolean(user.mfaEnabled),
    createdAt: user.createdAt,
  };
}

export function checkUserPassword(user, password) {
  return verifyPassword(password, user.passwordHash);
}

export function isCommonPassword(password) {
  const common = new Set([
    "12345678", "123456789", "password", "matkhau123", "qwerty123", "11111111",
    "abc12345", "viettrails", "demo1234", "iloveyou", "admin123",
  ]);
  return common.has(String(password).toLowerCase());
}

/* ---------------- TOTP (RFC 6238) ---------------- */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = B32.indexOf(char);
    if (idx === -1) throw new Error("Mã bí mật 2FA không hợp lệ");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totpCode(secret, timestamp = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(timestamp / 1000 / step);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function verifyTotp(secret, code, window = 1) {
  if (!secret || !/^\d{6}$/.test(String(code || "").trim())) return false;
  const target = String(code).trim();
  for (let offset = -window; offset <= window; offset++) {
    if (totpCode(secret, Date.now() + offset * 30000) === target) return true;
  }
  return false;
}

export function newTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}
