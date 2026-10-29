import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.mjs";
import { closeDb, flushDb, getDb, initDb, saveDb } from "./db.mjs";
import { sweepDb } from "./domain.mjs";
import { backupDue, createBackup } from "./backup.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "script-src 'self'",
    "connect-src 'self'",
    "frame-src https://www.openstreetmap.org https://www.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "));
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function siteBase(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return `http://${req.headers.host || `${HOST}:${PORT}`}`;
}

function renderSitemap(req) {
  const db = getDb();
  const base = siteBase(req);
  const urls = [
    { loc: "/", changefreq: "weekly", priority: "1.0" },
    { loc: "/tours", changefreq: "daily", priority: "0.9" },
    { loc: "/destinations", changefreq: "weekly", priority: "0.7" },
    { loc: "/danh-muc", changefreq: "monthly", priority: "0.6" },
    { loc: "/contact", changefreq: "monthly", priority: "0.4" },
  ];
  for (const tour of db.tours) {
    if (tour.status !== "published") continue;
    urls.push({ loc: `/tours/${tour.slug}`, lastmod: (tour.updatedAt || tour.createdAt || "").slice(0, 10), changefreq: "weekly", priority: "0.8" });
  }
  for (const destination of db.destinations) {
    if (destination.active === false) continue;
    urls.push({ loc: `/destinations/${destination.slug}`, changefreq: "monthly", priority: "0.6" });
  }
  for (const category of db.categories) {
    if (category.active === false) continue;
    urls.push({ loc: `/categories/${category.slug}`, changefreq: "monthly", priority: "0.5" });
  }
  for (const page of db.contentPages || []) {
    if (page.active === false) continue;
    urls.push({ loc: `/policies/${page.slug}`, lastmod: (page.updatedAt || "").slice(0, 10), changefreq: "yearly", priority: "0.3" });
  }
  const body = urls.map((item) => [
    "  <url>",
    `    <loc>${escapeXml(base + item.loc)}</loc>`,
    item.lastmod ? `    <lastmod>${escapeXml(item.lastmod)}</lastmod>` : null,
    item.changefreq ? `    <changefreq>${item.changefreq}</changefreq>` : null,
    item.priority ? `    <priority>${item.priority}</priority>` : null,
    "  </url>",
  ].filter(Boolean).join("\n")).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function renderRobots(req) {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /account",
    "Disallow: /checkout",
    "Disallow: /booking/",
    "Disallow: /payment/",
    "Disallow: /dev-outbox",
    "Disallow: /api/",
    `Sitemap: ${siteBase(req)}/sitemap.xml`,
    "",
  ].join("\n");
}

function serveText(res, req, type, body) {
  const buffer = Buffer.from(body, "utf8");
  res.writeHead(200, {
    "Content-Type": `${type}; charset=utf-8`,
    "Content-Length": buffer.length,
    "Cache-Control": "public, max-age=3600",
  });
  if (req.method === "HEAD") res.end();
  else res.end(buffer);
}

async function runScheduledBackup() {
  try {
    if (!backupDue()) return;
    const db = getDb();
    const result = createBackup(db, { reason: "automatic" });
    console.log(`[backup] created ${result.filename} (${result.size} bytes)`);
  } catch (error) {
    console.error("[backup]", error);
    try {
      const db = getDb();
      const id = (db._seq.alerts = (db._seq.alerts || 0) + 1);
      db.alerts.push({
        id, type: "backup.failed", severity: "danger",
        message: `Sao lưu tự động thất bại: ${error.message}`,
        entity: "system", entityId: "backup", meta: null, status: "open",
        createdAt: new Date().toISOString(), resolvedAt: null,
      });
      saveDb();
      await flushDb();
    } catch (nested) {
      console.error("[backup-alert]", nested);
    }
  }
}

function serveStatic(req, res, pathname) {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }
  let relative;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    relative = pathname;
  }
  if (relative === "/" || relative === "") relative = "/index.html";
  let filePath = path.resolve(DIST, `.${relative}`);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (path.extname(relative)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    filePath = path.join(DIST, "index.html");
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html lang="vi"><meta charset="utf-8"><title>VietTrails</title>
      <body style="font-family:system-ui;padding:40px;max-width:640px;margin:auto">
      <h1>VietTrails chưa được build</h1>
      <p>Chạy <code>npm run build</code> rồi khởi động lại, hoặc dùng <code>npm run dev</code> để phát triển.</p>
      <p>API đang chạy tại <code>/api/v1</code>.</p></body></html>`);
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  const cache = filePath.includes(`${path.sep}assets${path.sep}`)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": cache,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

let startup;
try {
  startup = await initDb();
} catch (error) {
  console.error(`[db] ${error.message}`);
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/sitemap.xml" || url.pathname === "/robots.txt") {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method not allowed");
      return;
    }
    if (url.pathname === "/robots.txt") serveText(res, req, "text/plain", renderRobots(req));
    else serveText(res, req, "application/xml", renderSitemap(req));
    return;
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    try {
      const handled = await handleApi(req, res);
      if (!handled) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Không tìm thấy API." } }));
      }
    } catch (error) {
      console.error("[server]", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Có lỗi hệ thống." } }));
      }
    }
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, async () => {
  const db = getDb();
  if (sweepDb(db)) {
    saveDb();
    await flushDb();
  }
  console.log(`VietTrails API + static server: http://${HOST}:${PORT}`);
  console.log(`API base: http://${HOST}:${PORT}/api/v1`);
  console.log(`Dữ liệu: ${startup.description} (${startup.source})`);
  if (!fs.existsSync(DIST)) console.log("Chưa có thư mục dist — dùng npm run dev hoặc npm run build.");
  setTimeout(() => { runScheduledBackup().catch((error) => console.error("[backup]", error)); }, 1500).unref?.();
  setInterval(() => { runScheduledBackup().catch((error) => console.error("[backup]", error)); }, 60 * 60 * 1000).unref?.();
});

setInterval(async () => {
  try {
    const db = getDb();
    if (sweepDb(db)) {
      saveDb();
      await flushDb();
    }
  } catch (error) {
    console.error("[sweep-interval]", error);
  }
}, 60000).unref?.();

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  const force = setTimeout(() => process.exit(0), 5000);
  force.unref?.();
  server.close(async () => {
    try {
      await closeDb();
    } catch (error) {
      console.error("[shutdown]", error);
    }
    clearTimeout(force);
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
