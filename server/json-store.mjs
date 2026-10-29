import fs from "node:fs";

/** File-backed store kept as a development/test fallback (`VIETTRAILS_DB_DRIVER=json`). */
export function createJsonStore(config) {
  const { dataDir, dbFile } = config;

  function read() {
    if (!fs.existsSync(dbFile)) return null;
    return JSON.parse(fs.readFileSync(dbFile, "utf8"));
  }

  function write(db) {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${dbFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tmp, dbFile);
  }

  return {
    driver: "json",
    async isEmpty() {
      return !fs.existsSync(dbFile);
    },
    async load() {
      return read();
    },
    loadSync() {
      return read();
    },
    save(db) {
      write(db);
    },
    async writeAll(db) {
      write(db);
    },
    async reset() {
      fs.rmSync(dbFile, { force: true });
    },
    async flush() {
      return false;
    },
    async close() {},
  };
}
