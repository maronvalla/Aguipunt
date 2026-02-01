const express = require("express");
const db = require("../db");
const requireRole = require("../middleware/requireRole");
const router = express.Router();

const buildDateFilter = (from, to, addParam) => {
  const parts = [];
  if (from) {
    parts.push(`date(t.createdat) >= date(${addParam(from)})`);
  }
  if (to) {
    parts.push(`date(t.createdat) <= date(${addParam(to)})`);
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
    const addParam = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    const whereParts = ["t.type = 'LOAD'", "t.voidedat IS NULL"];
    whereParts.push(...buildDateFilter(from, to, addParam));
    if (userId) {
      whereParts.push(`t.userid = ${addParam(userId)}`);
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
        const addVoidParam = (value) => {
          voidParams.push(value);
          return `$${voidParams.length}`;
        };
        const voidWhereParts = [
          "t.type = 'ADJUST'",
          "t.originaltransactionid IS NOT NULL",
        ];
        voidWhereParts.push(...buildDateFilter(from, to, addVoidParam));
        if (userId) {
          voidWhereParts.push(`t.userid = ${addVoidParam(userId)}`);
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
            const addItemParam = (value) => {
              itemParams.push(value);
              return `$${itemParams.length}`;
            };
            const itemWhereParts = ["t.type = 'LOAD'"];
            itemWhereParts.push(...buildDateFilter(from, to, addItemParam));
            if (userId) {
              itemWhereParts.push(`t.userid = ${addItemParam(userId)}`);
            }
            const itemWhere = `WHERE ${itemWhereParts.join(" AND ")}`;

            db.all(
              `SELECT t.id,
                      t.createdat AS "createdAt",
                      t.points,
                      t.operations,
                      t.userid AS "userId",
                      t.username AS "userName",
                      t.voidedat AS "voidedAt",
                      t.voidedbyuserid AS "voidedByUserId",
                      t.voidreason AS "voidReason",
                      c.dni as customerDni,
                      c.nombre as customerNombre
               FROM transactions t
               JOIN customers c ON c.id = t.customerid
               ${itemWhere}
               ORDER BY t.createdat DESC`,
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
