import { createSeed } from "./seed.mjs";

/**
 * MySQL schema for the document-shaped application store.
 *
 * Every collection keeps its natural primary key plus a `sort_index` (array
 * order is part of the API behaviour) and a `doc` JSON column for nested,
 * null-only or newly added fields. Scalar fields that exist in the seed are
 * promoted to typed columns so the tables are readable/queryable in
 * phpMyAdmin without giving up the flexible in-memory model the app uses.
 */

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const BOUNDED = /(code|slug|email|phone|status|type|method|provider|currency|purpose|channel|severity|priority|gender|nationality|region|role|unit|category|plate|taxCode|invoiceNo|tokenHash|payloadHash|merchantRef|providerTxnId|entity|eventId|key)$/i;

const SQL_TYPES = {
  bool: "TINYINT(1)",
  int: "BIGINT",
  double: "DOUBLE",
  ts: "VARCHAR(32)",
  date: "VARCHAR(10)",
  enum: "VARCHAR(255)",
  text: "TEXT",
};

/** Fields for collections the seed leaves empty (shapes taken from the writers). */
const EXPLICIT = {
  sessions: {
    id: "enum", userId: "int", refreshHash: "enum", ip: "enum", userAgent: "text",
    createdAt: "ts", lastActivityAt: "ts", expiresAt: "ts", revokedAt: "ts",
  },
  authTokens: {
    id: "int", userId: "int", purpose: "enum", tokenHash: "enum",
    expiresAt: "ts", usedAt: "ts", createdAt: "ts",
  },
  changeRequests: {
    id: "int", bookingId: "int", type: "enum", status: "enum", requestedBy: "int",
    decidedBy: "int", decisionNote: "text", createdAt: "ts", updatedAt: "ts",
  },
  couponUsages: {
    id: "int", couponId: "int", userId: "int", bookingId: "int",
    discountAmount: "int", usedAt: "ts", voidedAt: "ts",
  },
  invoices: {
    id: "int", bookingId: "int", taxCode: "enum", companyName: "text", address: "text",
    email: "enum", invoiceNo: "enum", issuedAt: "ts", status: "enum",
    requestedAt: "ts", note: "text",
  },
  costs: {
    id: "int", departureId: "int", supplierId: "int", category: "enum",
    amount: "int", note: "text", createdAt: "ts",
  },
  incidents: {
    id: "int", departureId: "int", type: "enum", severity: "enum", description: "text",
    status: "enum", reportedBy: "int", createdAt: "ts", resolvedAt: "ts",
  },
  credits: {
    id: "int", userId: "int", amount: "int", remaining: "int",
    expiresAt: "ts", createdAt: "ts", note: "text",
  },
  creditHistory: {
    id: "int", creditId: "int", amount: "int", type: "enum", note: "text", createdAt: "ts",
  },
  idempotency: {
    id: "int", key: "enum", userId: "int", payloadHash: "enum", createdAt: "ts",
  },
  webhookEvents: {
    id: "int", provider: "enum", eventId: "enum", merchantRef: "enum",
    providerTxnId: "enum", amount: "int", status: "enum", result: "enum",
    processedAt: "ts", createdAt: "ts",
  },
  alerts: {
    id: "int", type: "enum", severity: "enum", message: "text", entity: "enum",
    entityId: "int", status: "enum", createdAt: "ts", resolvedAt: "ts",
  },
  waitlist: { id: "int" },
};

/** Extra column for null-only fields that still benefit from being queryable. */
const FORCED = {
  bookings: { cancelReasonCode: "enum", cancelBy: "enum", cancelledAt: "ts" },
  payments: { updatedAt: "ts", confirmedBy: "int" },
  tickets: { assignedTo: "int" },
};

const INDEX_SUFFIX = /Id$/;
const INDEX_EXACT = new Set(["code", "slug", "email", "status", "key", "eventId", "merchantRef"]);

function inferKind(values) {
  const present = values.filter((value) => value !== null && value !== undefined);
  if (!present.length) return null;
  if (present.every((value) => typeof value === "boolean")) return "bool";
  if (present.every((value) => typeof value === "number" && Number.isFinite(value))) {
    return present.every(Number.isInteger) ? "int" : "double";
  }
  if (present.every((value) => typeof value === "string")) {
    if (present.every((value) => ISO_DATETIME.test(value))) return "ts";
    if (present.every((value) => DATE_ONLY.test(value))) return "date";
    return null; // resolved from the field name below
  }
  return null;
}

function kindFor(field, values) {
  const inferred = inferKind(values);
  if (inferred) return inferred;
  const present = values.filter((value) => value !== null && value !== undefined);
  // Mixed or nested values stay in `doc` untouched.
  if (!present.length || !present.every((value) => typeof value === "string")) return null;
  return BOUNDED.test(field) ? "enum" : "text";
}

