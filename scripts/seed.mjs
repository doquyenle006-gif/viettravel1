import { createSeed } from "../server/seed.mjs";
import { createJsonStore } from "../server/json-store.mjs";
import { createMysqlStore } from "../server/mysql-store.mjs";
import { dbConfig, describeDb } from "../server/config.mjs";

const force = process.argv.includes("--force");
const config = dbConfig();
const target = describeDb(config);

if (config.driver === "mysql") {
  const store = await createMysqlStore(config);
  try {
    const empty = await store.isEmpty();
    if (!empty && !force) {
      console.log(`Đã có dữ liệu trong ${target}. Dùng --force để tạo lại.`);
    } else {
      if (force) await store.reset();
      const db = createSeed();
      await store.writeAll(db);
      const rows = await store.rowCount();
      console.log(`Đã ghi dữ liệu mẫu vào ${target} (${rows} dòng, ${Object.keys(store.schema).length} bảng).`);
    }
  } finally {
    await store.close();
  }
} else {
  const store = createJsonStore(config);
  if (!(await store.isEmpty()) && !force) {
    console.log(`Đã có dữ liệu tại ${config.dbFile}. Dùng --force để tạo lại.`);
  } else {
    if (force) await store.reset();
    store.save(createSeed());
    console.log(`Đã tạo dữ liệu mẫu tại ${config.dbFile}.`);
  }
  await store.close();
}
