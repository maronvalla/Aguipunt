const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const ExcelJS = require("exceljs");

const { createRaffleRouter } = require("../routes/raffle");
const {
  getCampaignRange,
  isCampaignTimestamp,
} = require("../services/raffleCampaign");

const allowAllRole = () => (_req, _res, next) => next();

const requestJson = async (app, path, { method = "GET", body } = {}) => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, json };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const requestBuffer = async (app, path) => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, buffer };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const makeRaffleDb = (transactions) => ({
  all: async (_sql, params) => {
    const [start, end] = params;
    const search = params.length >= 5 ? params[2] : null;
    const user = params.length === 6 ? params[5] : params.length === 3 ? params[2] : null;

    const campaignEntries = transactions
      .filter((item) => item.type === "LOAD")
      .filter((item) => !item.voidedAt)
      .filter((item) => item.createdAt >= start && item.createdAt < end)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
      .map((item, index) => ({
        id: item.id,
        chanceNumber: index + 1,
        createdAt: item.createdAt,
        points: item.points,
        operations: item.operations,
        userId: item.userId,
        userName: item.userName,
        customerId: item.customerId,
        customerDni: item.customerDni,
        customerName: item.customerName,
        customerPhone: item.customerPhone,
      }));

    const includes = (value, pattern) =>
      String(value || "")
        .toLowerCase()
        .includes(String(pattern || "").replaceAll("%", "").toLowerCase());

    return {
      rows: campaignEntries
        .filter((item) => {
          if (!search) return true;
          return (
            includes(item.customerName, search) ||
            includes(item.customerDni, search) ||
            includes(item.customerPhone, search)
          );
        })
        .filter((item) => !user || includes(item.userName, user))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id),
    };
  },
});

test("GET /entries returns valid June and July LOAD entries and one chance per load", async () => {
  const db = makeRaffleDb([
    {
      id: 1,
      type: "LOAD",
      createdAt: "2026-06-01 04:00:00",
      points: 250,
      operations: 5,
      userId: 2,
      userName: "cajero",
      customerId: 10,
      customerDni: "111",
      customerName: "Ana",
      customerPhone: "381",
    },
    {
      id: 2,
      type: "LOAD",
      createdAt: "2026-06-15 12:00:00",
      points: 50,
      operations: 1,
      userId: 3,
      userName: "admin",
      customerId: 11,
      customerDni: "222",
      customerName: "Bruno",
      customerPhone: "382",
    },
    {
      id: 3,
      type: "REDEEM",
      createdAt: "2026-06-15 13:00:00",
      points: -50,
      operations: null,
      customerName: "No entra",
    },
    {
      id: 4,
      type: "LOAD",
      createdAt: "2026-07-01 04:00:00",
      points: 50,
      operations: 1,
      customerName: "Julio",
    },
    {
      id: 5,
      type: "LOAD",
      voidedAt: "2026-06-20 10:00:00",
      createdAt: "2026-06-20 09:00:00",
      points: 50,
      operations: 1,
      customerName: "Anulada",
    },
  ]);

  const app = express();
  app.use("/api/raffle", createRaffleRouter({ db, requireRole: allowAllRole }));

  const { status, json } = await requestJson(app, "/api/raffle/entries");

  assert.equal(status, 200);
  assert.equal(json.items.length, 3);
  assert.deepEqual(
    json.items.map((item) => item.id),
    [4, 2, 1]
  );
  assert.deepEqual(
    json.items.map((item) => item.chanceNumber),
    [3, 2, 1]
  );
  assert.equal(json.items[2].points, 250);
  assert.equal(json.items[2].chanceNumber, 1);
  assert.equal(json.campaign.to, "2026-07-31");
});

test("GET /entries respects customer and loader filters without renumbering chances", async () => {
  const db = makeRaffleDb([
    {
      id: 1,
      type: "LOAD",
      createdAt: "2026-06-02 10:00:00",
      points: 50,
      operations: 1,
      userName: "admin",
      customerName: "Ana Gomez",
      customerDni: "111",
      customerPhone: "381",
    },
    {
      id: 2,
      type: "LOAD",
      createdAt: "2026-06-03 10:00:00",
      points: 50,
      operations: 1,
      userName: "cajero",
      customerName: "Bruno Perez",
      customerDni: "222",
      customerPhone: "382",
    },
  ]);

  const app = express();
  app.use("/api/raffle", createRaffleRouter({ db, requireRole: allowAllRole }));

  const { status, json } = await requestJson(
    app,
    "/api/raffle/entries?search=bruno&user=caj"
  );

  assert.equal(status, 200);
  assert.equal(json.items.length, 1);
  assert.equal(json.items[0].id, 2);
  assert.equal(json.items[0].chanceNumber, 2);
});

