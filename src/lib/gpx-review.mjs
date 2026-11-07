import { auditElevation } from "./elevation-audit.mjs";
import { analyzeRoute, WINDOWS } from "./route-analysis.mjs";
import { distanceBetween } from "./geo.mjs";
import { topClimbs } from "./profile-terrain.mjs";

/** Local diagnostic, NOT approval of elevation accuracy or public GPS disclosure.
 * Explicitly whitelist aggregates: no geometry, file paths, names or telemetry.
 */
export function reviewGpx(segments, { lapCount = 1 } = {}) {
  // Also validates geometry/lapCount when elevations are missing.
  const initial = analyzeRoute(segments, { trusted: true, lapCount });
  const audit = auditElevation(segments), first = segments[0][0], last = segments.at(-1).at(-1);
  const complete = audit.complete && audit.quality !== "missing";
  let rawAscentM = 0, rawDescentM = 0;
  if (complete) for (const segment of segments) for (let i = 1; i < segment.length; i++) {
    rawAscentM += Math.max(0, segment[i].ele - segment[i - 1].ele);
    rawDescentM += Math.max(0, segment[i - 1].ele - segment[i].ele);
  }
  const interval = (c) => ({ rank: c.rank, segment: c.segment, lap: c.lap, startM: c.startM, endM: c.endM,
    lengthM: c.lengthM, gainM: c.gainM, averageGrade: c.averageGrade, maxGrade: c.maxGrade, type: c.type });
  return {
    purpose: "local-review-only", publicationApproved: false, lapCount,
    geometry: { pointCount: audit.pointCount, segmentCount: audit.segmentCount,
      baseDistanceM: initial.baseDistanceM, distanceM: initial.distanceM,
      endpointsSeparationM: distanceBetween(first, last), medianSpacingM: audit.medianSpacingM, maxSpacingM: audit.maxSpacingM,
      zeroLengthEdges: audit.zeroLengthEdges },
    elevation: { heightCount: audit.heightCount, complete, quality: audit.quality,
      minM: audit.minHeightM, maxM: audit.maxHeightM,
      rangeM: audit.minHeightM === undefined ? undefined : audit.maxHeightM - audit.minHeightM,
      uniqueHeights: audit.uniqueHeights, maxAdjacentChangeM: audit.maxHeightJumpM,
      zeroLengthHeightChanges: audit.zeroLengthHeightChanges,
      rawAscentM: complete ? rawAscentM * lapCount : undefined,
      rawDescentM: complete ? rawDescentM * lapCount : undefined },
    profiles: WINDOWS.map((windowM) => {
      const p = analyzeRoute(segments, { trusted: true, lapCount, windowM });
      if (!p.available) return { windowM, available: false, quality: p.quality, topClimbs: [], steepSections: [] };
      let maxUphillGrade = 0, maxDownhillGrade = 0;
      for (const segment of p.segments) for (const point of segment.slice(1)) {
        maxUphillGrade = Math.max(maxUphillGrade, point.grade);
        maxDownhillGrade = Math.min(maxDownhillGrade, point.grade);
      }
      return { windowM, available: true, startM: p.startM, endM: p.segments.at(-1).at(-1).ele,
        minM: p.minM, maxM: p.maxM, rangeM: p.maxM - p.minM,
        ascentM: p.ascentM, descentM: p.descentM,
        maxAbsoluteGrade: Math.max(maxUphillGrade, -maxDownhillGrade), maxUphillGrade, maxDownhillGrade,
        topClimbs: topClimbs(p).map(interval), steepSections: p.hills.map(interval) };
    }),
  };
}
