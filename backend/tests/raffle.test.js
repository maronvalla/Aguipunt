const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const ExcelJS = require("exceljs");

const { createRaffleRouter } = require("../routes/raffle");

const allowAllRole = () => (_req, _res, next) => next();

const requestJson = async (app, path) => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
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

test("GET /entries returns only valid June LOAD entries and one chance per load", async () => {
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
  assert.equal(json.items.length, 2);
  assert.deepEqual(
    json.items.map((item) => item.id),
    [2, 1]
  );
  assert.deepEqual(
    json.items.map((item) => item.chanceNumber),
    [2, 1]
  );
  assert.equal(json.items[1].points, 250);
  assert.equal(json.items[1].chanceNumber, 1);
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
