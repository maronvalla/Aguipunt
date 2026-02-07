const { DateTime } = require("luxon");
const db = require("../db");

const DEFAULT_TZ = "America/Argentina/Tucuman";

const getTimezone = (timezone) => timezone || process.env.TZ || DEFAULT_TZ;

const formatSqlTimestamp = (dt) => dt.toFormat("yyyy-LL-dd HH:mm:ss");

const buildDailyRange = ({ from, to, timezone } = {}) => {
  const zone = getTimezone(timezone);
  const now = DateTime.now().setZone(zone);
  const startDate = from ? DateTime.fromISO(from, { zone }) : now;
  const endDate = to ? DateTime.fromISO(to, { zone }) : startDate;

  const start = startDate.startOf("day");
  const end = endDate.plus({ days: 1 }).startOf("day");

  return {
    zone,
    start,
    end,
    startSql: formatSqlTimestamp(start),
    endSql: formatSqlTimestamp(end),
    formattedDate: startDate.toFormat("dd/LL/yyyy"),
    startISODate: startDate.toISODate(),
  };
};

const buildTransactionsFilters = ({ from, to, userId, userName, timezone } = {}) => {
  const range = buildDailyRange({ from, to, timezone });
  const params = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const whereParts = [
    "t.type = 'LOAD'",
    "t.voidedat IS NULL",
    `t.createdat >= ${addParam(range.startSql)}`,
    `t.createdat < ${addParam(range.endSql)}`,
  ];

  if (userId !== null && userId !== undefined) {
    whereParts.push(`t.userid = ${addParam(userId)}`);
  } else if (userName) {
    whereParts.push(`t.username = ${addParam(userName)}`);
  }

  return {
    where: `WHERE ${whereParts.join(" AND ")}`,
    params,
    range,
  };
};

const buildDailySummary = async (options = {}) => {
  const { where, params, range } = buildTransactionsFilters(options);

  const totalRow = await db.get(
    `SELECT COALESCE(SUM(t.points), 0) AS total_points_loaded
     FROM transactions t
     ${where}`,
    params
  );

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
    totalPoints: Number(totalRow?.total_points_loaded || 0),
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
