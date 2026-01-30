const express = require("express");
const db = require("../db");
const requireRole = require("../middleware/requireRole");
const router = express.Router();

router.get("/prizes", (req, res) => {
  db.all("SELECT id, nombre, costo_puntos FROM prizes ORDER BY id ASC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Error al listar premios." });
    }
    res.json(rows || []);
  });
});

router.post("/prizes", requireRole("admin"), (req, res) => {
  const nombre = String(req.body?.nombre || "").trim();
  const costo = Number(req.body?.costo_puntos);

  if (!nombre) {
    return res.status(400).json({ message: "Nombre requerido." });
  }
  if (!Number.isFinite(costo) || costo <= 0 || !Number.isInteger(costo)) {
    return res
      .status(400)
      .json({ message: "Puntos requeridos inválidos." });
  }

  db.run(
    "INSERT INTO prizes (nombre, costo_puntos) VALUES (?, ?)",
    [nombre, costo],
    function () {
      res.json({ id: this.lastID, nombre, costo_puntos: costo });
    }
  );
});

router.put("/prizes/:id", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  const nombre = String(req.body?.nombre || "").trim();
  const costo = Number(req.body?.costo_puntos);

  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "ID inválido." });
  }
  if (!nombre) {
    return res.status(400).json({ message: "Nombre requerido." });
  }
  if (!Number.isFinite(costo) || costo <= 0 || !Number.isInteger(costo)) {
    return res.status(400).json({ message: "Puntos requeridos inválidos." });
  }

  db.run(
    "UPDATE prizes SET nombre = ?, costo_puntos = ? WHERE id = ?",
    [nombre, costo, id],
    function () {
      if (this.changes === 0) {
        return res.status(404).json({ message: "Premio no encontrado." });
      }
      res.json({ id, nombre, costo_puntos: costo });
    }
  );
});

router.delete("/prizes/:id", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "ID inválido." });
  }

  db.run("DELETE FROM prizes WHERE id = ?", [id], function () {
    if (this.changes === 0) {
      return res.status(404).json({ message: "Premio no encontrado." });
    }
    res.json({ ok: true });
  });
});

const redeemHandler = (req, res) => {
  const { dni, premioId, note } = req.body;

  if (!dni) {
    return res.status(400).json({ message: "DNI requerido." });
  }

  const prizeId = Number(premioId);
  if (!Number.isFinite(prizeId) || prizeId <= 0) {
    return res
      .status(400)
      .json({ message: "Premio inválido. Debe ser mayor a 0." });
  }

  db.get("SELECT * FROM customers WHERE dni = ?", [dni], (err, customer) => {
    if (err) {
      return res.status(500).json({ message: "Error al buscar cliente." });
    }
    if (!customer) {
      return res.status(404).json({ message: "Cliente no encontrado." });
    }

    db.get("SELECT * FROM prizes WHERE id = ?", [prizeId], (err, prize) => {
      if (err) {
        return res.status(500).json({ message: "Error al buscar premio." });
      }
      if (!prize) {
        return res.status(404).json({ message: "Premio inexistente." });
      }

      const currentPoints = customer.puntos;

      if (currentPoints < prize.costo_puntos) {
        return res.status(400).json({
          error: "Saldo insuficiente",
          message: "Saldo insuficiente",
          currentPoints,
        });
      }

      const newPoints = currentPoints - prize.costo_puntos;
      const noteValue = note || prize.nombre || "Canje";
      const userId = req.user?.id ?? null;
      const userName = req.user?.username ?? null;

      db.run(
        "UPDATE customers SET puntos = ? WHERE dni = ?",
        [newPoints, dni],
        () => {
          db.run(
            "INSERT INTO transactions (customerId, type, operations, points, note, userId, userName) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
              customer.id,
              "REDEEM",
              null,
              -prize.costo_puntos,
              noteValue,
              userId,
              userName,
            ],
            () => {
              res.json({
                message: "Puntos canjeados correctamente.",
                puntosNuevos: newPoints,
                currentPoints,
                newPoints,
              });
            }
          );
        }
      );
    });
  });
};

router.post("/prizes/redeem", redeemHandler);
router.post("/points/redeem", redeemHandler);

module.exports = router;
