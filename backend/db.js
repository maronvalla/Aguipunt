// backend/db.js
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "data", "aguipuntos.db");
const FALLBACK_DB_PATH = path.join(__dirname, "data", "aguipuntos.db");

// Abrir DB con fallback
let db;
let finalPath = DB_PATH;
try {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
} catch (err) {
  console.error("[db] open failed:", err);
  try {
    fs.mkdirSync(path.dirname(FALLBACK_DB_PATH), { recursive: true });
    db = new Database(FALLBACK_DB_PATH);
    finalPath = FALLBACK_DB_PATH;
  } catch (fallbackErr) {
    console.error("[db] fallback open failed:", fallbackErr);
    throw fallbackErr;
  }
}
console.log("[db] using:", finalPath);

// Ensure required tables exist
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin'
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dni TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      celular TEXT,
      puntos INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS prizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      costo_puntos INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL,
      type TEXT NOT NULL,
      operations INTEGER,
      points INTEGER NOT NULL,
      note TEXT,
      userId INTEGER,
      userName TEXT,
      voidedAt TEXT,
      voidedByUserId INTEGER,
      voidReason TEXT,
      originalTransactionId INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
} catch (err) {
  console.error("[db] schema init failed:", err);
}

// Performance indexes
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_customers_dni ON customers(dni);
    CREATE INDEX IF NOT EXISTS idx_customers_nombre ON customers(nombre);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_transactions_customerId ON transactions(customerId);
    CREATE INDEX IF NOT EXISTS idx_prizes_id ON prizes(id);
  `);
} catch (err) {
  console.error("[db] index init failed:", err);
}

// Seed default admin only if table is empty
try {
  const row = db.prepare("SELECT COUNT(1) AS count FROM users").get();
  if (row && row.count === 0) {
    const hashed = bcrypt.hashSync("admin", 10);
    db.prepare(
      "INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')"
    ).run("admin", hashed);
  }
} catch (err) {
  // Keep startup resilient; auth will surface DB issues if any
  console.error("DB seed error:", err);
}

// Helpers compatibles con el estilo sqlite3 (callbacks)
function run(sql, params = [], cb) {
  try {
    const info = db.prepare(sql).run(params);
    if (typeof cb === "function") cb(null, info);
    return info;
  } catch (err) {
    if (typeof cb === "function") cb(err);
    throw err;
  }
}

function get(sql, params = [], cb) {
  try {
    const row = db.prepare(sql).get(params);
    if (typeof cb === "function") cb(null, row);
    return row;
  } catch (err) {
    if (typeof cb === "function") cb(err);
    throw err;
  }
}

function all(sql, params = [], cb) {
  try {
    const rows = db.prepare(sql).all(params);
    if (typeof cb === "function") cb(null, rows);
    return rows;
  } catch (err) {
    if (typeof cb === "function") cb(err);
    throw err;
  }
}

// Compat: algunos códigos llamaban db.serialize(fn)
function serialize(fn) {
  if (typeof fn === "function") fn();
}

module.exports = {
  db,
  run,
  get,
  all,
  serialize,
};
