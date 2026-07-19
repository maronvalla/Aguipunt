const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const DEV_DB_PATH = path.join(__dirname, "dev-db.json");

const parseConnectionString = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isPlaceholderDatabaseUrl = (value) => {
  if (!value) return true;
  const parsed = parseConnectionString(value);
  if (!parsed) return true;

  const host = parsed.hostname || "";
  const pathname = parsed.pathname || "";

  return (
    host === "host" ||
    host === "localhost" && pathname === "/dbname" ||
    pathname === "/dbname"
  );
};

const createInitialState = () => ({
  users: [],
  customers: [],
  prizes: [],
  transactions: [],
  predictions: [],
  settings: [],
  counters: {
    users: 0,
    customers: 0,
    prizes: 0,
    transactions: 0,
    predictions: 0,
  },
});

const readDevState = () => {
  try {
    const raw = fs.readFileSync(DEV_DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...createInitialState(),
      ...parsed,
      counters: {
        ...createInitialState().counters,
        ...(parsed?.counters || {}),
      },
    };
  } catch {
    return createInitialState();
  }
};

let devState = readDevState();

const saveDevState = () => {
  fs.writeFileSync(DEV_DB_PATH, JSON.stringify(devState, null, 2));
};

const nextId = (table) => {
  devState.counters[table] = Number(devState.counters[table] || 0) + 1;
  return devState.counters[table];
};

const ensureDevAdminUser = () => {
  const existing = devState.users.find((user) => user.username === "admin");
  const hashed = bcrypt.hashSync("1234", 10);

  if (existing) {
    existing.password_hash = hashed;
    existing.role = "admin";
  } else {
    devState.users.push({
      id: nextId("users"),
      username: "admin",
      password_hash: hashed,
      role: "admin",
    });
  }

  saveDevState();
};

const ilike = (value, pattern) => {
  const normalized = String(value || "").toLowerCase();
  const test = String(pattern || "").toLowerCase().replaceAll("%", "");
  return normalized.includes(test);
};

const toIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const withinRange = (value, start, end) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (start && date < new Date(start)) return false;
  if (end && date >= new Date(end)) return false;
  return true;
};

const sortByText = (a, b, selector) =>
  String(selector(a) || "").localeCompare(String(selector(b) || ""), "es", {
    sensitivity: "base",
  });

const createDevResult = (rows) => ({
  rows,
  rowCount: rows.length,
});

const queryLoadTransactions = (params, { includeCustomerJoin = false } = {}) => {
  const [start, end, maybeUser] = params;
  const rows = devState.transactions
    .filter((tx) => tx.type === "LOAD" && !tx.voidedat && withinRange(tx.createdat, start, end))
    .filter((tx) => {
      if (params.length < 3) return true;
      return tx.userid === maybeUser || tx.username === maybeUser;
    })
    .sort((a, b) => new Date(b.createdat) - new Date(a.createdat))
    .map((tx) => {
      const customer = devState.customers.find((item) => item.id === tx.customerid);
      const base = {
        id: tx.id,
        createdAt: toIso(tx.createdat),
        points: tx.points,
        operations: tx.operations,
        userId: tx.userid,
        userName: tx.username,
      };
      if (!includeCustomerJoin) return base;
      return {
        ...base,
        customerId: tx.customerid,
        customerDni: customer?.dni || null,
        customerName: customer?.nombre || null,
      };
    });

  return createDevResult(rows);
};

