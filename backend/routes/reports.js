const express = require("express");
const db = require("../db");
const requireRole = require("../middleware/requireRole");
const { buildTransactionsFilters, buildDailyRange } = require("../services/dailySummary");
const router = express.Router();

router.get(
  "/points-loaded",
  requireRole("admin"),
  (req, res) => {
    const today = buildDailyRange().startISODate;
    const from = String(req.query.from || "").trim() || today;
    const to = String(req.query.to || "").trim() || today;
    const userIdRaw = String(req.query.userId || "").trim();
    const userName = String(req.query.userName || req.query.user || "").trim();
    const userId =
      userIdRaw && /^\d+$/.test(userIdRaw) ? Number(userIdRaw) : null;

    if (userIdRaw && userId === null && !userName) {
      return res.status(400).json({
        message: "El filtro de usuario debe ser un ID numérico o un nombre.",
      });
    }

    const { where, params } = buildTransactionsFilters({
      from,
      to,
      userId,
      userName,
    });

    db.get(
      `SELECT COALESCE(SUM(t.points), 0) as total_points_loaded
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
           ${where}
           ORDER BY t.createdat DESC`,
          params,
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
            const totalPointsLoaded = sumRow?.total_points_loaded || 0;
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
