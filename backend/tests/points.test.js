const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { createPointsRouter } = require("../routes/points");

const requestJson = async (app, path, body) => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, json };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const makeDb = ({ createdAt }) => {
  const customer = {
    id: 7,
    dni: "12345678",
    nombre: "Ana Gomez",
    puntos: 100,
  };
  const transactions = [
    {
      customerid: customer.id,
      type: "LOAD",
      voidedat: null,
      createdat: "2026-06-03T12:00:00.000Z",
    },
  ];

  return {
    get: async (sql, params) => {
      if (sql.startsWith("SELECT * FROM customers")) {
        return params[0] === customer.dni ? customer : null;
      }
      if (sql.startsWith("SELECT COUNT(1)::int")) {
        return {
          chanceCount: transactions.filter(
            (tx) =>
              tx.customerid === params[0] &&
              tx.type === "LOAD" &&
              !tx.voidedat
          ).length,
        };
      }
      return null;
    },
    run: async (sql, params) => {
      if (sql.startsWith("INSERT INTO transactions")) {
        transactions.push({
          customerid: params[0],
          type: params[1],
          operations: params[2],
          points: params[3],
          voidedat: null,
          createdat: createdAt,
        });
      }
      return { rows: [], rowCount: 1 };
    },
  };
};

test("POST /points/load returns raffle ticket data during June campaign", async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/points",
    createPointsRouter({
      db: makeDb({ createdAt: "2026-06-10T15:00:00.000Z" }),
      getUtcIsoNow: () => "2026-06-10T15:00:00.000Z",
    })
  );

  const { status, json } = await requestJson(app, "/api/points/points/load", {
    dni: "12345678",
    puntosAgregados: 150,
    operations: 3,
  });

  assert.equal(status, 200);
  assert.equal(json.newPoints, 250);
  assert.deepEqual(json.raffleTicket, {
    customerName: "Ana Gomez",
    pointsLoaded: 150,
    chanceCount: 2,
  });
});

test("POST /points/load does not return raffle ticket outside June campaign", async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/points",
    createPointsRouter({
      db: makeDb({ createdAt: "2026-07-02T15:00:00.000Z" }),
      getUtcIsoNow: () => "2026-07-02T15:00:00.000Z",
    })
  );

  const { status, json } = await requestJson(app, "/api/points/points/load", {
    dni: "12345678",
    puntosAgregados: 50,
    operations: 1,
  });

  assert.equal(status, 200);
  assert.equal(json.raffleTicket, null);
});