const queryRedeemSummary = (params, includePrizeDetails) => {
  const [start, end, maybeUser] = params;
  const filtered = devState.transactions.filter((tx) => {
    if (tx.type !== "REDEEM" || tx.voidedat) return false;
    if (!withinRange(tx.createdat, start, end)) return false;
    if (params.length < 3) return true;
    return tx.userid === maybeUser || tx.username === maybeUser;
  });

  if (includePrizeDetails) {
    const grouped = new Map();
    for (const tx of filtered) {
      const isPrize =
        tx.redeemmode === "PRIZE" ||
        (!tx.redeemmode &&
          devState.prizes.some((prize) => prize.nombre === tx.note));
      if (!isPrize) continue;
      const prize = devState.prizes.find((item) => item.id === tx.prizeid) ||
        devState.prizes.find((item) => item.nombre === tx.note);
      const key = `${tx.userid ?? "null"}__${tx.username ?? "null"}__${prize?.nombre || tx.note || "Premio"}`;
      const current = grouped.get(key) || {
        userId: tx.userid ?? null,
        userName: tx.username || null,
        prizeName: prize?.nombre || tx.note || "Premio",
        redemptionsCount: 0,
        redeemedPoints: 0,
      };
      current.redemptionsCount += 1;
      current.redeemedPoints += Math.abs(Number(tx.points || 0));
      grouped.set(key, current);
    }
    return createDevResult(
      [...grouped.values()].sort((a, b) => b.redeemedPoints - a.redeemedPoints || sortByText(a, b, (row) => row.prizeName))
    );
  }

  const grouped = new Map();
  for (const tx of filtered) {
    const key = `${tx.userid ?? "null"}__${tx.username ?? "null"}`;
    const current = grouped.get(key) || {
      userId: tx.userid ?? null,
      userName: tx.username || null,
      customRedeemedPoints: 0,
      prizeRedemptionsCount: 0,
    };
    const isCustom =
      tx.redeemmode === "CUSTOM" ||
      (!tx.redeemmode && tx.note === "Canje personalizado");
    const isPrize =
      tx.redeemmode === "PRIZE" ||
      (!tx.redeemmode &&
        devState.prizes.some((prize) => prize.nombre === tx.note));
    if (isCustom) current.customRedeemedPoints += Math.abs(Number(tx.points || 0));
    if (isPrize) current.prizeRedemptionsCount += 1;
    grouped.set(key, current);
  }
  return createDevResult(
    [...grouped.values()].sort(
      (a, b) =>
        b.customRedeemedPoints - a.customRedeemedPoints ||
        b.prizeRedemptionsCount - a.prizeRedemptionsCount ||
        sortByText(a, b, (row) => row.userName)
    )
  );
};

const queryCustomerTransactions = (sql, params) => {
  const customerId = params[0];
  const isTypeFiltered = /type = \$2/.test(sql);
  const fromMatch = sql.includes("date(createdat) >= date(");
  const toMatch = sql.includes("date(createdat) <= date(");

  let cursor = 1;
  const type = isTypeFiltered ? params[++cursor - 0] : null;
  const from = fromMatch ? params[++cursor - 0] : null;
  const to = toMatch ? params[++cursor - 0] : null;
  const limit = params[params.length - 2];
  const offset = params[params.length - 1];
  const asc = /ORDER BY createdAt ASC/i.test(sql);

  const rows = devState.transactions
    .filter((tx) => tx.customerid === customerId)
    .filter((tx) => !type || tx.type === type)
    .filter((tx) => {
      const day = toIso(tx.createdat)?.slice(0, 10);
      if (!day) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    })
    .sort((a, b) =>
      asc
        ? new Date(a.createdat) - new Date(b.createdat)
        : new Date(b.createdat) - new Date(a.createdat)
    )
    .slice(offset, offset + limit)
    .map((tx) => ({
      id: tx.id,
      customerId: tx.customerid,
      type: tx.type,
      operations: tx.operations,
      points: tx.points,
      note: tx.note,
      userId: tx.userid,
      userName: tx.username,
      voidedAt: tx.voidedat || null,
      voidedByUserId: tx.voidedbyuserid || null,
      voidReason: tx.voidreason || null,
      originalTransactionId: tx.originaltransactionid || null,
      createdAt: toIso(tx.createdat),
    }));

  return createDevResult(rows);
};

const queryPredictions = (params = []) => {
  let search = null;
  let searchDni = null;
  let outcome = null;
  let argentinaGoals = null;
  let jordaniaGoals = null;

  if (params.length === 1) {
    [outcome] = params;
  } else if (params.length >= 2) {
    const maybeSearch = typeof params[0] === "string" && String(params[0]).includes("%");
    if (maybeSearch) {
      [search, searchDni] = params;
      if (params.length >= 3) outcome = params[2];
      if (params.length >= 4) argentinaGoals = params[3];
      if (params.length >= 5) jordaniaGoals = params[4];
    } else {
      outcome = params[0] ?? null;
      if (params.length >= 2) argentinaGoals = params[1];
      if (params.length >= 3) jordaniaGoals = params[2];
    }
  }

  return createDevResult(
    [...devState.predictions]
      .filter((item) => {
        if (!search) return true;
        return (
          ilike(item.customer_name_snapshot, search) ||
          ilike(item.customer_dni_snapshot, searchDni || search)
        );
      })
      .filter((item) => {
        if (!outcome) return true;
        return item.predicted_outcome === outcome;
      })
      .filter((item) => {
        if (argentinaGoals === null || argentinaGoals === undefined) return true;
        return Number(item.argentina_goals) === Number(argentinaGoals);
      })
      .filter((item) => {
        if (jordaniaGoals === null || jordaniaGoals === undefined) return true;
        return Number(item.jordania_goals) === Number(jordaniaGoals);
      })
      .sort((a, b) => new Date(b.createdat) - new Date(a.createdat))
      .map((item) => ({
        id: item.id,
        customerId: item.customerid,
        customerName: item.customer_name_snapshot,
        customerDni: item.customer_dni_snapshot,
        matchKey: item.match_key,
        matchLabel: item.match_label,
        matchDate: item.match_date,
        predictedOutcome: item.predicted_outcome,
        argentinaGoals: item.argentina_goals,
        jordaniaGoals: item.jordania_goals,
        createdAt: toIso(item.createdat),
        userId: item.userid,
        userName: item.username,
      }))
  );
};

