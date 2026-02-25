const db = require("../db");
const {
  DEFAULT_TZ,
  buildDailyRange,
  buildTransactionsFilters,
} = require("./reportFilters");
const { getDailyTotals } = require("./dailyTotals");

const buildDailySummary = async (options = {}) => {
  const { where, params, range } = buildTransactionsFilters(options);

  const totals = await getDailyTotals(options);

  const topRow = await db.get(
    `SELECT t.username, COALESCE(SUM(t.points), 0) AS total_points
     FROM transactions t
     ${where}
     GROUP BY t.username
     ORDER BY total_points DESC NULLS LAST
     LIMIT 1`,
    params
  );

  const customRedeemRowsResult = await db.all(
    `SELECT t.userid AS "userId",
            t.username AS "userName",
            COALESCE(SUM(ABS(t.points)), 0)::int AS "redeemedPoints"
     FROM transactions t
     WHERE t.type = 'REDEEM'
       AND t.voidedat IS NULL
       AND t.createdat >= $1
       AND t.createdat < $2
       AND (
         t.redeemmode = 'CUSTOM'
         OR (t.redeemmode IS NULL AND t.note = 'Canje personalizado')
       )
     GROUP BY t.userid, t.username
     ORDER BY "redeemedPoints" DESC, "userName" ASC NULLS LAST`,
    [range.startSql, range.endSql]
  );

  const customRedeemedByUser = (customRedeemRowsResult?.rows || []).map((row) => ({
    userId: row.userId ?? null,
    userName: row.userName || null,
    redeemedPoints: Number(row.redeemedPoints || 0),
  }));

  return {
    totalPoints: Number(totals.totalPointsLoaded || 0),
    topUserName: topRow?.username || "Sin registros",
    topUserPoints: Number(topRow?.total_points || 0),
    customRedeemedByUser,
    formattedDate: range.formattedDate,
    range,
  };
};

module.exports = {
  DEFAULT_TZ,
  buildDailyRange,
  buildTransactionsFilters,
  buildDailySummary,
};
