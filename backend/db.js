// backend/db.js
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "data", "aguipuntos.db");

// Asegurar que exista el directorio donde vive la DB (ej: /data en Railway)
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Abrir DB
console.log("[db] using DB_PATH:", DB_PATH);
const db = new Database(DB_PATH);

// Ensure required tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin'
  );
`);

// Performance indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_customers_dni ON customers(dni);
  CREATE INDEX IF NOT EXISTS idx_customers_nombre ON customers(nombre);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_transactions_customerId ON transactions(customerId);
  CREATE INDEX IF NOT EXISTS idx_prizes_id ON prizes(id);
`);

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