const runDevQuery = async (sql, params = []) => {
  const normalized = sql.replace(/\s+/g, " ").trim();

  if (normalized.startsWith("INSERT INTO users")) {
    const username = params[0];
    const existing = devState.users.find((user) => user.username === username);
    if (existing) return createDevResult([]);
    const user = {
      id: nextId("users"),
      username,
      password_hash: params[1],
      role: params[2] || "admin",
    };
    devState.users.push(user);
    saveDevState();
    return createDevResult([{ id: user.id }]);
  }

  if (normalized.startsWith("UPDATE users SET password_hash =")) {
    const [passwordHash, id] = params;
    const user = devState.users.find((item) => item.id === id);
    if (!user) return { rows: [], rowCount: 0 };
    user.password_hash = passwordHash;
    saveDevState();
    return { rows: [], rowCount: 1 };
  }

  if (normalized.startsWith("UPDATE users SET password_hash =") && normalized.includes("role = 'admin'")) {
    const [passwordHash, id] = params;
    const user = devState.users.find((item) => item.id === id);
    if (!user) return { rows: [], rowCount: 0 };
    user.password_hash = passwordHash;
    user.role = "admin";
    saveDevState();
    return { rows: [], rowCount: 1 };
  }

  if (normalized.startsWith("DELETE FROM users WHERE id =")) {
    const id = params[0];
    const before = devState.users.length;
    devState.users = devState.users.filter((user) => user.id !== id);
    saveDevState();
    return { rows: [], rowCount: before - devState.users.length };
  }

  if (normalized.startsWith("DELETE FROM settings WHERE key =")) {
    const key = params[0];
    const before = devState.settings.length;
    devState.settings = devState.settings.filter((item) => item.key !== key);
    saveDevState();
    return { rows: [], rowCount: before - devState.settings.length };
  }

  if (normalized.startsWith("INSERT INTO settings")) {
    const [key, value] = params;
    const existing = devState.settings.find((item) => item.key === key);
    if (existing) {
      existing.value = value;
    } else {
      devState.settings.push({ key, value });
    }
    saveDevState();
    return createDevResult([]);
  }

  if (normalized.startsWith("INSERT INTO customers")) {
    const customer = {
      id: nextId("customers"),
      dni: params[0],
      nombre: params[1],
      celular: params[2] || null,
      puntos: Number(params[3] || 0),
      createdat: params[4] || new Date().toISOString(),
    };
    devState.customers.push(customer);
    saveDevState();
    return createDevResult([{ id: customer.id }]);
  }

  if (normalized.startsWith("UPDATE customers SET puntos =")) {
    const [points, idOrDni] = params;
    const customer = normalized.includes("WHERE dni = $2")
      ? devState.customers.find((item) => item.dni === idOrDni)
      : devState.customers.find((item) => item.id === idOrDni);
    if (!customer) return { rows: [], rowCount: 0 };
    customer.puntos = Number(points);
    saveDevState();
    return { rows: [], rowCount: 1 };
  }

  if (normalized.startsWith("INSERT INTO prizes")) {
    const prize = {
      id: nextId("prizes"),
      nombre: params[0],
      costo_puntos: Number(params[1]),
    };
    devState.prizes.push(prize);
    saveDevState();
    return createDevResult([{ id: prize.id }]);
  }

  if (normalized.startsWith("UPDATE prizes SET nombre =")) {
    const [nombre, costo, id] = params;
    const prize = devState.prizes.find((item) => item.id === id);
    if (!prize) return { rows: [], rowCount: 0 };
    prize.nombre = nombre;
    prize.costo_puntos = Number(costo);
    saveDevState();
    return { rows: [], rowCount: 1 };
  }

  if (normalized.startsWith("DELETE FROM prizes WHERE id =")) {
    const id = params[0];
    const before = devState.prizes.length;
    devState.prizes = devState.prizes.filter((item) => item.id !== id);
    saveDevState();
    return { rows: [], rowCount: before - devState.prizes.length };
  }

  if (normalized.startsWith("INSERT INTO transactions")) {
    const tx = {
      id: nextId("transactions"),
      customerid: params[0],
      type: params[1],
      operations: params[2] ?? null,
      points: Number(params[3] || 0),
      note: params[4] ?? null,
      userid: params[5] ?? null,
      username: params[6] ?? null,
      redeemmode: params[7] ?? null,
      prizeid: params[8] ?? null,
      originaltransactionid: params[7] && normalized.includes("originaltransactionid") ? params[7] : null,
      createdat: params[params.length - 1] || new Date().toISOString(),
      voidedat: null,
      voidedbyuserid: null,
      voidreason: null,
    };
    if (normalized.includes("originaltransactionid")) {
      tx.originaltransactionid = params[7] ?? null;
      tx.createdat = params[8] || new Date().toISOString();
    }
    devState.transactions.push(tx);
    saveDevState();
    return createDevResult([{ id: tx.id }]);
  }

  if (normalized.startsWith("INSERT INTO predictions")) {
    const prediction = {
      id: nextId("predictions"),
      customerid: params[0],
      customer_name_snapshot: params[1],
      customer_dni_snapshot: params[2],
      match_key: params[3],
      match_label: params[4],
      match_date: params[5],
      predicted_outcome: params[6],
      argentina_goals: Number(params[7]),
      jordania_goals: Number(params[8]),
      createdat: params[9] || new Date().toISOString(),
      userid: params[10] ?? null,
      username: params[11] ?? null,
    };
    devState.predictions.push(prediction);
    saveDevState();
    return createDevResult([{ id: prediction.id }]);
  }

  if (normalized.startsWith("UPDATE transactions SET voidedat =")) {
    const [voidedAt, voidedByUserId, reason, id] = params;
    const tx = devState.transactions.find((item) => item.id === id);
    if (!tx) return { rows: [], rowCount: 0 };
    tx.voidedat = voidedAt;
    tx.voidedbyuserid = voidedByUserId;
    tx.voidreason = reason;
    saveDevState();
    return { rows: [], rowCount: 1 };
  }

  if (/^BEGIN$|^COMMIT$|^ROLLBACK$/i.test(normalized)) {
    return createDevResult([]);
  }

  if (normalized.startsWith("INSERT INTO customers (dni, nombre, celular, puntos)")) {
    for (const item of params) {
      void item;
    }
    return createDevResult([]);
  }

  throw new Error(`Unsupported dev query: ${normalized}`);
};

