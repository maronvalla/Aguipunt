const { DateTime } = require("luxon");

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

const buildTransactionsFilters = ({
  from,
  to,
  userId,
  userName,
  timezone,
} = {}) => {
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

module.exports = {
  DEFAULT_TZ,
  buildDailyRange,
  buildTransactionsFilters,
};
