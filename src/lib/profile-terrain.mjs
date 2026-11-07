// Display classification only: never changes elevations, grade or pace calculations.
export const TERRAIN = {
  up: { label: "↑ Изкачване", color: "#ff693d", dash: "" },
  down: { label: "↓ Спускане", color: "#22d881", dash: "9 3" },
  flat: { label: "→ Равно / слаб наклон", color: "#a4b1c2", dash: "2 3" },
};
export const TERRAIN_RULES = { enterGrade: .0075, exitGrade: .0035, minRunM: 100 };
function runsFrom(labels) {
  const runs = [];
  labels.forEach((kind, edge) => {
    if (runs.at(-1)?.kind === kind) runs.at(-1).endIndex = edge + 1;
    else runs.push({ kind, startIndex: edge, endIndex: edge + 1 });
  });
  return runs;
}
export function terrainRuns(points) {
  if (points.length < 2) return [];
  const { enterGrade, exitGrade, minRunM } = TERRAIN_RULES;
  let state = "flat";
  const labels = points.slice(1).map((b, i) => {
    const a = points[i], grade = b.x > a.x ? (b.ele - a.ele) / (b.x - a.x) : 0;
    if (grade >= enterGrade) state = "up";
    else if (grade <= -enterGrade) state = "down";
    else if (state === "up" && grade < exitGrade || state === "down" && grade > -exitGrade) state = "flat";
    return state;
  });
  for (const run of runsFrom(labels)) if (run.kind !== "flat" && points[run.endIndex].x - points[run.startIndex].x < minRunM - 1e-6)
    labels.fill("flat", run.startIndex, run.endIndex);
  const stable = runsFrom(labels);
  stable.forEach((run, i) => {
    if (run.kind === "flat" && points[run.endIndex].x - points[run.startIndex].x < minRunM - 1e-6 &&
        stable[i - 1]?.kind === stable[i + 1]?.kind && stable[i - 1]?.kind !== "flat" && stable[i - 1])
      labels.fill(stable[i - 1].kind, run.startIndex, run.endIndex);
  });
  return runsFrom(labels).map((run) => ({ ...run, points: points.slice(run.startIndex, run.endIndex + 1) }));
}

export const CLIMB_RULES = { minLengthM: 200, minGainM: 10, minAverageGrade: .005, maxDipM: 5, maxDipLengthM: 300 };
/** Valley to peak on ONE smoothed segment; tolerate only short shallow dips. */
export function detectClimbs(points) {
  if (points.length < 2) return [];
  const result = [], { minLengthM, minGainM, minAverageGrade, maxDipM, maxDipLengthM } = CLIMB_RULES;
  let start = points[0], peak = start, gain = 0, peakGain = 0, maxGrade = 0, peakMaxGrade = 0;
  function finish() {
    const lengthM = peak.x - start.x, averageGrade = lengthM > 0 ? (peak.ele - start.ele) / lengthM : 0;
    if (lengthM + 1e-6 >= minLengthM && peakGain + 1e-6 >= minGainM && averageGrade + 1e-9 >= minAverageGrade)
      result.push({ type: "up", startM: start.x, endM: peak.x, lengthM, gainM: peakGain, averageGrade, maxGrade: peakMaxGrade });
  }
  function reset(p) { start = p; peak = p; gain = 0; peakGain = 0; maxGrade = 0; peakMaxGrade = 0; }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x;
    if (dx <= 0) continue;
    gain += Math.max(0, b.ele - a.ele); maxGrade = Math.max(maxGrade, (b.ele - a.ele) / dx);
    if (b.ele > peak.ele + 1e-6) { peak = b; peakGain = gain; peakMaxGrade = maxGrade; }
    if (peak.ele <= start.ele + 1e-6 && b.ele <= start.ele) reset(b);
    else if (peak.ele - b.ele > maxDipM || b.x - peak.x > maxDipLengthM + 1e-6) { finish(); reset(b); }
  }
  finish();
  return result;
}
export function topClimbs(profile, count = 3) {
  if (!profile.available) return [];
  return [...(profile.climbs ?? [])].sort((a, b) => b.gainM - a.gainM || b.averageGrade - a.averageGrade || b.lengthM - a.lengthM || a.startM - b.startM || a.lap - b.lap || a.segment - b.segment)
    .slice(0, Math.max(0, Math.min(3, count))).map((climb, i) => ({ ...climb, rank: i + 1 }));
}
