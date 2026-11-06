export const raceStatuses = {
  planned: "Планирано",
  confirmed: "Потвърдено",
  completed: "Завършено",
  cancelled: "Отменено",
};
const day = 86400000;
function dateParts(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return undefined;
  const [year, month, date] = value.split("-").map(Number);
  const stamp = Date.UTC(year, month - 1, date);
  if (
    new Date(stamp).toISOString().slice(0, 10) !== value ||
    year < 1900 ||
    year > 2200
  )
    return undefined;
  return { year, month, date, stamp };
}
function formatter(zone) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return undefined;
  }
}
function wallStamp(ms, format) {
  const parts = Object.fromEntries(
    format.formatToParts(new Date(ms)).map((part) => [part.type, part.value]),
  );
  return Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
  );
}
/** Resolve an explicit local time. Reject nonexistent/ambiguous DST times. */
export function zonedTime(date, time, zone = "Europe/Sofia") {
  const parts = dateParts(date),
    format = formatter(zone);
  if (!parts || !format || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? ""))
    return undefined;
  const [hour, minute] = time.split(":").map(Number);
  const target = parts.stamp + hour * 3600000 + minute * 60000;
  let candidate = target;
  for (let index = 0; index < 4; index++)
    candidate += target - wallStamp(candidate, format);
  if (wallStamp(candidate, format) !== target) return undefined;
  for (const delta of [-7200000, -3600000, -1800000, 1800000, 3600000, 7200000])
    if (wallStamp(candidate + delta, format) === target) return undefined;
  return candidate;
}
export function raceTiming(race) {
  const parts = dateParts(race.date),
    zone = race.timeZone || "Europe/Sofia";
  if (!parts || !formatter(zone))
    return { startMs: undefined, endMs: undefined, dayStamp: undefined, zone };
  const nextDate = new Date(parts.stamp + day).toISOString().slice(0, 10);
  const endMs = zonedTime(nextDate, "00:00", zone);
  return {
    startMs: race.startTime
      ? zonedTime(race.date, race.startTime, zone)
      : undefined,
    endMs,
    dayStamp: parts.stamp,
    zone,
  };
}
export function archivedRace(race, now = Date.now()) {
  const timing = raceTiming(race);
  return (
    ["completed", "cancelled"].includes(race.status) ||
    (timing.endMs !== undefined && timing.endMs <= now)
  );
}
export function countdownText(race, now = Date.now()) {
  if (["completed", "cancelled"].includes(race.status)) return "";
  const timing = raceTiming(race);
  if (timing.endMs === undefined || timing.endMs <= now) return "";
  if (race.startTime) {
    if (timing.startMs === undefined)
      return "Началният час се нуждае от уточнение.";
    const left = timing.startMs - now;
    if (left <= 0) return "Началният час е настъпил.";
    const minutes = Math.ceil(left / 60000);
    return `Остават ${Math.floor(minutes / 1440)} дни · ${Math.floor((minutes % 1440) / 60)} ч · ${minutes % 60} мин`;
  }
  const format = formatter(timing.zone);
  const today = Math.floor(wallStamp(now, format) / day) * day;
  const days = Math.round((timing.dayStamp - today) / day);
  return days === 0
    ? "Днес · часът предстои"
    : `Остават ${days} ${days === 1 ? "ден" : "дни"} · часът предстои`;
}
export function formatRaceDate(race) {
  const parts = dateParts(race.date);
  if (!parts) return "Датата предстои";
  const date = new Intl.DateTimeFormat("bg-BG", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parts.stamp);
  return `${date}${race.startTime && zonedTime(race.date, race.startTime, race.timeZone || "Europe/Sofia") !== undefined ? ` · ${race.startTime} (${race.timeZone || "Europe/Sofia"})` : ""}`;
}
