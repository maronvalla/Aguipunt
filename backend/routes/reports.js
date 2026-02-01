const express = require("express");
const db = require("../db");
const requireRole = require("../middleware/requireRole");
const router = express.Router();

const getArgentinaToday = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

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
  "/points-loaded",
  requireRole("admin"),
  (req, res) => {
    const today = getArgentinaToday();
    const from = String(req.query.from || "").trim() || today;
    const to = String(req.query.to || "").trim() || today;
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

        const itemParams = [];
        const addItemParam = (value) => {
          itemParams.push(value);
          return `$${itemParams.length}`;
        };
        const itemWhereParts = ["t.type = 'LOAD'", "t.voidedat IS NULL"];
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
                  t.customerid AS "customerId",
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
            res.json({
              totals: {
                totalPointsLoaded,
                totalVoided: 0,
                totalNet: totalPointsLoaded,
              },
              items: rows || [],
            });
          }
        );
      }
    );
  }
);

module.exports = router;
