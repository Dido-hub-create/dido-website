import { distanceBetween, distanceOf } from "./geo.mjs";
import { analyzeRoute, WINDOWS, elevationQuality } from "./route-analysis.mjs";
const quantile = (values, q) => {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)];
};
/** Aggregate diagnostics only; does not grant publication or certify absolute accuracy. */
export function auditElevation(segments) {
  const points = segments.flat(), heights = points.map((p) => p.ele).filter(Number.isFinite);
  const edges = segments.flatMap((s) => s.slice(1).map((p, i) => ({ distance: distanceBetween(s[i], p), delta: p.ele - s[i].ele })));
  const positive = edges.filter((e) => e.distance > 1e-6);
  return {
    pointCount: points.length, segmentCount: segments.length, distanceM: distanceOf(segments), heightCount: heights.length,
    complete: heights.length === points.length, quality: elevationQuality(segments),
    minHeightM: heights.length ? Math.min(...heights) : undefined, maxHeightM: heights.length ? Math.max(...heights) : undefined,
    uniqueHeights: new Set(heights).size, zeroLengthEdges: edges.length - positive.length,
    zeroLengthHeightChanges: edges.filter((e) => e.distance <= 1e-6 && e.delta !== 0).length,
    medianSpacingM: quantile(positive.map((e) => e.distance), .5), maxSpacingM: quantile(positive.map((e) => e.distance), 1),
    maxHeightJumpM: quantile(edges.filter((e) => Number.isFinite(e.delta)).map((e) => Math.abs(e.delta)), 1),
    profiles: elevationQuality(segments) === "ready" ? WINDOWS.map((windowM) => {
      const profile = analyzeRoute(segments, { trusted: true, windowM });
      return { windowM, minM: profile.minM, maxM: profile.maxM, ascentM: profile.ascentM, descentM: profile.descentM,
        maxLocalGrade: quantile(profile.segments.flatMap((s) => s.slice(1).map((p) => Math.abs(p.grade))), 1), hills: profile.hills.length };
    }) : [],
  };
}
