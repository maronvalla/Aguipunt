const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { createPredictionsRouter } = require("../routes/predictions");

const requestJson = async (app, method, path, body) => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, json };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test("POST / creates a prediction", async () => {
  const calls = [];
  const db = {
    get: async () => ({ id: 9, nombre: "Cliente Test", dni: "12345678" }),
    run: async (_sql, params) => {
      calls.push(params);
      return { rows: [{ id: 33 }] };
    },
    all: async () => ({ rows: [] }),
    pool: { query: async () => ({ rows: [] }) },
  };

  const app = express();
  app.use(express.json());
  app.use(
    "/api/predictions",
    createPredictionsRouter({
      db,
      requireRole: () => (_req, _res, next) => next(),
      getUtcIsoNow: () => "2026-06-10T12:00:00.000Z",
    })
  );

  const { status, json } = await requestJson(app, "POST", "/api/predictions", {
    customerId: 9,
    predictedOutcome: "ARG",
    argentinaGoals: 2,
    jordaniaGoals: 1,
  });

  assert.equal(status, 201);
  assert.equal(json.customerName, "Cliente Test");
  assert.equal(calls.length, 1);
});

test("POST / rejects inconsistent score", async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/predictions",
    createPredictionsRouter({
      db: {
        get: async () => null,
        run: async () => ({ rows: [] }),
        all: async () => ({ rows: [] }),
        pool: { query: async () => ({ rows: [] }) },
      },
      requireRole: () => (_req, _res, next) => next(),
    })
  );

  const { status, json } = await requestJson(app, "POST", "/api/predictions", {
    customerId: 9,
    predictedOutcome: "ARG",
    argentinaGoals: 0,
    jordaniaGoals: 1,
  });

  assert.equal(status, 400);
  assert.match(json.message, /no coincide/i);
});
