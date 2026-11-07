/** Nice metric ticks with a small data-dependent margin; independent of smoothing. */
export function elevationAxis(minimum, maximum) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) throw new Error("Невалиден височинен диапазон.");
  const padding = Math.max(1, (maximum - minimum) * .05);
  const low = minimum - padding, high = maximum + padding;
  const desired = (high - low) / 6;
  let step = 5;
  while (step < desired) {
    const magnitude = 10 ** Math.floor(Math.log10(step));
    const digit = step / magnitude;
    step = digit < 2 ? 2 * magnitude : digit < 5 ? 5 * magnitude : 10 * magnitude;
  }
  let min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  if (min === 0 && low > 0) min = Math.floor(low) || low;
  const ticks = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * .001; value += step) ticks.push(value);
  return { min, max, step, ticks };
}

/** Subtract one route's smoothed starting height, never cumulative ascent. */
export function displayElevation(point, profile, mode = "absolute") {
  return point.ele - (mode === "relative" ? profile.startM : 0);
}
export function comparisonAxis(profiles, mode = "relative") {
  const available = profiles.filter((p) => p?.available);
  if (!available.length) throw new Error("Липсва надежден профил.");
  return elevationAxis(Math.min(...available.map((p) => p.minM - (mode === "relative" ? p.startM : 0))),
    Math.max(...available.map((p) => p.maxM - (mode === "relative" ? p.startM : 0))));
}