const getDevQuery = async (sql, params = []) => {
  const normalized = sql.replace(/\s+/g, " ").trim();

  if (normalized === "SELECT COUNT(1) AS count FROM users") {
    return { count: devState.users.length };
  }
  if (normalized.startsWith("SELECT id, username, password_hash, role FROM users WHERE username =")) {
    return devState.users.find((user) => user.username === params[0]) || null;
  }
  if (normalized.startsWith("SELECT id FROM users WHERE username =")) {
    const user = devState.users.find((item) => item.username === params[0]);
    return user ? { id: user.id } : null;
  }
  if (normalized.startsWith("SELECT value FROM settings WHERE key =")) {
    return devState.settings.find((item) => item.key === params[0]) || null;
  }
  if (normalized.startsWith("SELECT * FROM customers WHERE dni =")) {
    return devState.customers.find((item) => item.dni === params[0]) || null;
  }
  if (normalized.startsWith("SELECT * FROM customers WHERE id =")) {
    return devState.customers.find((item) => item.id === params[0]) || null;
  }
  if (normalized.startsWith("SELECT id, nombre, dni FROM customers WHERE id =")) {
    const customer = devState.customers.find((item) => item.id === params[0]);
    if (!customer) return null;
    return {
      id: customer.id,
      nombre: customer.nombre,
      dni: customer.dni,
    };
  }
  if (normalized.startsWith("SELECT * FROM prizes WHERE id =")) {
    return devState.prizes.find((item) => item.id === params[0]) || null;
  }
  if (normalized.startsWith("SELECT * FROM transactions WHERE id =")) {
    return devState.transactions.find((item) => item.id === params[0]) || null;
  }
  if (normalized.startsWith("SELECT COUNT(*) as total FROM customers")) {
    const matches = devState.customers.filter(
      (item) => ilike(item.nombre, params[0]) || ilike(item.dni, params[1])
    );
    return { total: matches.length };
  }
  if (normalized.startsWith("SELECT COALESCE(SUM(t.points), 0) AS total_points_loaded FROM transactions t")) {
    const total = queryLoadTransactions(params).rows.reduce((acc, row) => acc + Number(row.points || 0), 0);
    return { total_points_loaded: total };
  }
  if (normalized.startsWith("SELECT COUNT(1)::int AS \"chanceCount\" FROM transactions")) {
    const [customerId, start, end] = params;
    const chanceCount = devState.transactions.filter(
      (tx) =>
        tx.customerid === customerId &&
        tx.type === "LOAD" &&
        !tx.voidedat &&
        withinRange(tx.createdat, start, end)
    ).length;
    return { chanceCount };
  }
  if (normalized.startsWith("SELECT t.username, COALESCE(SUM(t.points), 0) AS total_points FROM transactions t")) {
    const grouped = new Map();
    for (const row of queryLoadTransactions(params).rows) {
      const key = row.userName || "";
      grouped.set(key, Number(grouped.get(key) || 0) + Number(row.points || 0));
    }
    const top = [...grouped.entries()]
      .sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    return { username: top[0] || null, total_points: top[1] };
  }

  throw new Error(`Unsupported dev get query: ${normalized}`);
};

