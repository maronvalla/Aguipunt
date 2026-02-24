const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { createReportsRouter } = require("../routes/reports");

const allowAllRole = () => (_req, _res, next) => next();

const buildDailyRangeMock = () => ({
  startSql: "2026-02-24 00:00:00",
  endSql: "2026-02-25 00:00:00",
  startISODate: "2026-02-24",
});

const buildTransactionsFiltersMock = () => ({
  where: "WHERE t.type = 'LOAD'",
  params: [],
});

const getDailyTotalsMock = async () => ({
  totalPointsLoaded: 150,
  totalVoided: 0,
  totalNet: 150,
});

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

test("GET /points-loaded returns totals and items", async () => {
  const db = {
    all: async () => ({
      rows: [
        {
          id: 1,
          createdAt: "2026-02-24T10:00:00.000Z",
          points: 50,
          operations: 1,
          userId: 2,
          userName: "braian",
          customerId: 3,
          customerDni: "123",
          customerName: "Cliente",
        },
      ],
    }),
  };

  const app = express();
  app.use(
    "/api/reports",
    createReportsRouter({
      db,
      requireRole: allowAllRole,
      buildDailyRange: buildDailyRangeMock,
      buildTransactionsFilters: buildTransactionsFiltersMock,
      getDailyTotals: getDailyTotalsMock,
    })
  );

  const { status, json } = await requestJson(app, "/api/reports/points-loaded");
  assert.equal(status, 200);
  assert.equal(json.totals.totalPointsLoaded, 150);
  assert.equal(json.items.length, 1);
});

test("GET /points-redeemed-by-user does not crash and returns grouped data", async () => {
  let call = 0;
  const db = {
    all: async () => {
      call += 1;
      if (call === 1) {
        return {
          rows: [
            {
              userId: 2,
              userName: "braian",
              customRedeemedPoints: 120,
              prizeRedemptionsCount: 2,
            },
          ],
        };
      }
      return {
        rows: [
          {
            userId: 2,
            userName: "braian",
            prizeName: "Taza",
            redemptionsCount: 2,
            redeemedPoints: 80,
          },
        ],
      };
    },
  };

  const app = express();
  app.use(
    "/api/reports",
    createReportsRouter({
      db,
      requireRole: allowAllRole,
      buildDailyRange: buildDailyRangeMock,
      buildTransactionsFilters: buildTransactionsFiltersMock,
      getDailyTotals: getDailyTotalsMock,
    })
  );

  const { status, json } = await requestJson(
    app,
    "/api/reports/points-redeemed-by-user"
  );

  assert.equal(status, 200);
  assert.equal(json.items.length, 1);
  assert.equal(json.items[0].customRedeemedPoints, 120);
  assert.equal(json.items[0].prizeRedemptionsCount, 2);
  assert.equal(json.items[0].prizeDetails.length, 1);
});
