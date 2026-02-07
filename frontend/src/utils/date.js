const TUCUMAN_TZ = "America/Argentina/Tucuman";

export const formatTucumanDateTime = (value) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TUCUMAN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${lookup.day}/${lookup.month}/${lookup.year}, ${lookup.hour}:${lookup.minute}:${lookup.second} ${lookup.dayPeriod}`;
};

export { TUCUMAN_TZ };
