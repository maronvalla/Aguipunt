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

router.get(
  "/points-loaded",
  requireRole("admin"),
  (req, res) => {
    const today = getArgentinaToday();
    const from = String(req.query.from || "").trim() || today;
    const to = String(req.query.to || "").trim() || today;
    const rawUserId = String(req.query.userId || req.query.user || "").trim();
    const rawUserName = String(req.query.userName || "").trim();
    const userId = rawUserId || "";
    const userName = rawUserName || "";

    const params = [];
    const addParam = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    const whereParts = [
      "t.type = 'LOAD'",
      "t.voidedat IS NULL",
      `date(t.createdat) >= date(${addParam(from)})`,
      `date(t.createdat) <= date(${addParam(to)})`,
    ];
    if (userId) whereParts.push(`t.userid = ${addParam(String(userId))}`);
    if (userName) whereParts.push(`t.username = ${addParam(String(userName))}`);
    const where = `WHERE ${whereParts.join(" AND ")}`;

    db.get(
      `SELECT COALESCE(SUM(t.points), 0) as totalPointsLoaded
       FROM transactions t
       ${where}`,
      params,
      (sumErr, sumRow) => {
        if (sumErr) {
          console.error("Error al calcular totales:", sumErr);
          const message = "Error al calcular totales";
          return res
            .status(500)
            .json(
              process.env.NODE_ENV === "production"
                ? { message }
                : { message, detail: sumErr.message }
            );
        }

        const itemParams = [];
        const addItemParam = (value) => {
          itemParams.push(value);
          return `$${itemParams.length}`;
        };
        const itemWhereParts = [
          "t.type = 'LOAD'",
          "t.voidedat IS NULL",
          `date(t.createdat) >= date(${addItemParam(from)})`,
          `date(t.createdat) <= date(${addItemParam(to)})`,
        ];
        if (userId) itemWhereParts.push(`t.userid = ${addItemParam(String(userId))}`);
        if (userName) itemWhereParts.push(`t.username = ${addItemParam(String(userName))}`);
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
              console.error("Error al cargar reporte:", err);
              const message = "Error al cargar reporte.";
              return res
                .status(500)
                .json(
                  process.env.NODE_ENV === "production"
                    ? { message }
                    : { message, detail: err.message }
                );
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