const allDevQuery = async (sql, params = []) => {
  const normalized = sql.replace(/\s+/g, " ").trim();

  if (normalized.startsWith('SELECT t.userid AS "userId", t.username AS "userName", COALESCE(SUM(t.points), 0)::int AS "totalPoints"')) {
    const grouped = new Map();
    for (const row of queryLoadTransactions(params).rows) {
      if (!row.userName) continue;
      const key = `${row.userId ?? "null"}__${row.userName}`;
      const current = grouped.get(key) || {
        userId: row.userId ?? null,
        userName: row.userName,
        totalPoints: 0,
        loadCount: 0,
      };
      current.totalPoints += Number(row.points || 0);
      current.loadCount += 1;
      grouped.set(key, current);
    }
    return createDevResult(
      [...grouped.values()]
        .sort(
          (a, b) =>
            b.totalPoints - a.totalPoints ||
            b.loadCount - a.loadCount ||
            sortByText(a, b, (row) => row.userName)
        )
        .slice(0, 5)
    );
  }

  if (normalized.startsWith("SELECT id, username, role FROM users ORDER BY id ASC")) {
    return createDevResult([...devState.users].sort((a, b) => a.id - b.id).map(({ id, username, role }) => ({ id, username, role })));
  }
  if (normalized.startsWith("SELECT id, nombre, costo_puntos FROM prizes ORDER BY id ASC")) {
    return createDevResult([...devState.prizes].sort((a, b) => a.id - b.id));
  }
  if (normalized.startsWith("SELECT id, nombre, dni, puntos")) {
    const search = params.length > 2 ? params[0] : null;
    const limit = params[params.length - 2];
    const offset = params[params.length - 1];
    const rows = devState.customers
      .filter((item) => !search || ilike(item.nombre, params[0]) || ilike(item.dni, params[1]))
      .sort((a, b) => sortByText(a, b, (row) => row.nombre))
      .slice(offset, offset + limit)
      .map(({ id, nombre, dni, puntos, createdat }) => ({
        id,
        nombre,
        dni,
        puntos,
        createdAt: toIso(createdat),
      }));
    return createDevResult(rows);
  }
  if (normalized.startsWith("SELECT dni, nombre, celular, puntos FROM customers")) {
    const rows = devState.customers
      .filter((item) => !params.length || ilike(item.nombre, params[0]) || ilike(item.dni, params[1]))
      .sort((a, b) => sortByText(a, b, (row) => row.nombre))
      .map(({ dni, nombre, celular, puntos }) => ({ dni, nombre, celular, puntos }));
    return createDevResult(rows);
  }
  if (normalized.startsWith("SELECT id, customerid AS \"customerId\", customer_name_snapshot AS \"customerName\"")) {
    return queryPredictions(params);
  }
  if (normalized.startsWith("SELECT customer_name_snapshot AS \"customerName\", customer_dni_snapshot AS \"customerDni\"")) {
    return queryPredictions(params);
  }
  if (normalized.startsWith("SELECT id, customerid AS \"customerId\"")) {
    return queryCustomerTransactions(normalized, params);
  }
  if (normalized.startsWith("SELECT to_char(createdat")) {
    return queryCustomerTransactions(normalized, params);
  }
  if (normalized.startsWith("SELECT t.id, to_char(t.createdat")) {
    return queryLoadTransactions(params, { includeCustomerJoin: true });
  }
  if (normalized.startsWith("WITH raffle_entries AS")) {
    const [start, end] = params;
    const hasSearch =
      normalized.includes('e."customerName" ILIKE') ||
      normalized.includes("c.nombre ILIKE");
    const hasUserSearch = normalized.includes("e.\"userName\" ILIKE");
    let search = null;
    let userSearch = null;
    if (hasSearch) {
      search = params[2];
      if (hasUserSearch) userSearch = params[5];
    } else if (hasUserSearch) {
      userSearch = params[2];
    }

    const allEntries = devState.transactions
      .filter((tx) => tx.type === "LOAD" && !tx.voidedat && withinRange(tx.createdat, start, end))
      .sort((a, b) => new Date(a.createdat) - new Date(b.createdat) || a.id - b.id)
      .map((tx, index) => {
        const customer = devState.customers.find((item) => item.id === tx.customerid);
        return {
          id: tx.id,
          chanceNumber: index + 1,
          createdAt: toIso(tx.createdat),
          points: tx.points,
          operations: tx.operations,
          userId: tx.userid,
          userName: tx.username,
          customerId: tx.customerid,
          customerDni: customer?.dni || null,
          customerName: customer?.nombre || null,
          customerPhone: customer?.celular || null,
        };
      });

    const rows = allEntries
      .filter((row) => {
        if (!search) return true;
        return (
          ilike(row.customerName, search) ||
          ilike(row.customerDni, search) ||
          ilike(row.customerPhone, search)
        );
      })
      .filter((row) => !userSearch || ilike(row.userName, userSearch))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id - a.id);

    return createDevResult(rows);
  }
  if (normalized.startsWith("SELECT dni, nombre, celular FROM customers WHERE createdat >=")) {
    const [start, end] = params;
    const rows = devState.customers
      .filter((customer) => customer.createdat && withinRange(customer.createdat, start, end))
      .sort((a, b) => new Date(a.createdat) - new Date(b.createdat) || sortByText(a, b, (row) => row.nombre))
      .map(({ dni, nombre, celular }) => ({ dni, nombre, celular }));
    return createDevResult(rows);
  }
  if (normalized.startsWith("SELECT t.userid AS \"userId\", t.username AS \"userName\", COALESCE(SUM(CASE")) {
    return queryRedeemSummary(params, false);
  }
  if (
    normalized.startsWith("SELECT t.userid AS \"userId\", t.username AS \"userName\", COALESCE(p_id.nombre") ||
    normalized.startsWith("SELECT t.userid AS \"userId\", t.username AS \"userName\", COALESCE(p_name.nombre")
  ) {
    return queryRedeemSummary(params, true);
  }
  if (normalized.startsWith("SELECT t.userid AS \"userId\", t.username AS \"userName\", COALESCE(SUM(ABS(t.points)), 0)::int AS \"redeemedPoints\"")) {
    const [start, end] = params;
    const grouped = new Map();
    for (const tx of devState.transactions) {
      const isCustom =
        tx.type === "REDEEM" &&
        !tx.voidedat &&
        withinRange(tx.createdat, start, end) &&
        (tx.redeemmode === "CUSTOM" || (!tx.redeemmode && tx.note === "Canje personalizado"));
      if (!isCustom) continue;
      const key = `${tx.userid ?? "null"}__${tx.username ?? "null"}`;
      const current = grouped.get(key) || {
        userId: tx.userid ?? null,
        userName: tx.username || null,
        redeemedPoints: 0,
      };
      current.redeemedPoints += Math.abs(Number(tx.points || 0));
      grouped.set(key, current);
    }
    return createDevResult(
      [...grouped.values()].sort((a, b) => b.redeemedPoints - a.redeemedPoints || sortByText(a, b, (row) => row.userName))
    );
  }

  throw new Error(`Unsupported dev all query: ${normalized}`);
};

