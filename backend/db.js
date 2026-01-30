// backend/db.js
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.SQLITE_PATH || "./aguipuntos.db";

// Asegurar que exista el directorio donde vive la DB (ej: /data en Railway)
const dir = path.dirname(DB_PATH);
if (dir && dir !== "." && !fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Abrir DB
const db = new Database(DB_PATH);

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

// Si tu app usaba db.serialize, con better-sqlite3 no hace falta.
// Pero para no romper código existente, lo dejamos como un wrapper.
function serialize(fn) {
  if (typeof fn === "function") fn();
}

module.exports = {
  db,        // acceso directo si lo necesitás
  run,
  get,
  all,
  serialize,
};

