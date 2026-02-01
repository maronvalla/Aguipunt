// backend/db.js
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const initSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin'
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      dni TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      celular TEXT,
      puntos INT NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS prizes (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      costo_puntos INT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      customerid INT NOT NULL,
      type TEXT NOT NULL,
      operations INT,
      points INT NOT NULL,
      note TEXT,
      userid INT,
      username TEXT,
      voidedat TIMESTAMP,
      voidedbyuserid INT,
      voidreason TEXT,
      originaltransactionid INT,
      createdat TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_dni_unique ON customers(dni);
    CREATE INDEX IF NOT EXISTS idx_customers_nombre ON customers(nombre);
    CREATE INDEX IF NOT EXISTS idx_transactions_customerid ON transactions(customerid);
    CREATE INDEX IF NOT EXISTS idx_prizes_id ON prizes(id);
  `);

  const countRes = await pool.query("SELECT COUNT(1) AS count FROM users");
  const count = Number(countRes.rows?.[0]?.count || 0);
  if (count === 0) {
    const hashed = bcrypt.hashSync("admin", 10);
    await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
      ["admin", hashed]
    );
  }
};

initSchema().catch((err) => {
  console.error("[db] schema init failed:", err);
});

const normalizeArgs = (sql, params, cb) => {
  if (typeof params === "function") {
    return { sql, params: [], cb: params };
  }
  return { sql, params: params || [], cb };
};

function run(sql, params = [], cb) {
  const args = normalizeArgs(sql, params, cb);
  const promise = pool.query(args.sql, args.params);
  promise
    .then((result) => {
      const ctx = {
        lastID: result.rows?.[0]?.id ?? null,
        changes: result.rowCount ?? 0,
      };
      if (typeof args.cb === "function") args.cb.call(ctx, null, result);
    })
    .catch((err) => {
      const ctx = { lastID: null, changes: 0 };
      if (typeof args.cb === "function") args.cb.call(ctx, err);
    });
  return promise;
}

function get(sql, params = [], cb) {
  const args = normalizeArgs(sql, params, cb);
  const promise = pool.query(args.sql, args.params);
  promise
    .then((result) => {
      const row = result.rows?.[0] || null;
      if (typeof args.cb === "function") args.cb(null, row);
    })
    .catch((err) => {
      if (typeof args.cb === "function") args.cb(err);
    });
  return promise;
}

function all(sql, params = [], cb) {
  const args = normalizeArgs(sql, params, cb);
  const promise = pool.query(args.sql, args.params);
  promise
    .then((result) => {
      const rows = result.rows || [];
      if (typeof args.cb === "function") args.cb(null, rows);
    })
    .catch((err) => {
      if (typeof args.cb === "function") args.cb(err);
    });
  return promise;
}

const db = { get, all, run };
db.pool = pool;

module.exports = db;
