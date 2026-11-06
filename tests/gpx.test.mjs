import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGpx,
  distanceOf,
  trimGpx,
  gpxStats,
  publicMapData,
  serializeGpx,
} from "../src/lib/gpx.mjs";
// Deliberately synthetic coordinates on latitude 0; never a real personal track.
const points = Array.from({ length: 9 }, (_, index) => ({
  lat: 0,
  lon: (index + 1) * 0.001111,
  ele: 100 + index * 5,
}));
const xml = (list = points) =>
  `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>SOURCE_PRIVATE_MARKER</name></metadata><wpt lat="1" lon="1"><name>PRIVATE_WAYPOINT</name></wpt><trk><trkseg>${list.map((point) => `<trkpt lat="${point.lat}" lon="${point.lon}">${point.ele === undefined ? "" : `<ele>${point.ele}</ele>`}<time>2099-01-01T00:00:00Z</time><extensions><secret>PRIVATE</secret></extensions></trkpt>`).join("")}</trkseg></trk></gpx>`;

test("GPX distance uses valid coordinates and never joins disconnected segments", () => {
  const parsed = parseGpx(xml());
  assert.ok(Math.abs(distanceOf(parsed) - 988.3) < 2);
  const split = [
    [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.001 },
    ],
    [
      { lat: 0, lon: 1 },
      { lat: 0, lon: 1.001 },
    ],
  ];
  assert.ok(Math.abs(distanceOf(split) - 222.39) < 1);
});
test("tracks and routes with namespace prefixes are supported; waypoints are not routes", () => {
  assert.equal(
    parseGpx(
      '<g:gpx xmlns:g="urn:gpx"><g:rte><g:rtept lat="0" lon="0"/><g:rtept lat="0" lon="0.01"/></g:rte></g:gpx>',
    )[0].length,
    2,
  );
  assert.throws(() => parseGpx('<gpx><wpt lat="0" lon="0"/></gpx>'));
});
test("empty, malformed, malicious and invalid-coordinate GPX is rejected", () => {
  for (const value of [
    "",
    " ",
    "<gpx>",
    "<not-gpx/>",
    '<gpx><rte><rtept lat="0x10" lon="0"/><rtept lat="0" lon="1"/></rte></gpx>',
    '<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]><gpx/>',
    xml([
      { lat: 91, lon: 0 },
      { lat: 0, lon: 0 },
    ]),
    '<gpx><trk><trkseg><trkpt lat="" lon="0"/><trkpt lat="0" lon="1"/></trkseg></trk></gpx>',
    xml([
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0 },
    ]),
  ])
    assert.throws(() => parseGpx(value));
  assert.throws(() => parseGpx(" ".repeat(5 * 1024 * 1024) + "x"));
});
test("both ends are physically removed and map/GPX use the same processed points", () => {
  const trimmed = trimGpx(parseGpx(xml()), 130, 130);
  assert.equal(trimmed[0].length, 5);
  const downloadable = serializeGpx(trimmed),
    map = publicMapData(trimmed);
  for (const privateValue of [
    "0.001111",
    "0.002222",
    "0.008888",
    "0.009999",
    "SOURCE_PRIVATE_MARKER",
    "PRIVATE_WAYPOINT",
    "2099-01-01",
    "extensions",
  ])
    assert.ok(!downloadable.includes(privateValue), privateValue);
  assert.deepEqual(publicMapData(parseGpx(downloadable)), map);
  assert.ok(distanceOf(trimmed) < distanceOf(parseGpx(xml())));
});
test("unsafe or excessive trimming fails closed without returning the original", () => {
  const parsed = parseGpx(xml());
  for (const start of [-1, Infinity, NaN, "100", 10000])
    assert.throws(() => trimGpx(parsed, start, 0));
  assert.throws(() => trimGpx(parsed, 500, 500));
});
test("elevation gain requires complete heights AND explicit reliable-source confirmation", () => {
  const parsed = parseGpx(xml());
  assert.equal(gpxStats(parsed).ascentM, undefined);
  assert.equal(gpxStats(parsed, true).ascentM, 40);
  const missing = parseGpx(
    xml(
      points.map((point, index) => ({
        ...point,
        ele: index === 3 ? undefined : point.ele,
      })),
    ),
  );
  assert.equal(gpxStats(missing, true).ascentM, undefined);
});
