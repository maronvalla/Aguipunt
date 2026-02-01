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
      return res.status(400).json({ message: "TransacciÃ³n invÃ¡lida." });
    }

    db.get(
      "SELECT * FROM transactions WHERE id = $1",
      [id],
      (err, tx) => {
        if (err) {
          return res.status(500).json({ message: "Error al buscar transacciÃ³n." });
        }
        if (!tx) {
          return res.status(404).json({ message: "TransacciÃ³n no encontrada." });
        }
        if (tx.type !== "LOAD") {
          return res.status(400).json({ message: "Solo se puede anular cargas." });
        }
        if (tx.voidedat) {
          return res.status(400).json({ message: "La carga ya estÃ¡ anulada." });
        }

        db.get(
          "SELECT * FROM customers WHERE id = $1",
          [tx.customerid],
          (custErr, customer) => {
            if (custErr || !customer) {
              return res.status(500).json({ message: "Error al buscar cliente." });
            }

            const deltaPoints = -tx.points;
            const newPoints = customer.puntos + deltaPoints;
            const voidedByUserId = req.user?.id ?? null;
            const voidedByUserName = req.user?.username ?? null;
            const note = `AnulaciÃ³n de carga #${tx.id}${reason ? `: ${reason}` : ""}`;

            db.run(
              "UPDATE customers SET puntos = $1 WHERE id = $2",
              [newPoints, customer.id],
              () => {
                db.run(
                  `UPDATE transactions
                   SET voidedat = NOW(),
                       voidedbyuserid = $1,
                       voidreason = $2
                   WHERE id = $3`,
                  [voidedByUserId, reason || null, id],
                  () => {
                    db.run(
                      `INSERT INTO transactions
                        (customerid, type, operations, points, note, userid, username, originaltransactionid)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                      [
                        tx.customerid,
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
                          customerId: tx.customerid,
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
