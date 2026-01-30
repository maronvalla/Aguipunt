const express = require("express");
const db = require("../db");
const requireRole = require("../middleware/requireRole");
const router = express.Router();

router.post(
  "/transactions/:id/void",
  requireRole("admin"),
  (req, res) => {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || "").trim();

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: "Transacción inválida." });
    }

    db.get(
      "SELECT * FROM transactions WHERE id = ?",
      [id],
      (err, tx) => {
        if (err) {
          return res.status(500).json({ message: "Error al buscar transacción." });
        }
        if (!tx) {
          return res.status(404).json({ message: "Transacción no encontrada." });
        }
        if (tx.type !== "LOAD") {
          return res.status(400).json({ message: "Solo se puede anular cargas." });
        }
        if (tx.voidedAt) {
          return res.status(400).json({ message: "La carga ya está anulada." });
        }

        db.get(
          "SELECT * FROM customers WHERE id = ?",
          [tx.customerId],
          (custErr, customer) => {
            if (custErr || !customer) {
              return res.status(500).json({ message: "Error al buscar cliente." });
            }

            const deltaPoints = -tx.points;
            const newPoints = customer.puntos + deltaPoints;
            const voidedByUserId = req.user?.id ?? null;
            const voidedByUserName = req.user?.username ?? null;
            const note = `Anulación de carga #${tx.id}${reason ? `: ${reason}` : ""}`;

            db.run(
              "UPDATE customers SET puntos = ? WHERE id = ?",
              [newPoints, customer.id],
              () => {
                db.run(
                  `UPDATE transactions
                   SET voidedAt = datetime('now'),
                       voidedByUserId = ?,
                       voidReason = ?
                   WHERE id = ?`,
                  [voidedByUserId, reason || null, id],
                  () => {
                    db.run(
                      `INSERT INTO transactions
                        (customerId, type, operations, points, note, userId, userName, originalTransactionId)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                      [
                        tx.customerId,
                        "ADJUST",
                        null,
                        deltaPoints,
                        note,
                        voidedByUserId,
                        voidedByUserName,
                        tx.id,
                      ],
                      function () {
                        res.json({
                          ok: true,
                          originalId: tx.id,
                          adjustTransactionId: this.lastID,
                          customerId: tx.customerId,
                          deltaPoints,
                          newPoints,
                        });
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  }
);

module.exports = router;
