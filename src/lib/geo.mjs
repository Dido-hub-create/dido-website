// Shared by the existing GPX pipeline and the browser-only analysis tools.
export function distanceBetween(a, b) {
  const rad = (value) => (value * Math.PI) / 180;
  const lat = rad(b.lat - a.lat), lon = rad(b.lon - a.lon);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(lon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function distanceOf(segments) {
  return segments.reduce((total, segment) => total + segment.slice(1).reduce(
    (sum, point, index) => sum + distanceBetween(segment[index], point), 0), 0);
}
