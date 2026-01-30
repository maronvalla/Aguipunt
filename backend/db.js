const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.SQLITE_PATH || "./aguipuntos.db";

// crear carpeta si no existe
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);


const Database = require("better-sqlite3");
const DB_PATH = process.env.SQLITE_PATH || "./aguipuntos.db";
const db = new Database(DB_PATH);

function normalizeArgs(params, callback) {
  if (typeof params === "function") {
    return { params: undefined, callback: params };
  }
  return { params, callback };
}

db.run = (sql, params, callback) => {
  const normalized = normalizeArgs(params, callback);
  try {
    const stmt = db.prepare(sql);
    const info =
      normalized.params === undefined ? stmt.run() : stmt.run(normalized.params);
    if (normalized.callback) {
      normalized.callback.call(
        { lastID: info.lastInsertRowid, changes: info.changes },
        null
      );
    }
    return info;
  } catch (err) {
    if (normalized.callback) {
      normalized.callback(err);
      return undefined;
    }
    throw err;
  }
};

db.get = (sql, params, callback) => {
  const normalized = normalizeArgs(params, callback);
  try {
    const stmt = db.prepare(sql);
    const row =
      normalized.params === undefined ? stmt.get() : stmt.get(normalized.params);
    if (normalized.callback) {
      normalized.callback(null, row);
    }
    return row;
  } catch (err) {
    if (normalized.callback) {
      normalized.callback(err);
      return undefined;
    }
    throw err;
  }
};

db.all = (sql, params, callback) => {
  const normalized = normalizeArgs(params, callback);
  try {
    const stmt = db.prepare(sql);
    const rows =
      normalized.params === undefined ? stmt.all() : stmt.all(normalized.params);
    if (normalized.callback) {
      normalized.callback(null, rows);
    }
    return rows;
  } catch (err) {
    if (normalized.callback) {
      normalized.callback(err);
      return undefined;
    }
    throw err;
  }
};

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    password TEXT,
    role TEXT NOT NULL DEFAULT 'admin'
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dni TEXT UNIQUE,
    nombre TEXT,
    celular TEXT,
    puntos INTEGER DEFAULT 0
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS prizes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    costo_puntos INTEGER
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customerId INTEGER NOT NULL,
    type TEXT NOT NULL,
    operations INTEGER NULL,
    points INTEGER NOT NULL,
    note TEXT NULL,
    userId TEXT NULL,
    userName TEXT NULL,
    voidedAt TEXT NULL,
    voidedByUserId TEXT NULL,
    voidReason TEXT NULL,
    originalTransactionId INTEGER NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const userCols = db
  .prepare("PRAGMA table_info(users)")
  .all()
  .map((r) => r.name);
if (!userCols.includes("role")) {
  db.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
}
db.run("UPDATE users SET role = 'admin' WHERE role IS NULL");
db.run("UPDATE users SET role = 'admin' WHERE username = 'Admin' OR id = 1");

const transactionCols = db
  .prepare("PRAGMA table_info(transactions)")
  .all()
  .map((r) => r.name);
if (!transactionCols.includes("userId")) {
  db.run("ALTER TABLE transactions ADD COLUMN userId TEXT");
}
if (!transactionCols.includes("userName")) {
  db.run("ALTER TABLE transactions ADD COLUMN userName TEXT");
}
if (!transactionCols.includes("voidedAt")) {
  db.run("ALTER TABLE transactions ADD COLUMN voidedAt TEXT");
}
if (!transactionCols.includes("voidedByUserId")) {
  db.run("ALTER TABLE transactions ADD COLUMN voidedByUserId TEXT");
}
if (!transactionCols.includes("voidReason")) {
  db.run("ALTER TABLE transactions ADD COLUMN voidReason TEXT");
}
if (!transactionCols.includes("originalTransactionId")) {
  db.run("ALTER TABLE transactions ADD COLUMN originalTransactionId INTEGER");
}

db.run(`
  CREATE INDEX IF NOT EXISTS idx_transactions_customer_created
  ON transactions (customerId, createdAt DESC)
`);

db.run(`
  INSERT OR IGNORE INTO users (id, username, password)
  VALUES (1, 'Admin', '1234')
`);

db.run(`
  INSERT OR IGNORE INTO prizes (id, nombre, costo_puntos) VALUES
  (1, 'CafÃ© Gratis', 100),
  (2, 'Descuento 10%', 200),
  (3, 'Producto Gratis', 500)
`);

module.exports = db;
