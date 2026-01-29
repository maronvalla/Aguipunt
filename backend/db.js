const sqlite3 = require("sqlite3").verbose();
const dbPath = process.env.SQLITE_PATH || "./aguipuntos.db";
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
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

  db.all("PRAGMA table_info(users)", (err, rows) => {
    if (err || !rows) return;
    const cols = rows.map((r) => r.name);
    if (!cols.includes("role")) {
      db.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
    }
    db.run("UPDATE users SET role = 'admin' WHERE role IS NULL");
    db.run("UPDATE users SET role = 'admin' WHERE username = 'Admin' OR id = 1");
  });

  db.all("PRAGMA table_info(transactions)", (err, rows) => {
    if (err || !rows) return;
    const cols = rows.map((r) => r.name);
    if (!cols.includes("userId")) {
      db.run("ALTER TABLE transactions ADD COLUMN userId TEXT");
    }
    if (!cols.includes("userName")) {
      db.run("ALTER TABLE transactions ADD COLUMN userName TEXT");
    }
    if (!cols.includes("voidedAt")) {
      db.run("ALTER TABLE transactions ADD COLUMN voidedAt TEXT");
    }
    if (!cols.includes("voidedByUserId")) {
      db.run("ALTER TABLE transactions ADD COLUMN voidedByUserId TEXT");
    }
    if (!cols.includes("voidReason")) {
      db.run("ALTER TABLE transactions ADD COLUMN voidReason TEXT");
    }
    if (!cols.includes("originalTransactionId")) {
      db.run("ALTER TABLE transactions ADD COLUMN originalTransactionId INTEGER");
    }
  });

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
});

module.exports = db;
