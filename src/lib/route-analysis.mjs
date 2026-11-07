import { detectClimbs } from "./profile-terrain.mjs";
import { distanceBetween, distanceOf } from "./geo.mjs";

export const WINDOWS = [25, 50, 100, 200];
export const MAX_LAPS = 10;
export const MAX_PROFILE_EDGE_M = 1000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const validLapCount = (value) => Number.isInteger(value) && value >= 1 && value <= MAX_LAPS;

export function elevationQuality(segments) {
  if (!Array.isArray(segments) || !segments.length) return "unavailable";
  if (segments.some((s) => !Array.isArray(s) || s.length < 2 || s.some((p) => !Number.isFinite(p.ele) || p.ele < -1000 || p.ele > 10000))) return "missing";
  if (segments.some((s) => s.some((p, i) => i && distanceBetween(s[i - 1], p) > MAX_PROFILE_EDGE_M + 0.001))) return "gaps";
  return "ready";
}

export const PROFILE_MESSAGES = {
  disabled: "Височинният анализ не е разрешен за този маршрут. Не публикуваме нови височинни данни; налична е само стратегия с равномерно темпо.",
  untrusted: "Надеждността на височините не е потвърдена. Не изчисляваме денивелация или усилие по наклон; използвай равномерно темпо.",
  missing: "Липсват пълни височинни данни. Не допълваме липсващите стойности и не показваме измислена денивелация.",
  gaps: "Има над 1 км между съседни точки в един GPX сегмент — възможно прекъсване или много рядко измерване. Височинният профил е недостатъчно надежден за този анализ; използвай равномерно темпо.",
  unavailable: "Няма валидно трасе с разрешено публично показване на карта за анализ.",
};

function validateGeometry(segments) {
  if (!Array.isArray(segments) || !segments.length || segments.flat().length > 50000 ||
      segments.some((s) => !Array.isArray(s) || s.length < 2 || s.some((p) => !p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)))
    throw new Error("Невалидни данни за анализ на трасе.");
}

// Piecewise-linear elevation integral, weighted by metres, not point count.
function measuredSegment(segment) {
  const points = [{ ...segment[0], x: 0, area: 0 }];
  for (const p of segment.slice(1)) {
    const last = points.at(-1), dx = distanceBetween(last, p);
    if (dx <= 1e-6) continue;
    points.push({ ...p, x: last.x + dx, area: last.area + dx * (last.ele + p.ele) / 2 });
  }
  return points;
}
function bracket(points, x) {
  let lo = 0, hi = points.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (points[mid].x <= x) lo = mid; else hi = mid; }
  return lo;
}
function valueAt(points, x) {
  const a = points[bracket(points, x)], b = points[Math.min(points.length - 1, bracket(points, x) + 1)];
  const t = b.x > a.x ? clamp((x - a.x) / (b.x - a.x), 0, 1) : 0;
  const ele = a.ele + t * (b.ele - a.ele);
  const dLon = ((b.lon - a.lon + 540) % 360) - 180;
  return { lat: a.lat + t * (b.lat - a.lat), lon: ((a.lon + t * dLon + 540) % 360) - 180, ele, area: a.area + (x - a.x) * (a.ele + ele) / 2 };
}
export function smoothSegment(segment, windowM = 100, stepM = 10) {
  if (!WINDOWS.includes(windowM) || !Number.isFinite(stepM) || stepM <= 0) throw new Error("Невалиден прозорец за изглаждане.");
  const measured = measuredSegment(segment), length = measured.at(-1).x;
  if (length <= 0) return [];
  const positions = [];
  for (let x = 0; x < length - 1e-6; x += stepM) positions.push(x);
  positions.push(length);
  return positions.map((x) => {
    const left = Math.max(0, x - windowM / 2), right = Math.min(length, x + windowM / 2);
    return { ...valueAt(measured, x), x, ele: (valueAt(measured, right).area - valueAt(measured, left).area) / (right - left) };
  });
}

