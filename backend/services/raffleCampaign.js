const { buildDailyRange } = require("./reportFilters");
const { DateTime } = require("luxon");

const CAMPAIGN_FROM = "2026-06-01";
const CAMPAIGN_TO = "2026-07-31";

const getCampaignWindow = () =>
  buildDailyRange({
    from: CAMPAIGN_FROM,
    to: CAMPAIGN_TO,
  });

const formatSqlTimestamp = (dt) => dt.toFormat("yyyy-LL-dd HH:mm:ss");

const getCampaignRange = ({ now } = {}) => {
  const campaign = getCampaignWindow();
  const parsedNow = DateTime.isDateTime(now)
    ? now
    : now
      ? DateTime.fromJSDate(new Date(now))
      : DateTime.now();
  const currentUtc = parsedNow.isValid ? parsedNow.toUTC() : DateTime.now().toUTC();
  const effectiveEnd = currentUtc < campaign.startUtc
    ? campaign.startUtc
    : currentUtc < campaign.endUtc
      ? currentUtc
      : campaign.endUtc;

  return {
    ...campaign,
    end: effectiveEnd.setZone(campaign.zone),
    endUtc: effectiveEnd,
    endSql: formatSqlTimestamp(effectiveEnd),
  };
};

const parseSqlUtcDate = (value) => new Date(`${String(value).replace(" ", "T")}Z`);

const isCampaignTimestamp = (value) => {
  if (!value) return false;
  const range = getCampaignWindow();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date >= parseSqlUtcDate(range.startSql) && date < parseSqlUtcDate(range.endSql);
};

module.exports = {
  CAMPAIGN_FROM,
  CAMPAIGN_TO,
  getCampaignRange,
  getCampaignWindow,
  isCampaignTimestamp,
};
