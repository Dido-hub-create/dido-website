import {
  existsSync,
  readdirSync,
  readFileSync,
  lstatSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, relative, extname, sep } from "node:path";
import {
  parseGpx,
  trimGpx,
  gpxStats,
  publicMapData,
  serializeGpx,
} from "./gpx.mjs";
import { readEntries, validEntryId } from "./entry-files.mjs";
import { gpxFilename } from "./download-name.mjs";
import { elevationQuality, validLapCount } from "./route-analysis.mjs";

const text = (value) => (typeof value === "string" ? value.trim() : "");
export const routeTypes = {
  road: "Шосе",
  park: "Парк",
  trail: "Пътека",
  mixed: "Смесен",
};
export function safeExternalLink(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function referenceId(value, collection) {
  const source = text(value).replace(/^\//, "");
  const prefix = `src/content/${collection}/`;
  const id = source.startsWith(prefix)
    ? source.slice(prefix.length).replace(/\.(json|md)$/, "")
    : source;
  const valid = validEntryId(id, collection === "posts");
  return valid ? id : undefined;
}
export function resolveGpxSource(root, value) {
  let path;
  try {
    path = decodeURIComponent(text(value));
  } catch {
    throw new Error("Невалиден път към GPX файл.");
  }
  if (
    !path.startsWith("/gpx-source/") ||
    path.includes("\\") ||
    path.includes("\0")
  )
    throw new Error("Изходният GPX трябва да е в отделната GPX медийна папка.");
  const filename = path.slice("/gpx-source/".length);
  if (
    !filename ||
    filename
      .split("/")
      .some((part) => !part || part === "." || part === "..") ||
    filename === ".." ||
    extname(filename).toLowerCase() !== ".gpx"
  )
    throw new Error("Невалиден път към GPX файл.");
  const directory = resolve(root, "src/data/gpx");
  const file = resolve(directory, filename);
  if (
    relative(directory, file).startsWith("..") ||
    !existsSync(file) ||
    lstatSync(file).isSymbolicLink() ||
    realpathSync(file) !== file ||
    lstatSync(file).size > 5 * 1024 * 1024
  )
    throw new Error("Изходният GPX файл липсва или не може да се използва.");
  return file;
}
export function assertNoPublicGpx(root = process.cwd()) {
  function walk(directory) {
    if (!existsSync(directory)) return;
    for (const name of readdirSync(directory)) {
      const path = join(directory, name),
        stat = lstatSync(path);
      if (stat.isSymbolicLink())
        throw new Error(
          "Символни връзки в public/ не са разрешени: риск от публикуване на изходни GPX данни.",
        );
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }
      const header = readFileSync(path).subarray(0, 4096).toString("utf8");
      if (/\.gpx$/i.test(name) || /<(?:(?:[\w-]+):)?gpx\b/i.test(header))
        throw new Error(
          "GPX файл в public/ е забранен. Преместете изходния файл в src/data/gpx; draft не защитава публични файлове.",
        );
    }
  }
  walk(resolve(root, "public"));
}
export function loadRoutes(root = process.cwd()) {
  return readEntries(root, "routes")
    .filter(
      ({ data }) => data.status === "published" && data.publicApproved === true,
    )
    .map(({ id, data }) => {
      const base = `/byagane/marshruti/${encodeURIComponent(id)}/`;
      let segments = [],
        error;
      try {
        const file = resolveGpxSource(root, data.gpx);
        segments = trimGpx(
          parseGpx(readFileSync(file, "utf8")),
          data.trimStartM ?? 0,
          data.trimEndM ?? 0,
        );
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : "";
        error =
          /^(Празен или прекалено голям|Невалиден или неподдържан|Липсва GPX документ|Твърде много GPS точки|Невалидни GPS координати|GPX файлът няма използваемо|Невалидно разстояние за премахване|Премахването на началото|Невалиден път към GPX|Изходният GPX трябва|Изходният GPX файл липсва)/.test(
            message,
          )
            ? message
            : "GPX файлът не може да се обработи.";
      }
      const valid = !error && segments.length > 0;
      const lapCount = data.lapCount === undefined ? 1 : data.lapCount;
      const analysisStatus = !valid || data.publishMap !== true || !validLapCount(lapCount) ? "unavailable"
        : data.allowElevationAnalysis !== true ? "disabled"
        : data.elevationTrusted !== true ? "untrusted" : elevationQuality(segments);
      const stats = valid
        ? gpxStats(segments, data.elevationTrusted === true)
        : { distanceM: undefined, ascentM: undefined };
      return {
        id,
        title: text(data.title) || "Маршрут без заглавие",
        downloadName: gpxFilename(text(data.title) || "Маршрут без заглавие"),
        description: text(data.description),
        location: text(data.location),
        surface: routeTypes[data.surface] ? data.surface : "mixed",
        cover: text(data.cover),
        coverFrame: data.coverFrame,
        gallery: Array.isArray(data.gallery)
          ? data.gallery.filter((item) => typeof item === "string")
          : [],
        galleryFrame: data.galleryFrame,
        imageFrames: Array.isArray(data.imageFrames) ? data.imageFrames : [],
        href: base,
        lapCount: validLapCount(lapCount) ? lapCount : 1,
        analysisStatus,
        analysisHref: analysisStatus === "ready" ? `${base}analysis.json` : undefined,
        includeInComparison: validLapCount(lapCount) && (data.includeInComparison === undefined || data.includeInComparison === true),
        includeInCalculator: validLapCount(lapCount) && (data.includeInCalculator === undefined || data.includeInCalculator === true),
        mapHref:
          valid && data.publishMap === true ? `${base}map.json` : undefined,
        gpxHref:
          valid && data.allowDownload === true ? `${base}trace.gpx` : undefined,
        publishMap: data.publishMap === true,
        allowDownload: data.allowDownload === true,
        raceId: referenceId(data.race, "races"),
        postId: referenceId(data.post, "posts"),
        trimmed: (data.trimStartM ?? 0) > 0 || (data.trimEndM ?? 0) > 0,
        segments,
        error,
        ...stats,
      };
    });
}
export function loadRaces(root = process.cwd()) {
  return readEntries(root, "races")
    .filter(({ data }) => data.publicationStatus === "published")
    .map(({ id, data }) => ({
      id,
      href: `/byagane/sastezaniya/${encodeURIComponent(id)}/`,
      title: text(data.title) || "Състезание без заглавие",
      date: text(data.date),
      startTime: text(data.startTime),
      timeZone: text(data.timeZone) || "Europe/Sofia",
      location: text(data.location),
      distance: text(data.distance),
      status: ["planned", "confirmed", "completed", "cancelled"].includes(
        data.status,
      )
        ? data.status
        : "planned",
      cover: text(data.cover),
      coverFrame: data.coverFrame,
      notes: text(data.notes),
      result: text(data.result),
      placing: text(data.placing),
      gallery: Array.isArray(data.gallery)
        ? data.gallery.filter((item) => typeof item === "string")
        : [],
      galleryFrame: data.galleryFrame,
      imageFrames: Array.isArray(data.imageFrames) ? data.imageFrames : [],
      officialUrl: safeExternalLink(data.officialUrl),
      routeId: referenceId(data.route, "routes"),
      postId: referenceId(data.post, "posts"),
    }))
    .sort(
      (a, b) =>
        (a.date || "9999").localeCompare(b.date || "9999") ||
        a.id.localeCompare(b.id),
    );
}
export function mapPayload(route) {
  return publicMapData(route.segments);
}
export function analysisPayload(route) {
  if (!route.analysisHref || route.analysisStatus !== "ready") throw new Error("Неразрешен височинен анализ.");
  return { segments: route.segments.map((s) => s.map(({ lat, lon, ele }) => ({ lat, lon, ele }))), lapCount: route.lapCount };
}
// Whitelist: never serialize a route object containing source geometry or paths.
export function analysisSummary(route) {
  return { id: route.id, title: route.title, href: route.href, mapHref: route.mapHref,
    profileHref: route.analysisHref, baseDistanceM: route.distanceM,
    distanceM: route.distanceM === undefined || route.analysisStatus === "unavailable" ? undefined : route.distanceM * route.lapCount,
    lapCount: route.lapCount, status: route.analysisStatus,
    comparison: route.includeInComparison, calculator: route.includeInCalculator };
}
export function assertGeneratedAnalysis(root = process.cwd()) {
  const directory = resolve(root, "dist");
  const allowed = new Map(loadRoutes(root).filter((r) => r.analysisHref).map((r) => [decodeURIComponent(r.analysisHref).slice(1), JSON.stringify(analysisPayload(r))]));
  function walk(folder) {
    if (!existsSync(folder)) return;
    for (const name of readdirSync(folder)) {
      const file = join(folder, name), stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error("Символна връзка в статичния build.");
      if (stat.isDirectory()) walk(file);
      else if (name === "analysis.json") {
        const key = relative(directory, file).split(sep).join("/");
        if (!allowed.has(key) || readFileSync(file, "utf8") !== allowed.get(key)) throw new Error("Неразрешени височинни данни в статичния build.");
      }
    }
  }
  walk(directory);
}
export function downloadPayload(route) {
  return serializeGpx(route.segments, route.title);
}
// Static Astro endpoints do not preserve Response headers. Cloudflare reads this
// generated file instead; filenames are ASCII and contain no header delimiters.
export function writeGpxHeaders(root = process.cwd()) {
  const rules = loadRoutes(root).filter((route) => route.gpxHref).map((route) =>
    `${route.gpxHref}\n  Content-Type: application/gpx+xml; charset=utf-8\n  Content-Disposition: attachment; filename="${route.downloadName}"\n  X-Content-Type-Options: nosniff\n`,
  );
  writeFileSync(resolve(root, "dist/_headers"), rules.join("\n"));
}
export function allowedGpxFiles(root = process.cwd()) {
  return new Map(
    loadRoutes(root)
      .filter((route) => route.gpxHref)
      .map((route) => [
        decodeURIComponent(route.gpxHref).slice(1),
        downloadPayload(route),
      ]),
  );
}
export function assertGeneratedGpx(root = process.cwd()) {
  const allowed = allowedGpxFiles(root),
    directory = resolve(root, "dist");
  function walk(folder) {
    if (!existsSync(folder)) return;
    for (const name of readdirSync(folder)) {
      const file = join(folder, name),
        stat = lstatSync(file);
      if (stat.isSymbolicLink())
        throw new Error("Символна връзка в статичния build.");
      if (stat.isDirectory()) {
        walk(file);
        continue;
      }
      if (/\.gpx$/i.test(name)) {
        const key = relative(directory, file).split(sep).join("/");
        if (
          !allowed.has(key) ||
          readFileSync(file, "utf8") !== allowed.get(key)
        )
          throw new Error("Неразрешен GPX файл в статичния build.");
      }
    }
  }
  walk(directory);
}
export function distanceLabel(value) {
  return Number.isFinite(value)
    ? `${(value / 1000).toLocaleString("bg-BG", { maximumFractionDigits: 2 })} км`
    : "Няма данни";
}
export function ascentLabel(value) {
  return Number.isFinite(value)
    ? `${Math.round(value).toLocaleString("bg-BG")} м`
    : "Няма данни";
}
