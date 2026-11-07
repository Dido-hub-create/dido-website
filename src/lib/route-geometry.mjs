import { distanceOf } from "./geo.mjs";

/** Minimal approved source format. No GPX originals, text, metadata or telemetry. */
export function parseRouteGeometry(source) {
  if (typeof source !== "string" || Buffer.byteLength(source) > 5 * 1024 * 1024) throw new Error("Невалидна обработена геометрия (максимум 5 MB).");
  let data;
  try { data = JSON.parse(source); } catch { throw new Error("Невалидна обработена геометрия: очаква се JSON."); }
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length !== 1 || !Object.hasOwn(data, "segments") || !Array.isArray(data.segments) || !data.segments.length)
    throw new Error("Невалидна обработена геометрия: разрешено е само поле segments.");
  let count = 0;
  for (const segment of data.segments) {
    if (!Array.isArray(segment) || segment.length < 2) throw new Error("Невалидна обработена геометрия: сегментът изисква поне две точки.");
    for (const point of segment) {
      if (++count > 50000) throw new Error("Невалидна обработена геометрия: над 50 000 точки.");
      if (!point || typeof point !== "object" || Array.isArray(point) || Object.keys(point).some((key) => !["lat", "lon", "ele"].includes(key)) ||
          !Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180 ||
          (Object.hasOwn(point, "ele") && (!Number.isFinite(point.ele) || point.ele < -1000 || point.ele > 10000)))
        throw new Error("Невалидна обработена геометрия: разрешени са само валидни lat/lon и незадължителна ele.");
    }
  }
  if (distanceOf(data.segments) <= 0) throw new Error("Невалидна обработена геометрия: няма измеримо трасе.");
  return data.segments;
}
