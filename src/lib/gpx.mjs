import { XMLParser } from "fast-xml-parser";
import { SyntaxValidator } from "fast-xml-validator";
import { xmlText } from "./download-name.mjs";
import { distanceBetween, distanceOf } from "./geo.mjs";
export { distanceBetween, distanceOf } from "./geo.mjs";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_POINTS = 50000;
const array = (value) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const number = (value) =>
  typeof value === "string" &&
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())
    ? Number(value)
    : NaN;

/** Parse tracks/routes only. Never resolve entities or retain GPX metadata. */
export function parseGpx(xml) {
  if (
    typeof xml !== "string" ||
    !xml.trim() ||
    Buffer.byteLength(xml) > MAX_BYTES
  )
    throw new Error("Празен или прекалено голям GPX файл (максимум 5 MB).");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Невалиден или неподдържан GPX XML.");
  try {
    SyntaxValidator.validate(xml);
  } catch {
    throw new Error("Невалиден или неподдържан GPX XML.");
  }
  const parsed = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: false,
    removeNSPrefix: true,
  }).parse(xml);
  const root = parsed.gpx;
  if (!root || typeof root !== "object")
    throw new Error("Липсва GPX документ.");
  const raw = array(root.trk).flatMap((track) =>
    array(track?.trkseg).map((segment) => array(segment?.trkpt)),
  );
  raw.push(...array(root.rte).map((route) => array(route?.rtept)));
  let count = 0;
  const segments = raw
    .filter((segment) => segment.length)
    .map((segment) =>
      segment.map((point) => {
        if (++count > MAX_POINTS)
          throw new Error("Твърде много GPS точки (максимум 50 000).");
        const lat = number(point?.["@_lat"]);
        const lon = number(point?.["@_lon"]);
        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lon) ||
          Math.abs(lat) > 90 ||
          Math.abs(lon) > 180
        )
          throw new Error("Невалидни GPS координати.");
        const elevation = number(
          typeof point?.ele === "object" ? point.ele?.["#text"] : point?.ele,
        );
        const ele =
          Number.isFinite(elevation) && elevation >= -1000 && elevation <= 10000
            ? elevation
            : undefined;
        return { lat, lon, ...(ele === undefined ? {} : { ele }) };
      }),
    )
    .filter((segment) => segment.length >= 2);
  if (!segments.length || distanceOf(segments) <= 0)
    throw new Error(
      "GPX файлът няма използваемо трасе с поне две различни точки.",
    );
  return segments;
}

/** Whole points are discarded; never interpolate or fall back to the original. */
export function trimGpx(segments, startMetres = 0, endMetres = 0) {
  if (
    ![startMetres, endMetres].every(
      (value) =>
        typeof value === "number" && Number.isFinite(value) && value >= 0,
    )
  )
    throw new Error("Невалидно разстояние за премахване.");
  const total = distanceOf(segments);
  if (startMetres + endMetres >= total)
    throw new Error(
      "Премахването на началото и края не оставя достатъчно трасе.",
    );
  let travelled = 0;
  const result = segments
    .map((segment) =>
      segment
        .filter((point, index) => {
          if (index) travelled += distanceBetween(segment[index - 1], point);
          return travelled >= startMetres && travelled <= total - endMetres;
        })
        .map((point) => ({
          ...point,
          lat: Number(point.lat.toFixed(6)),
          lon: Number(point.lon.toFixed(6)),
        })),
    )
    .filter((segment) => segment.length >= 2);
  if (!result.length || distanceOf(result) <= 0)
    throw new Error(
      "Премахването на началото и края не оставя достатъчно трасе.",
    );
  return result;
}
export function gpxStats(segments, elevationTrusted = false) {
  const complete = segments.flat().every((point) => Number.isFinite(point.ele));
  const ascentM =
    elevationTrusted === true && complete
      ? segments.reduce(
          (total, segment) =>
            total +
            segment
              .slice(1)
              .reduce(
                (sum, point, index) =>
                  sum + Math.max(0, point.ele - segment[index].ele),
                0,
              ),
          0,
        )
      : undefined;
  return { distanceM: distanceOf(segments), ascentM };
}
export function publicMapData(segments) {
  return {
    segments: segments.map((segment) =>
      segment.map(({ lat, lon }) => [lat, lon]),
    ),
  };
}
export function serializeGpx(segments, title = "Маршрут без заглавие") {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="DIDO" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>' + xmlText(title) + '</name>' +
    segments
      .map(
        (segment) =>
          "<trkseg>" +
          segment
            .map(
              (point) =>
                `<trkpt lat="${point.lat}" lon="${point.lon}">${point.ele === undefined ? "" : `<ele>${point.ele}</ele>`}</trkpt>`,
            )
            .join("") +
          "</trkseg>",
      )
      .join("") +
    "</trk></gpx>\n"
  );
}
