const db = require("../db");
const { buildTransactionsFilters } = require("./reportFilters");

const getDailyTotals = async (options = {}) => {
  const { where, params } = buildTransactionsFilters(options);

  const totalsRow = await db.get(
    `SELECT COALESCE(SUM(t.points), 0) AS total_points_loaded
     FROM transactions t
     ${where}`,
    params
  );

  const totalPointsLoaded = Number(totalsRow?.total_points_loaded || 0);
  const totalVoided = 0;

  return {
    totalPointsLoaded,
    totalVoided,
    totalNet: totalPointsLoaded - totalVoided,
  };
};

module.exports = {
  getDailyTotals,
};