export function detectHills(points, { gradeThreshold = 0.02, minLengthM = 100, minGainM = 10, bridgeM = 50 } = {}) {
  const hills = [];
  for (const direction of [1, -1]) {
    let start, end, gain = 0, maxGrade = 0, flat = 0, pendingGain = 0;
    const finish = () => {
      if (start && end && end.x - start.x >= minLengthM && gain >= minGainM)
        hills.push({ type: direction > 0 ? "up" : "down", startM: start.x, endM: end.x, lengthM: end.x - start.x,
          gainM: gain, averageGrade: (end.ele - start.ele) / (end.x - start.x), maxGrade: direction * maxGrade });
      start = undefined; end = undefined; gain = 0; maxGrade = 0; flat = 0; pendingGain = 0;
    };
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b.x - a.x;
      if (dx <= 0) continue;
      const grade = (b.ele - a.ele) / dx * direction;
      if (grade >= gradeThreshold) {
        start ??= a; end = b; gain += pendingGain + Math.max(0, (b.ele - a.ele) * direction);
        maxGrade = Math.max(maxGrade, grade); flat = 0; pendingGain = 0;
      } else if (start && grade >= 0) {
        flat += dx;
        pendingGain += Math.max(0, (b.ele - a.ele) * direction);
        if (flat > bridgeM) finish();
      } else finish();
    }
    finish();
  }
  return hills.sort((a, b) => a.startM - b.startM);
}

export function analyzeRoute(segments, { windowM = 100, lapCount = 1, trusted = false } = {}) {
  validateGeometry(segments);
  if (!validLapCount(lapCount) || !WINDOWS.includes(windowM)) throw new Error("Невалиден брой обиколки или прозорец.");
  const baseDistanceM = distanceOf(segments), distanceM = baseDistanceM * lapCount;
  if (!(distanceM > 0)) throw new Error("Трасето няма измерима дистанция.");
  const quality = trusted ? elevationQuality(segments) : "untrusted";
  if (quality !== "ready") return { available: false, quality, baseDistanceM, distanceM, lapCount, segments: [], hills: [] };
  const base = [], baseHills = [], baseClimbs = [];
  let offset = 0, ascentM = 0, descentM = 0;
  const step = Math.max(10, baseDistanceM / 5000);
  for (const segment of segments) {
    const smooth = smoothSegment(segment, windowM, step);
    if (smooth.length < 2) continue;
    const points = smooth.map((p, i) => ({ lat: p.lat, lon: p.lon, ele: p.ele, x: offset + p.x,
      grade: i ? (p.ele - smooth[i - 1].ele) / (p.x - smooth[i - 1].x) : undefined }));
    for (let i = 1; i < smooth.length; i++) {
      const delta = smooth[i].ele - smooth[i - 1].ele;
      ascentM += Math.max(0, delta); descentM += Math.max(0, -delta);
    }
    baseClimbs.push(...detectClimbs(smooth).map((c) => ({ ...c, segment: base.length, startM: c.startM + offset, endM: c.endM + offset })));
    baseHills.push(...detectHills(smooth).map((h) => ({ ...h, segment: base.length, startM: h.startM + offset, endM: h.endM + offset })));
    base.push(points); offset += smooth.at(-1).x;
  }
  const repeated = [], hills = [], climbs = [];
  for (let lap = 0; lap < lapCount; lap++) {
    for (const points of base) repeated.push(points.map((p) => ({ ...p, x: p.x + lap * baseDistanceM, lap: lap + 1 })));
    for (const c of baseClimbs) climbs.push({ ...c, startM: c.startM + lap * baseDistanceM, endM: c.endM + lap * baseDistanceM, lap: lap + 1 });
    for (const h of baseHills) hills.push({ ...h, startM: h.startM + lap * baseDistanceM, endM: h.endM + lap * baseDistanceM, lap: lap + 1 });
  }
  const heights = base.flat().map((p) => p.ele);
  return { available: true, quality, baseDistanceM, distanceM, lapCount, windowM, segments: repeated, hills, climbs,
    startM: base[0][0].ele, minM: Math.min(...heights), maxM: Math.max(...heights), ascentM: ascentM * lapCount, descentM: descentM * lapCount };
}

