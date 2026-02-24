const express = require("express");
const db = require("../db");
const requireRole = require("../middleware/requireRole");
const {
  buildTransactionsFilters,
  buildDailyRange,
} = require("../services/reportFilters");
const { getDailyTotals } = require("../services/dailyTotals");
const router = express.Router();

const resolveReportFilters = (req) => {
  const today = buildDailyRange().startISODate;
  const from = String(req.query.from || "").trim() || today;
  const to = String(req.query.to || "").trim() || today;
  const userIdRaw = String(req.query.userId || "").trim();
  const userName = String(req.query.userName || req.query.user || "").trim();
  const userId =
    userIdRaw && /^\d+$/.test(userIdRaw) ? Number(userIdRaw) : null;

  return {
    from,
    to,
    userIdRaw,
    userId,
    userName,
  };
};

router.get(
  "/points-loaded",
  requireRole("admin"),
  async (req, res) => {
    const { from, to, userIdRaw, userId, userName } = resolveReportFilters(req);

    if (userIdRaw && userId === null && !userName) {
      return res.status(400).json({
        message: "El filtro de usuario debe ser un ID numerico o un nombre.",
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
                to_char(t.createdat, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
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

router.get(
  "/points-redeemed-by-user",
  requireRole("admin"),
  async (req, res) => {
    const { from, to, userIdRaw, userId, userName } = resolveReportFilters(req);

    if (userIdRaw && userId === null && !userName) {
      return res.status(400).json({
        message: "El filtro de usuario debe ser un ID numerico o un nombre.",
      });
    }

    const { range } = buildDailyRange({ from, to });
    const params = [range.startSql, range.endSql];
    let userFilterSql = "";

    if (userId !== null && userId !== undefined) {
      params.push(userId);
      userFilterSql = ` AND t.userid = $${params.length}`;
    } else if (userName) {
      params.push(userName);
      userFilterSql = ` AND t.username = $${params.length}`;
    }

    const baseWhere = `
      WHERE t.type = 'REDEEM'
        AND t.voidedat IS NULL
        AND t.createdat >= $1
        AND t.createdat < $2
        ${userFilterSql}
    `;

    try {
      let summaryResult;
      let detailsResult;
      try {
        summaryResult = await db.all(
          `SELECT t.userid AS "userId",
                  t.username AS "userName",
                  COALESCE(SUM(CASE
                    WHEN t.redeemmode = 'CUSTOM'
                      OR (t.redeemmode IS NULL AND t.note = 'Canje personalizado')
                    THEN ABS(t.points)
                    ELSE 0
                  END), 0)::int AS "customRedeemedPoints",
                  COALESCE(SUM(CASE
                    WHEN t.redeemmode = 'PRIZE'
                      OR (t.redeemmode IS NULL AND p_name.id IS NOT NULL)
                    THEN 1
                    ELSE 0
                  END), 0)::int AS "prizeRedemptionsCount"
           FROM transactions t
           LEFT JOIN prizes p_name ON p_name.nombre = t.note
           ${baseWhere}
           GROUP BY t.userid, t.username
           ORDER BY "customRedeemedPoints" DESC, "prizeRedemptionsCount" DESC, "userName" ASC NULLS LAST`,
          params
        );

        detailsResult = await db.all(
          `SELECT t.userid AS "userId",
                  t.username AS "userName",
                  COALESCE(p_id.nombre, p_name.nombre, t.note, 'Premio') AS "prizeName",
                  COUNT(1)::int AS "redemptionsCount",
                  COALESCE(SUM(ABS(t.points)), 0)::int AS "redeemedPoints"
           FROM transactions t
           LEFT JOIN prizes p_id ON p_id.id = t.prizeid
           LEFT JOIN prizes p_name ON p_name.nombre = t.note
           ${baseWhere}
             AND (
               t.redeemmode = 'PRIZE'
               OR (t.redeemmode IS NULL AND p_name.id IS NOT NULL)
             )
           GROUP BY t.userid, t.username, COALESCE(p_id.nombre, p_name.nombre, t.note, 'Premio')
           ORDER BY "redeemedPoints" DESC, "prizeName" ASC`,
          params
        );
      } catch (queryErr) {
        // Backward-compatible fallback if new columns are not present yet.
        summaryResult = await db.all(
          `SELECT t.userid AS "userId",
                  t.username AS "userName",
                  COALESCE(SUM(CASE
                    WHEN t.note = 'Canje personalizado'
                    THEN ABS(t.points)
                    ELSE 0
                  END), 0)::int AS "customRedeemedPoints",
                  COALESCE(SUM(CASE
                    WHEN p_name.id IS NOT NULL
                    THEN 1
                    ELSE 0
                  END), 0)::int AS "prizeRedemptionsCount"
           FROM transactions t
           LEFT JOIN prizes p_name ON p_name.nombre = t.note
           ${baseWhere}
           GROUP BY t.userid, t.username
           ORDER BY "customRedeemedPoints" DESC, "prizeRedemptionsCount" DESC, "userName" ASC NULLS LAST`,
          params
        );

        detailsResult = await db.all(
          `SELECT t.userid AS "userId",
                  t.username AS "userName",
                  COALESCE(p_name.nombre, t.note, 'Premio') AS "prizeName",
                  COUNT(1)::int AS "redemptionsCount",
                  COALESCE(SUM(ABS(t.points)), 0)::int AS "redeemedPoints"
           FROM transactions t
           LEFT JOIN prizes p_name ON p_name.nombre = t.note
           ${baseWhere}
             AND p_name.id IS NOT NULL
           GROUP BY t.userid, t.username, COALESCE(p_name.nombre, t.note, 'Premio')
           ORDER BY "redeemedPoints" DESC, "prizeName" ASC`,
          params
        );
        console.warn("[reports] redeem report fallback mode enabled", queryErr?.message);
      }

      const prizeDetailsMap = new Map();
      for (const row of detailsResult?.rows || []) {
        const key = `${row.userId ?? "null"}__${row.userName ?? "null"}`;
        if (!prizeDetailsMap.has(key)) {
          prizeDetailsMap.set(key, []);
        }
        prizeDetailsMap.get(key).push({
          prizeName: row.prizeName || "Premio",
          redemptionsCount: Number(row.redemptionsCount || 0),
          redeemedPoints: Number(row.redeemedPoints || 0),
        });
      }

      const items = (summaryResult?.rows || []).map((row) => {
        const key = `${row.userId ?? "null"}__${row.userName ?? "null"}`;
        return {
          userId: row.userId,
          userName: row.userName || null,
          customRedeemedPoints: Number(row.customRedeemedPoints || 0),
          prizeRedemptionsCount: Number(row.prizeRedemptionsCount || 0),
          prizeDetails: prizeDetailsMap.get(key) || [],
        };
      });

      const totals = items.reduce(
        (acc, item) => {
          acc.totalCustomRedeemedPoints += item.customRedeemedPoints;
          acc.totalPrizeRedemptions += item.prizeRedemptionsCount;
          acc.usersWithRedemptions +=
            item.customRedeemedPoints > 0 || item.prizeRedemptionsCount > 0 ? 1 : 0;
          return acc;
        },
        {
          totalCustomRedeemedPoints: 0,
          totalPrizeRedemptions: 0,
          usersWithRedemptions: 0,
        }
      );

      return res.json({
        totals,
        items,
      });
    } catch (err) {
      console.error("Error al cargar reporte de canjes por usuario:", err);
      const message = "Error al cargar reporte de canjes por usuario.";
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
