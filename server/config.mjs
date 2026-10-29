import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Load `.env` once, without overriding variables the shell already set. */
function loadDotEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[0] === value.at(-1)) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

export const ROOT_DIR = ROOT;
export const DATA_DIR = process.env.VIETTRAILS_DATA_DIR
  ? path.resolve(process.env.VIETTRAILS_DATA_DIR)
  : path.join(ROOT, "server", "data");
export const DB_FILE = path.join(DATA_DIR, "db.json");

const DRIVERS = new Set(["mysql", "json"]);

function first(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

export function dbConfig(env = process.env) {
  const driver = String(env.VIETTRAILS_DB_DRIVER || "mysql").toLowerCase();
  if (!DRIVERS.has(driver)) {
    throw new Error(`VIETTRAILS_DB_DRIVER phải là "mysql" hoặc "json" (nhận được "${driver}").`);
  }
  // Dedicated schema: an existing `viettrails` DB from other prototypes is left untouched.
  const database = env.MYSQL_DATABASE || env.DB_NAME || "viettrails_app";
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`Tên cơ sở dữ liệu không hợp lệ: "${database}". Chỉ dùng chữ, số và dấu gạch dưới.`);
  }
  return {
    driver,
    dataDir: DATA_DIR,
    dbFile: DB_FILE,
    mysql: {
      host: first("MYSQL_HOST", "DB_HOST") || "127.0.0.1",
      port: Number(first("MYSQL_PORT", "DB_PORT") || 3306),
      user: first("MYSQL_USER", "DB_USER") || "root",
      password: env.MYSQL_PASSWORD ?? env.DB_PASSWORD ?? "",
      database,
      connectionLimit: Number(env.MYSQL_POOL_SIZE || 8),
    },
  };
}

export function describeDb(config) {
  if (config.driver === "json") return `JSON ${config.dbFile}`;
  const { host, port, database, user } = config.mysql;
  return `MySQL ${user}@${host}:${port}/${database}`;
}