test("GET /new-registrations/export.xlsx exports only registration columns", async () => {
  const captured = {};
  const db = {
    pool: {
      query: async (sql, params) => {
        captured.sql = sql;
        captured.params = params;
        return {
          rows: [
            { dni: "111", nombre: "Ana Gomez", celular: "381" },
            { dni: "222", nombre: "Bruno Perez", celular: null },
          ],
        };
      },
    },
  };

  const app = express();
  app.use("/api/raffle", createRaffleRouter({ db, requireRole: allowAllRole }));

  const { status, headers, buffer } = await requestBuffer(
    app,
    "/api/raffle/new-registrations/export.xlsx"
  );

  assert.equal(status, 200);
  assert.equal(
    headers.get("content-type"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  assert.match(captured.sql, /WHERE createdat >= \$1/);
  assert.match(captured.sql, /createdat < \$2/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Nuevos registrados");
  assert.deepEqual(sheet.getRow(1).values.slice(1), ["DNI", "Nombre", "Celular"]);
  assert.deepEqual(sheet.getRow(2).values.slice(1), ["111", "Ana Gomez", "381"]);
  assert.equal(sheet.columnCount, 3);
});

test("campaign range ends at draw time and is capped after July", () => {
  const duringJuly = getCampaignRange({ now: "2026-07-18T15:30:45.000Z" });
  assert.equal(duringJuly.startSql, "2026-06-01 03:00:00");
  assert.equal(duringJuly.endSql, "2026-07-18 15:30:45");

  const afterCampaign = getCampaignRange({ now: "2026-08-10T12:00:00.000Z" });
  assert.equal(afterCampaign.endSql, "2026-08-01 03:00:00");
  assert.equal(isCampaignTimestamp("2026-08-01T02:59:59.999Z"), true);
  assert.equal(isCampaignTimestamp("2026-08-01T03:00:00.000Z"), false);
});

test("GET /top-loaders returns the five users with the most loaded points", async () => {
  const captured = {};
  const db = {
    all: async (sql, params) => {
      captured.sql = sql;
      captured.params = params;
      return {
        rows: [
          { userId: 2, userName: "cajero1", totalPoints: "12500", loadCount: "31" },
          { userId: 3, userName: "cajero2", totalPoints: "9800", loadCount: "22" },
        ],
      };
    },
  };
  const app = express();
  app.use(
    "/api/raffle",
    createRaffleRouter({
      db,
      requireRole: allowAllRole,
      getNow: () => new Date("2026-07-18T15:30:45.000Z"),
    })
  );

  const { status, json } = await requestJson(app, "/api/raffle/top-loaders");

  assert.equal(status, 200);
  assert.match(captured.sql, /SUM\(t\.points\)/);
  assert.match(captured.sql, /LIMIT 5/);
  assert.deepEqual(captured.params, [
    "2026-06-01 03:00:00",
    "2026-07-18 15:30:45",
  ]);
  assert.deepEqual(json.items, [
    { userId: 2, userName: "cajero1", totalPoints: 12500, loadCount: 31 },
    { userId: 3, userName: "cajero2", totalPoints: 9800, loadCount: 22 },
  ]);
});

const makeDrawDb = (entries = []) => {
  let storedValue = null;
  return {
    all: async () => ({ rows: entries }),
    get: async (_sql, params) =>
      params[0] && storedValue ? { value: storedValue } : null,
    run: async (_sql, params) => {
      storedValue = params[1];
      return { rows: [], rowCount: 1 };
    },
    stored: () => (storedValue ? JSON.parse(storedValue) : null),
  };
};

test("POST /draw selects one load uniformly and persists the result", async () => {
  const entries = [
    {
      id: 10,
      chanceNumber: 1,
      customerId: 7,
      customerName: "Ana",
      customerPhone: "381111111",
    },
    {
      id: 11,
      chanceNumber: 2,
      customerId: 7,
      customerName: "Ana",
      customerPhone: "381111111",
    },
    {
      id: 12,
      chanceNumber: 3,
      customerId: 8,
      customerName: "Bruno",
      customerPhone: "381222222",
    },
  ];
  const db = makeDrawDb(entries);
  const app = express();
  app.use(
    "/api/raffle",
    createRaffleRouter({
      db,
      requireRole: allowAllRole,
      randomInt: (max) => {
        assert.equal(max, 3);
        return 1;
      },
      getNow: () => new Date("2026-07-18T15:30:45.000Z"),
    })
  );

  const { status, json } = await requestJson(app, "/api/raffle/draw", {
    method: "POST",
  });

  assert.equal(status, 200);
  assert.equal(json.winner.customerName, "Ana");
  assert.equal(json.chanceNumber, 2);
  assert.equal(json.eligibleEntryCount, 3);
  assert.deepEqual(db.stored(), json);

  const saved = await requestJson(app, "/api/raffle/result");
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json.result, json);
});

test("POST /draw replaces the previously saved winner", async () => {
  const entries = [
    { id: 20, chanceNumber: 1, customerName: "Ana" },
    { id: 21, chanceNumber: 2, customerName: "Bruno" },
  ];
  const picks = [0, 1];
  const db = makeDrawDb(entries);
  const app = express();
  app.use(
    "/api/raffle",
    createRaffleRouter({
      db,
      requireRole: allowAllRole,
      randomInt: () => picks.shift(),
      getNow: () => new Date("2026-07-18T15:30:45.000Z"),
    })
  );

  await requestJson(app, "/api/raffle/draw", { method: "POST" });
  await requestJson(app, "/api/raffle/draw", { method: "POST" });

  assert.equal(db.stored().winner.customerName, "Bruno");
  assert.equal(db.stored().chanceNumber, 2);
});

test("POST /draw reports when there are no eligible entries", async () => {
  const app = express();
  app.use(
    "/api/raffle",
    createRaffleRouter({
      db: makeDrawDb([]),
      requireRole: allowAllRole,
      getNow: () => new Date("2026-07-18T15:30:45.000Z"),
    })
  );

  const { status, json } = await requestJson(app, "/api/raffle/draw", {
    method: "POST",
  });
  assert.equal(status, 409);
  assert.match(json.message, /No hay cargas válidas/);
});

test("raffle endpoints reject non-admin users", async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 2, role: "operator" };
    next();
  });
  app.use("/api/raffle", createRaffleRouter({ db: makeDrawDb([]) }));

  const { status } = await requestJson(app, "/api/raffle/result");
  assert.equal(status, 403);
});
