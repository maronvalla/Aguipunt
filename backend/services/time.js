const { DateTime } = require("luxon");

const DEFAULT_TZ = "America/Argentina/Tucuman";

const getUtcIsoNow = (timezone = DEFAULT_TZ) =>
  DateTime.now().setZone(timezone).toUTC().toISO();

module.exports = {
  DEFAULT_TZ,
  getUtcIsoNow,
};
