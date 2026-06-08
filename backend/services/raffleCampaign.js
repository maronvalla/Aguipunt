const { buildDailyRange } = require("./reportFilters");

const CAMPAIGN_FROM = "2026-06-01";
const CAMPAIGN_TO = "2026-06-30";

const getCampaignRange = () =>
  buildDailyRange({
    from: CAMPAIGN_FROM,
    to: CAMPAIGN_TO,
  });

const parseSqlUtcDate = (value) => new Date(`${String(value).replace(" ", "T")}Z`);

const isCampaignTimestamp = (value) => {
  if (!value) return false;
  const range = getCampaignRange();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= parseSqlUtcDate(range.startSql) && date < parseSqlUtcDate(range.endSql);
};

module.exports = {
  CAMPAIGN_FROM,
  CAMPAIGN_TO,
  getCampaignRange,
  isCampaignTimestamp,
};