function sqlType(kind, field) {
  if (field === "id" && kind === "enum") return "VARCHAR(64)";
  return SQL_TYPES[kind];
}

function buildDefinition(name, rows, explicit, forced) {
  // Only fields present on every seed row become columns: promoting a sparse
  // field would invent `null` keys for the rows that never had it.
  const present = rows.length
    ? Object.keys(rows[0]).filter((key) => rows.every((row) => key in row))
    : [];

  const fields = new Map();
  for (const key of present) fields.set(key, undefined);
  for (const [key, kind] of Object.entries(explicit || {})) fields.set(key, kind);
  for (const [key, kind] of Object.entries(forced || {})) {
    if (fields.has(key)) fields.set(key, kind);
  }

  const types = {};
  for (const field of fields.keys()) {
    const values = rows.map((row) => row[field]);
    const kind = fields.get(field) || kindFor(field, values);
    if (!kind) continue;
    types[field] = kind;
  }
  if (!types.id) types.id = "int";

  const columns = Object.keys(types);
  const indexes = columns.filter((column) => column !== "id"
    && types[column] !== "text"
    && (INDEX_SUFFIX.test(column) || INDEX_EXACT.has(column)));

  return { name, table: name, types, columns, indexes, pkKind: types.id };
}

export function buildSchema() {
  const seed = createSeed();
  const schema = {};
  for (const [name, rows] of Object.entries(seed)) {
    if (!Array.isArray(rows)) continue;
    schema[name] = buildDefinition(name, rows, EXPLICIT[name], FORCED[name]);
  }
  return schema;
}

export function columnSql(def, column) {
  return sqlType(def.types[column], column);
}

export function createTableSql(def) {
  const lines = [
    `\`id\` ${sqlType(def.types.id, "id")} NOT NULL`,
    "`sort_index` INT NOT NULL",
  ];
  for (const column of def.columns) {
    if (column === "id") continue;
    lines.push(`\`${column}\` ${sqlType(def.types[column], column)} NULL`);
  }
  lines.push("`doc` JSON NOT NULL");
  lines.push("PRIMARY KEY (`id`)");
  for (const column of def.indexes) {
    lines.push(`KEY \`idx_${def.table}_${column}\` (\`${column}\`)`);
  }
  return `CREATE TABLE IF NOT EXISTS \`${def.table}\` (\n  ${lines.join(",\n  ")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
}

const CONFORMS = {
  bool: (value) => typeof value === "boolean",
  int: (value) => typeof value === "number" && Number.isFinite(value) && Number.isInteger(value),
  double: (value) => typeof value === "number" && Number.isFinite(value),
  ts: (value) => typeof value === "string",
  date: (value) => typeof value === "string",
  enum: (value) => typeof value === "string",
  text: (value) => typeof value === "string",
};

export function toSqlValue(kind, value) {
  if (value === null || value === undefined) return null;
  if (kind === "bool") return value ? 1 : 0;
  if (kind === "int" || kind === "double") return Number(value);
  return String(value);
}

export function fromSqlValue(kind, value) {
  if (value === null || value === undefined) return value;
  if (kind === "bool") return Boolean(value);
  if (kind === "int" || kind === "double") return Number(value);
  return value;
}

/**
 * Split an in-memory row into typed column values and the `doc` overflow.
 * A value that does not fit its column kind lands in `doc` instead of being
 * coerced/truncated, so a schema never loses data.
 */
export function splitRow(def, row) {
  const columns = new Array(def.columns.length);
  const doc = {};
  for (let index = 0; index < def.columns.length; index += 1) {
    const column = def.columns[index];
    const kind = def.types[column];
    const value = row[column];
    if (value === null || value === undefined) {
      columns[index] = null;
    } else if (CONFORMS[kind](value)) {
      columns[index] = toSqlValue(kind, value);
    } else {
      columns[index] = null;
      doc[column] = value;
    }
  }
  for (const [key, value] of Object.entries(row)) {
    if (!(key in def.types)) doc[key] = value;
  }
  return { columns, doc };
}

export function mergeRow(def, dbRow, doc) {
  const row = { id: fromSqlValue(def.types.id, dbRow.id) };
  for (const column of def.columns) {
    if (column === "id") continue;
    const value = fromSqlValue(def.types[column], dbRow[column]);
    if (value === null || value === undefined) {
      row[column] = doc && column in doc ? doc[column] : null;
    } else {
      row[column] = value;
    }
  }
  for (const [key, value] of Object.entries(doc || {})) {
    if (!(key in def.types)) row[key] = value;
  }
  return row;
}