const createDevDb = () => {
  ensureDevAdminUser();

  const query = async (sql, params = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (/^SELECT /i.test(normalized)) {
      if (normalized.includes(" LIMIT 1") || normalized.startsWith("SELECT COUNT(") || normalized.includes(" AS total_points_loaded")) {
        const row = await getDevQuery(sql, params);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      return allDevQuery(sql, params);
    }

    return runDevQuery(sql, params);
  };

  const wrapCallback = (promise, cb) => {
    promise
      .then((result) => {
        if (typeof cb === "function") cb(null, result.rows);
      })
      .catch((error) => {
        if (typeof cb === "function") cb(error);
      });
    return promise;
  };

  const run = (sql, params = [], cb) => {
    if (typeof params === "function") {
      cb = params;
      params = [];
    }
    const promise = query(sql, params);
    promise
      .then((result) => {
        const ctx = {
          lastID: result.rows?.[0]?.id ?? null,
          changes: result.rowCount ?? 0,
        };
        if (typeof cb === "function") cb.call(ctx, null, result);
      })
      .catch((error) => {
        const ctx = { lastID: null, changes: 0 };
        if (typeof cb === "function") cb.call(ctx, error);
      });
    return promise;
  };

  const get = (sql, params = [], cb) => {
    if (typeof params === "function") {
      cb = params;
      params = [];
    }
    const promise = getDevQuery(sql, params);
    promise
      .then((row) => {
        if (typeof cb === "function") cb(null, row);
      })
      .catch((error) => {
        if (typeof cb === "function") cb(error);
      });
    return promise;
  };

  const all = (sql, params = [], cb) => {
    if (typeof params === "function") {
      cb = params;
      params = [];
    }
    const promise = allDevQuery(sql, params);
    promise
      .then((result) => {
        if (typeof cb === "function") cb(null, result.rows);
      })
      .catch((error) => {
        if (typeof cb === "function") cb(error);
      });
    return promise;
  };

  const pool = {
    query,
    connect: async () => ({
      query,
      release() {},
    }),
  };

  console.warn("[db] Using local dev database fallback at backend/dev-db.json");

  return { get, all, run, pool };
};

const connectionString = process.env.DATABASE_URL;

if (isPlaceholderDatabaseUrl(connectionString)) {
  module.exports = createDevDb();
} else {
  const pool = new Pool({
    connectionString,
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
        puntos INT NOT NULL DEFAULT 0,
        createdat TIMESTAMP DEFAULT NOW()
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

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS predictions (
        id SERIAL PRIMARY KEY,
        customerid INT NOT NULL,
        customer_name_snapshot TEXT NOT NULL,
        customer_dni_snapshot TEXT NOT NULL,
        match_key TEXT NOT NULL,
        match_label TEXT NOT NULL,
        match_date DATE NOT NULL,
        predicted_outcome TEXT NOT NULL,
        argentina_goals INT NOT NULL,
        jordania_goals INT NOT NULL,
        createdat TIMESTAMP NOT NULL DEFAULT NOW(),
        userid INT,
        username TEXT
      );
    `);

    await pool.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS createdat TIMESTAMP;

      ALTER TABLE customers
      ALTER COLUMN createdat SET DEFAULT NOW();

      ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS redeemmode TEXT;

      ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS prizeid INT;
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_dni_unique ON customers(dni);
      CREATE INDEX IF NOT EXISTS idx_customers_nombre ON customers(nombre);
      CREATE INDEX IF NOT EXISTS idx_customers_createdat ON customers(createdat);
      CREATE INDEX IF NOT EXISTS idx_transactions_customerid ON transactions(customerid);
      CREATE INDEX IF NOT EXISTS idx_prizes_id ON prizes(id);
      CREATE INDEX IF NOT EXISTS idx_predictions_createdat ON predictions(createdat DESC);
      CREATE INDEX IF NOT EXISTS idx_predictions_customer_name ON predictions(customer_name_snapshot);
      CREATE INDEX IF NOT EXISTS idx_predictions_customer_dni ON predictions(customer_dni_snapshot);
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
    const promise = pool
      .query(args.sql, args.params)
      .then((result) => result.rows?.[0] || null);
    promise
      .then((row) => {
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
}
