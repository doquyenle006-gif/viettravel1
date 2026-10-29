import fs from "node:fs";
import { createSeed } from "./seed.mjs";
import { dbConfig, describeDb } from "./config.mjs";
import { createJsonStore } from "./json-store.mjs";
import { createMysqlStore } from "./mysql-store.mjs";

let db = null;
let config = null;
let store = null;
let dirty = false;
let flushing = Promise.resolve();
let info = null;

function readLegacyJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Không đọc được ${file}: ${error.message}`);
  }
}

/**
 * Open the configured store and load the working set. Must be awaited before
 * `getDb()`/the HTTP server: reads stay synchronous, writes are flushed before
 * each API response.
 */
export async function initDb() {
  if (db) return info;
  config = dbConfig();

  if (config.driver === "mysql") {
    try {
      store = await createMysqlStore(config);
    } catch (error) {
      throw new Error(
        `Không khởi tạo được kho MySQL tại ${config.mysql.host}:${config.mysql.port} (user ${config.mysql.user}). `
        + `Hãy bật MySQL trong XAMPP và kiểm tra MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWORD trong .env. `
        + `Chi tiết: ${error.message}`,
      );
    }
    const loaded = await store.load();
    if (loaded) {
      db = loaded;
      info = { driver: "mysql", source: "mysql", description: describeDb(config) };
    } else {
      const legacy = readLegacyJson(config.dbFile);
      db = legacy || createSeed();
      await store.writeAll(db);
      info = {
        driver: "mysql",
        source: legacy ? "db.json" : "seed",
        description: describeDb(config),
      };
    }
    return info;
  }

  store = createJsonStore(config);
  const loaded = await store.load();
  if (loaded) {
    db = loaded;
    info = { driver: "json", source: "json", description: describeDb(config) };
  } else {
    db = createSeed();
    store.save(db);
    info = { driver: "json", source: "seed", description: describeDb(config) };
  }
  return info;
}

export function getDb() {
  if (!db) throw new Error("Cơ sở dữ liệu chưa khởi tạo: phải await initDb() trước khi đọc.");
  return db;
}

export function saveDb() {
  if (!db) return;
  if (config?.driver === "json") {
    store.save(db);
    return;
  }
  dirty = true;
}

/** Await all pending MySQL writes (no-op for the JSON driver). */
export async function flushDb() {
  if (!store || config?.driver !== "mysql") return false;
  const run = flushing.then(async () => {
    let wrote = false;
    while (dirty) {
      dirty = false;
      try {
        if (await store.flush(db)) wrote = true;
      } catch (error) {
        dirty = true;
        throw error;
      }
    }
    return wrote;
  });
  flushing = run.catch(() => {});
  return run;
}

export function reloadDb() {
  if (config?.driver === "json" && store) db = store.loadSync();
  return db;
}

export async function closeDb() {
  if (!store) return;
  await flushDb();
  await store.close();
  store = null;
  db = null;
}

export function nextId(collection) {
  const database = getDb();
  database._seq[collection] = (database._seq[collection] || 0) + 1;
  return database._seq[collection];
}

/**
 * Run a synchronous mutation as one unit. The whole DB is snapshotted; any
 * thrown error restores the previous state so money/seat changes never half-apply.
 */
export function tx(fn) {
  const database = getDb();
  const backup = structuredClone(database);
  try {
    const result = fn(database);
    saveDb();
    return result;
  } catch (error) {
    db = backup;
    throw error;
  }
}

export function resetForTests(seed) {
  db = seed;
  dirty = false;
}
