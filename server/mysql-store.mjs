import mysql from "mysql2/promise";
import { buildSchema, columnSql, createTableSql, mergeRow, splitRow } from "./schema.mjs";

const META_TABLE = "vt_meta";
const SETTINGS_TABLE = "settings";
const CHUNK_VALUES = 20000;

function parseJsonColumn(value) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function keyOf(value) {
  return String(value);
}

function emptyState() {
  return { collections: new Map(), settings: new Map(), meta: new Map() };
}

function chunked(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

async function upsertRows(connection, def, values) {
  const columns = [...def.columns, "doc", "sort_index"];
  const list = def.columns.map((column) => `\`${column}\``).join(", ");
  const updates = [...def.columns.filter((column) => column !== "id"), "doc", "sort_index"]
    .map((column) => `\`${column}\`=VALUES(\`${column}\`)`)
    .join(", ");
  const perRow = columns.length;
  const size = Math.max(1, Math.min(CHUNK_VALUES, Math.floor(60000 / perRow)));
  for (const batch of chunked(values, size)) {
    await connection.query(
      `INSERT INTO \`${def.table}\` (${list}, \`doc\`, \`sort_index\`) VALUES ? ON DUPLICATE KEY UPDATE ${updates}`,
      [batch],
    );
  }
}

function snapshotCollection(def, rows) {
  const current = new Map();
  const upserts = [];
  rows.forEach((row, index) => {
    const key = keyOf(row.id);
    const json = JSON.stringify(row);
    const before = current.get(key);
    if (before && before.json !== json) {
      throw new Error(`Trùng khóa ${def.name}.id=${key} trong bộ nhớ.`);
    }
    current.set(key, { json, sortIndex: index });
    const split = splitRow(def, row);
    upserts.push({ key, json, sortIndex: index, values: [...split.columns, JSON.stringify(split.doc), index] });
  });
  return { current, upserts };
}

/**
 * MySQL/MariaDB store used by the running API. Reads happen from the
 * in-memory snapshot (the domain layer is synchronous); every mutation is
 * flushed as one SQL transaction before the HTTP response is written.
 */
export async function createMysqlStore(config) {
  const { host, port, user, password, database, connectionLimit } = config.mysql;

  const admin = await mysql.createConnection({ host, port, user, password });
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await admin.end();
  }

  const pool = await mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    charset: "utf8mb4",
    connectionLimit,
    waitForConnections: true,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    multipleStatements: false,
  });

  const schema = buildSchema();
  const definitions = Object.values(schema);
  const byName = new Map(definitions.map((def) => [def.name, def]));
  let persisted = emptyState();

  async function columnsOf(connection, table) {
    const [rows] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
    return new Map(rows.map((row) => [row.Field, row]));
  }

  async function assertCompatible(connection, table, required) {
    const columns = await columnsOf(connection, table);
    const missing = required.filter((column) => !columns.has(column));
    if (missing.length) {
      throw new Error(
        `Bảng \`${table}\` đã tồn tại nhưng khác schema VietTrails (thiếu ${missing.join(", ")}). `
        + "Hãy đặt MYSQL_DATABASE sang schema khác hoặc sao lưu rồi xóa bảng cũ.",
      );
    }
    return columns;
  }

  async function ensureTables(connection = pool) {
    for (const def of definitions) {
      await connection.query(createTableSql(def));
      const columns = await assertCompatible(connection, def.table, ["id", "sort_index", "doc"]);
      const idType = String(columns.get("id").Type || "").toLowerCase();
      if (!idType.startsWith(columnSql(def, "id").toLowerCase())) {
        throw new Error(
          `Khóa chính của bảng \`${def.table}\` là ${columns.get("id").Type}, cần ${columnSql(def, "id")}. `
          + "Hãy xóa bảng (hoặc chọn MYSQL_DATABASE khác) để tạo lại schema.",
        );
      }
      for (const column of def.columns) {
        if (!columns.has(column)) {
          await connection.query(`ALTER TABLE \`${def.table}\` ADD COLUMN \`${column}\` ${columnSql(def, column)} NULL`);
        }
      }
    }
    await connection.query(`CREATE TABLE IF NOT EXISTS \`${SETTINGS_TABLE}\` (
  \`k\` VARCHAR(191) NOT NULL,
  \`sort_index\` INT NOT NULL,
  \`doc\` JSON NOT NULL,
  PRIMARY KEY (\`k\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await connection.query(`CREATE TABLE IF NOT EXISTS \`${META_TABLE}\` (
  \`k\` VARCHAR(64) NOT NULL,
  \`v\` JSON NOT NULL,
  PRIMARY KEY (\`k\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await assertCompatible(connection, SETTINGS_TABLE, ["k", "sort_index", "doc"]);
    await assertCompatible(connection, META_TABLE, ["k", "v"]);
  }

  await ensureTables();

  async function isEmpty() {
    const [rows] = await pool.query(`SELECT 1 FROM \`${META_TABLE}\` LIMIT 1`);
    return rows.length === 0;
  }

  async function load() {
    if (await isEmpty()) {
      persisted = emptyState();
      return null;
    }
    const db = { settings: {} };
    for (const def of definitions) {
      const [rows] = await pool.query(`SELECT * FROM \`${def.table}\` ORDER BY \`sort_index\` ASC, \`id\` ASC`);
      const collection = [];
      const map = new Map();
      rows.forEach((dbRow, index) => {
        const row = mergeRow(def, dbRow, parseJsonColumn(dbRow.doc));
        collection.push(row);
        map.set(keyOf(row.id), { json: JSON.stringify(row), sortIndex: index });
      });
      db[def.name] = collection;
      persisted.collections.set(def.name, map);
    }

    const [settingRows] = await pool.query(`SELECT * FROM \`${SETTINGS_TABLE}\` ORDER BY \`sort_index\` ASC, \`k\` ASC`);
    const settingMap = new Map();
    settingRows.forEach((row) => {
      db.settings[row.k] = parseJsonColumn(row.doc);
      settingMap.set(keyOf(row.k), { json: JSON.stringify(db.settings[row.k]), sortIndex: row.sort_index });
    });
    persisted.settings = settingMap;

    const [metaRows] = await pool.query(`SELECT \`k\`, \`v\` FROM \`${META_TABLE}\``);
    const metaMap = new Map();
    for (const row of metaRows) {
      const value = parseJsonColumn(row.v);
      metaMap.set(row.k, { json: JSON.stringify(value) });
      if (row.k === "version") db.version = value;
      else if (row.k === "createdAt") db.createdAt = value;
      else if (row.k === "seq") db._seq = value;
    }
    db.version ??= 1;
    db.createdAt ??= new Date().toISOString();
    db._seq ??= {};
    persisted.meta = metaMap;
    return db;
  }

  /** Compute the diff synchronously, then write it in a single transaction. */
  async function flush(db) {
    const changes = [];
    for (const def of definitions) {
      const rows = db[def.name] || [];
      const { current, upserts } = snapshotCollection(def, rows);
      const previous = persisted.collections.get(def.name) || new Map();
      const changed = [];
      const upsertByKey = new Map(upserts.map((item) => [item.key, item]));
      for (const [key, entry] of current) {
        const before = previous.get(key);
        if (!before || before.json !== entry.json || before.sortIndex !== entry.sortIndex) {
          const upsert = upsertByKey.get(key);
          if (upsert) changed.push(upsert);
        }
      }
      const deletes = [];
      for (const key of previous.keys()) {
        if (!current.has(key)) deletes.push(key);
      }
      if (changed.length || deletes.length) {
        changes.push({ def, changed, deletes, current });
      }
    }

    const settings = [];
    Object.entries(db.settings || {}).forEach(([key, entry], index) => {
      const json = JSON.stringify(entry);
      const before = persisted.settings.get(keyOf(key));
      if (!before || before.json !== json || before.sortIndex !== index) {
        settings.push({ key: keyOf(key), json, sortIndex: index, doc: JSON.stringify(entry) });
      }
    });
    const settingDeletes = [];
    for (const key of persisted.settings.keys()) {
      if (!(key in (db.settings || {}))) settingDeletes.push(key);
    }

    const meta = [];
    for (const [key, value] of [["version", db.version], ["createdAt", db.createdAt], ["seq", db._seq]]) {
      const json = JSON.stringify(value ?? null);
      const before = persisted.meta.get(key);
      if (!before || before.json !== json) meta.push({ key, json });
    }

    if (!changes.length && !settings.length && !settingDeletes.length && !meta.length) return false;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const change of changes) {
        if (change.changed.length) await upsertRows(connection, change.def, change.changed.map((item) => item.values));
        if (change.deletes.length) {
          await connection.query(
            `DELETE FROM \`${change.def.table}\` WHERE \`id\` IN (?)`,
            [change.deletes],
          );
        }
      }
      if (settings.length) {
        const rows = settings.map((item) => [item.key, item.sortIndex, item.doc]);
        await connection.query(
          `INSERT INTO \`${SETTINGS_TABLE}\` (\`k\`, \`sort_index\`, \`doc\`) VALUES ? ON DUPLICATE KEY UPDATE \`sort_index\`=VALUES(\`sort_index\`), \`doc\`=VALUES(\`doc\`)`,
          [rows],
        );
      }
      if (settingDeletes.length) {
        await connection.query(`DELETE FROM \`${SETTINGS_TABLE}\` WHERE \`k\` IN (?)`, [settingDeletes]);
      }
      if (meta.length) {
        await connection.query(
          `INSERT INTO \`${META_TABLE}\` (\`k\`, \`v\`) VALUES ? ON DUPLICATE KEY UPDATE \`v\`=VALUES(\`v\`)`,
          [meta.map((item) => [item.key, item.json])],
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally {
      connection.release();
    }

    for (const change of changes) {
      const map = persisted.collections.get(change.def.name) || new Map();
      for (const item of change.changed) map.set(item.key, { json: item.json, sortIndex: item.sortIndex });
      for (const key of change.deletes) map.delete(key);
      persisted.collections.set(change.def.name, map);
    }
    for (const item of settings) persisted.settings.set(item.key, { json: item.json, sortIndex: item.sortIndex });
    for (const key of settingDeletes) persisted.settings.delete(key);
    for (const item of meta) persisted.meta.set(item.key, { json: item.json });
    return true;
  }

  async function writeAll(db) {
    persisted = emptyState();
    await flush(db);
  }

  async function reset() {
    const connection = await pool.getConnection();
    try {
      for (const def of definitions) await connection.query(`DROP TABLE IF EXISTS \`${def.table}\``);
      await connection.query(`DROP TABLE IF EXISTS \`${SETTINGS_TABLE}\``);
      await connection.query(`DROP TABLE IF EXISTS \`${META_TABLE}\``);
    } finally {
      connection.release();
    }
    await ensureTables();
    persisted = emptyState();
  }

  async function rowCount() {
    let total = 0;
    for (const def of definitions) {
      const [rows] = await pool.query(`SELECT COUNT(*) AS n FROM \`${def.table}\``);
      total += Number(rows[0].n);
    }
    return total;
  }

  async function close() {
    await pool.end();
  }

  return {
    driver: "mysql",
    schema,
    definition: (name) => byName.get(name),
    isEmpty,
    load,
    flush,
    writeAll,
    reset,
    rowCount,
    close,
  };
}
