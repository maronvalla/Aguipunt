const express = require("express");
const db = require("../db");
const requireRole = require("../middleware/requireRole");
const router = express.Router();

const buildDateFilter = (from, to, params) => {
  const parts = [];
  if (from) {
    parts.push("date(t.createdAt) >= date(?)");
    params.push(from);
  }
  if (to) {
    parts.push("date(t.createdAt) <= date(?)");
    params.push(to);
  }
  return parts;
};

router.get(
  "/reports/points-loaded",
  requireRole("admin"),
  (req, res) => {
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const userId = String(req.query.userId || "").trim();

    const params = [];
    const whereParts = ["t.type = 'LOAD'", "t.voidedAt IS NULL"];
    whereParts.push(...buildDateFilter(from, to, params));
    if (userId) {
      whereParts.push("t.userId = ?");
      params.push(userId);
    }
    const where = `WHERE ${whereParts.join(" AND ")}`;

    db.get(
      `SELECT COALESCE(SUM(t.points), 0) as totalPointsLoaded
       FROM transactions t
       ${where}`,
      params,
      (sumErr, sumRow) => {
        if (sumErr) {
          return res
            .status(500)
            .json({ message: "Error al calcular totales." });
        }

        const voidParams = [];
        const voidWhereParts = [
          "t.type = 'ADJUST'",
          "t.originalTransactionId IS NOT NULL",
        ];
        voidWhereParts.push(...buildDateFilter(from, to, voidParams));
        if (userId) {
          voidWhereParts.push("t.userId = ?");
          voidParams.push(userId);
        }
        const voidWhere = `WHERE ${voidWhereParts.join(" AND ")}`;

        db.get(
          `SELECT COALESCE(SUM(t.points), 0) as totalVoided
           FROM transactions t
           ${voidWhere}`,
          voidParams,
          (voidErr, voidRow) => {
            if (voidErr) {
              return res
                .status(500)
                .json({ message: "Error al calcular anulaciones." });
            }

            const itemParams = [];
            const itemWhereParts = ["t.type = 'LOAD'"];
            itemWhereParts.push(...buildDateFilter(from, to, itemParams));
            if (userId) {
              itemWhereParts.push("t.userId = ?");
              itemParams.push(userId);
            }
            const itemWhere = `WHERE ${itemWhereParts.join(" AND ")}`;

            db.all(
              `SELECT t.id, t.createdAt, t.points, t.operations, t.userId, t.userName,
                      t.voidedAt, t.voidedByUserId, t.voidReason,
                      c.dni as customerDni, c.nombre as customerNombre
               FROM transactions t
               JOIN customers c ON c.id = t.customerId
               ${itemWhere}
               ORDER BY t.createdAt DESC`,
              itemParams,
              (err, rows) => {
                if (err) {
                  return res
                    .status(500)
                    .json({ message: "Error al cargar reporte." });
                }
                const totalPointsLoaded = sumRow?.totalPointsLoaded || 0;
                const totalVoided = voidRow?.totalVoided || 0;
                res.json({
                  totals: {
                    totalPointsLoaded,
                    totalVoided,
                    totalNet: totalPointsLoaded + totalVoided,
                  },
                  items: rows || [],
                });
              }
            );
          }
        );
      }
    );
  }
);

module.exports = router;
