const express = require("express");
const db = require("../db");
const requireRole = require("../middleware/requireRole");
const {
  buildTransactionsFilters,
  buildDailyRange,
} = require("../services/reportFilters");
const { getDailyTotals } = require("../services/dailyTotals");
const router = express.Router();

router.get(
  "/points-loaded",
  requireRole("admin"),
  async (req, res) => {
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

    try {
      const totals = await getDailyTotals({ from, to, userId, userName });
      const listResult = await db.all(
        `SELECT t.id,
                t.createdat AS "createdAt",
                t.points,
                t.operations,
                t.userid AS "userId",
                t.username AS "userName",
                t.customerid AS "customerId",
                c.dni AS "customerDni",
                c.nombre AS "customerName"
         FROM transactions t
         JOIN customers c ON c.id = t.customerid
         ${where}
         ORDER BY t.createdat DESC`,
        params
      );
      const rows = listResult?.rows || [];

      return res.json({
        totals: {
          totalPointsLoaded: totals.totalPointsLoaded,
          totalVoided: totals.totalVoided,
          totalNet: totals.totalNet,
        },
        items: rows,
      });
    } catch (err) {
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
  }
);

module.exports = router;
