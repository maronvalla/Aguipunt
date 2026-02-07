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

  return {
    totalPoints: Number(totals.totalPointsLoaded || 0),
    topUserName: topRow?.username || "Sin registros",
    topUserPoints: Number(topRow?.total_points || 0),
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
