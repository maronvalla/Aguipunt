const express = require("express");
const dbDefault = require("../db");
const { getUtcIsoNow: getUtcIsoNowDefault } = require("../services/time");
const {
  getCampaignRange,
  isCampaignTimestamp,
} = require("../services/raffleCampaign");

const buildRaffleTicket = async ({ db, customer, pointsLoaded, createdAt }) => {
  if (!isCampaignTimestamp(createdAt)) return null;

  const range = getCampaignRange();
  const row = await db.get(
    `SELECT COUNT(1)::int AS "chanceCount"
     FROM transactions
     WHERE customerid = $1
       AND type = 'LOAD'
       AND voidedat IS NULL
       AND createdat >= $2
       AND createdat < $3`,
    [customer.id, range.startSql, range.endSql]
  );

  return {
    customerName: customer.nombre,
    pointsLoaded,
    chanceCount: Number(row?.chanceCount || row?.chancecount || 0),
  };
};

const createPointsRouter = (deps = {}) => {
  const db = deps.db || dbDefault;
  const getUtcIsoNow = deps.getUtcIsoNow || getUtcIsoNowDefault;
  const router = express.Router();

  router.post("/points/load", async (req, res) => {
    const { dni, puntosAgregados, operations } = req.body;

    if (!dni) {
      return res.status(400).json({ message: "DNI requerido." });
    }

    const puntos = Number(puntosAgregados);
    if (!Number.isFinite(puntos) || puntos <= 0) {
      return res
        .status(400)
        .json({ message: "Puntos inválidos. Deben ser mayores a 0." });
    }

    try {
      const customer = await db.get("SELECT * FROM customers WHERE dni = $1", [
        dni,
      ]);
      if (!customer) {
        return res.status(404).json({ message: "Cliente no encontrado." });
      }

      const currentPoints = customer.puntos;
      const newPoints = currentPoints + puntos;
      const userId = req.user?.id ?? null;
      const userName = req.user?.username ?? null;

      await db.run("UPDATE customers SET puntos = $1 WHERE dni = $2", [
        newPoints,
        dni,
      ]);

      let opsValue = null;
      const opsNumber = Number(operations);
      if (Number.isFinite(opsNumber) && opsNumber > 0) {
        opsValue = Math.trunc(opsNumber);
      } else if (puntos % 50 === 0) {
        opsValue = puntos / 50;
      }

      const createdAt = getUtcIsoNow();
      await db.run(
        "INSERT INTO transactions (customerid, type, operations, points, note, userid, username, createdat) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [customer.id, "LOAD", opsValue, puntos, null, userId, userName, createdAt]
      );

      const raffleTicket = await buildRaffleTicket({
        db,
        customer,
        pointsLoaded: puntos,
        createdAt,
      });

      return res.json({
        message: "Puntos cargados correctamente.",
        puntosNuevos: newPoints,
        currentPoints,
        newPoints,
        raffleTicket,
      });
    } catch (err) {
      console.error("Error al cargar puntos:", err);
      return res.status(500).json({ message: "Error al cargar puntos." });
    }
  });

  router.post("/points/redeem-custom", async (req, res) => {
    const { dni, pointsToRedeem, note } = req.body;

    if (!dni) {
      return res.status(400).json({ message: "DNI requerido." });
    }

    const puntos = Number(pointsToRedeem);
    if (!Number.isFinite(puntos) || puntos <= 0 || !Number.isInteger(puntos)) {
      return res
        .status(400)
        .json({ message: "Puntos inválidos. Deben ser mayor a 0." });
    }

    try {
      const customer = await db.get("SELECT * FROM customers WHERE dni = $1", [
        dni,
      ]);
      if (!customer) {
        return res.status(404).json({ message: "Cliente no encontrado." });
      }

      const currentPoints = customer.puntos;
      if (currentPoints < puntos) {
        return res.status(400).json({
          error: "Saldo insuficiente",
          message: "Saldo insuficiente",
          currentPoints,
        });
      }

      const newPoints = currentPoints - puntos;
      const userId = req.user?.id ?? null;
      const userName = req.user?.username ?? null;
      const noteValue = String(note || "").trim() || "Canje personalizado";

      await db.run("UPDATE customers SET puntos = $1 WHERE dni = $2", [
        newPoints,
        dni,
      ]);

      const createdAt = getUtcIsoNow();
      await db.run(
        "INSERT INTO transactions (customerid, type, operations, points, note, userid, username, redeemmode, prizeid, createdat) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        [
          customer.id,
          "REDEEM",
          null,
          -puntos,
          noteValue,
          userId,
          userName,
          "CUSTOM",
          null,
          createdAt,
        ]
      );

      return res.json({
        message: "Puntos canjeados correctamente.",
        currentPoints,
        newPoints,
      });
    } catch (err) {
      console.error("Error al canjear puntos:", err);
      return res.status(500).json({ message: "Error al canjear puntos." });
    }
  });

  return router;
};

module.exports = createPointsRouter();
module.exports.createPointsRouter = createPointsRouter;
module.exports.buildRaffleTicket = buildRaffleTicket;