export function profilePoint(profile, distanceM) {
  if (!profile.available) return undefined;
  const x = clamp(distanceM, 0, profile.distanceM);
  // Segment/lap boundaries are kept separate, even when their kilometre is equal.
  let chosen = profile.segments[0];
  for (const points of profile.segments) { if (points[0].x <= x) chosen = points; else break; }
  const i = bracket(chosen, x), a = chosen[i], b = chosen[Math.min(i + 1, chosen.length - 1)];
  return Math.abs(a.x - x) <= Math.abs(b.x - x) ? a : b;
}

export function parseTargetTime(value) {
  if (typeof value !== "string" || !/^\d{1,2}:[0-5]\d:[0-5]\d$/.test(value.trim())) return undefined;
  const [h, m, s] = value.trim().split(":").map(Number), total = h * 3600 + m * 60 + s;
  return total > 0 && total <= 48 * 3600 ? total : undefined;
}
export function formatDuration(value) {
  const seconds = Math.max(0, Math.round(value));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function formatPace(value) {
  const s = Math.round(value); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} /км`;
}

export function planPace(profile, targetSeconds, { strategy = "even", uphill = 4, downhill = 2 } = {}) {
  if (!Number.isInteger(targetSeconds) || targetSeconds <= 0 || targetSeconds > 48 * 3600 || !(profile.distanceM > 0) || !["even", "effort"].includes(strategy) ||
      !Number.isFinite(uphill) || uphill < 0 || uphill > 8 || !Number.isFinite(downhill) || downhill < 0 || downhill > 4)
    throw new Error("Въведи валидно целево време и параметри.");
  if (strategy === "effort" && !profile.available) throw new Error("Равномерното усилие изисква надежден разрешен височинен профил.");
  const edges = [];
  if (strategy === "even") edges.push({ start: 0, end: profile.distanceM, weight: 1 });
  else for (const segment of profile.segments) for (let i = 1; i < segment.length; i++) {
    const a = segment[i - 1], b = segment[i], grade = clamp((b.ele - a.ele) / (b.x - a.x), -0.1, 0.1);
    edges.push({ start: a.x, end: b.x, weight: clamp(1 + uphill * Math.max(0, grade) + downhill * Math.min(0, grade), 0.7, 1.8) });
  }
  const costs = [], checkpoints = [];
  let edgeIndex = 0, cumulativeCost = 0;
  for (let start = 0; start < profile.distanceM - 1e-6; start += 1000) {
    const end = Math.min(start + 1000, profile.distanceM); let cost = 0;
    while (edgeIndex < edges.length && edges[edgeIndex].end <= start + 1e-8) edgeIndex++;
    for (let j = edgeIndex; j < edges.length && edges[j].start < end; j++) {
      const edge = edges[j]; cost += Math.max(0, Math.min(end, edge.end) - Math.max(start, edge.start)) * edge.weight;
    }
    cumulativeCost += cost; costs.push({ startM: start, endM: end, lengthM: end - start, cost, cumulativeCost });
  }
  if (!(cumulativeCost > 0)) throw new Error("Няма достатъчно данни за стратегия.");
  let previousSeconds = 0;
  const rows = costs.map((row, i) => {
    const cumulativeSeconds = i === costs.length - 1 ? targetSeconds : Math.round(targetSeconds * row.cumulativeCost / cumulativeCost);
    const seconds = cumulativeSeconds - previousSeconds; previousSeconds = cumulativeSeconds;
    return { ...row, seconds, cumulativeSeconds, pace: seconds * 1000 / row.lengthM };
  });
  for (let lap = 1; lap <= (profile.lapCount ?? 1); lap++) {
    const x = Math.min(profile.distanceM, lap * (profile.baseDistanceM ?? profile.distanceM));
    const cost = edges.reduce((sum, edge) => sum + Math.max(0, Math.min(x, edge.end) - edge.start) * edge.weight, 0);
    checkpoints.push({ lap, distanceM: x, seconds: lap === profile.lapCount ? targetSeconds : Math.round(targetSeconds * cost / cumulativeCost) });
  }
  return { targetSeconds, averagePace: targetSeconds * 1000 / profile.distanceM, strategy, rows, checkpoints };
}
