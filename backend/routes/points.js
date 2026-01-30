const express = require("express");
const db = require("../db");
const router = express.Router();

router.post("/points/load", (req, res) => {
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

  db.get(
    "SELECT * FROM customers WHERE dni = ?",
    [dni],
    (err, customer) => {
      if (err) {
        return res.status(500).json({ message: "Error al buscar cliente." });
      }
      if (!customer) {
        return res.status(404).json({ message: "Cliente no encontrado." });
      }

      const currentPoints = customer.puntos;
      const newPoints = currentPoints + puntos;
const userId = req.user?.id ?? null;
const userName = req.user?.username ?? null;

      db.run(
        "UPDATE customers SET puntos = ? WHERE dni = ?",
        [newPoints, dni],
        () => {
          let opsValue = null;
          const opsNumber = Number(operations);
          if (Number.isFinite(opsNumber) && opsNumber > 0) {
            opsValue = Math.trunc(opsNumber);
          } else if (puntos % 50 === 0) {
            opsValue = puntos / 50;
          }

          db.run(
            "INSERT INTO transactions (customerId, type, operations, points, note, userId, userName) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [customer.id, "LOAD", opsValue, puntos, null, userId, userName],
            () => {
              res.json({
                message: "Puntos cargados correctamente.",
                puntosNuevos: newPoints,
                currentPoints,
                newPoints,
              });
            }
          );
        }
      );
    }
  );
});

router.post("/points/redeem-custom", (req, res) => {
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

  db.get(
    "SELECT * FROM customers WHERE dni = ?",
    [dni],
    (err, customer) => {
      if (err) {
        return res.status(500).json({ message: "Error al buscar cliente." });
      }
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

      db.run(
        "UPDATE customers SET puntos = ? WHERE dni = ?",
        [newPoints, dni],
        () => {
          db.run(
            "INSERT INTO transactions (customerId, type, operations, points, note, userId, userName) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [customer.id, "REDEEM", null, -puntos, noteValue, userId, userName],
            () => {
              res.json({
                message: "Puntos canjeados correctamente.",
                currentPoints,
                newPoints,
              });
            }
          );
        }
      );
    }
  );
});

module.exports = router;
