import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRoute, smoothSegment, detectHills, elevationQuality, profilePoint, parseTargetTime, planPace, formatDuration, validLapCount } from "../src/lib/route-analysis.mjs";
import { distanceOf } from "../src/lib/geo.mjs";
const metresPerDegree = 6371008.8 * Math.PI / 180;
const point = (x, ele = 100) => ({ lat: 0, lon: x / metresPerDegree, ele });
const line = (length, slope = 0, start = 100, step = 20) => Array.from({ length: Math.round(length / step) + 1 }, (_, i) => point(i * step, start + i * step * slope));
const near = (actual, expected, tolerance = .001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test("distance-weighted smoothing is independent of GPS point density", () => {
  const sparse = [point(0, 0), point(400, 40)], dense = line(400, .1, 0, 1);
  for (const windowM of [50, 100, 200, 500]) {
    const a = smoothSegment(sparse, windowM), b = smoothSegment(dense, windowM);
    for (let i = 0; i < a.length; i++) near(a[i].ele, b[i].ele);
    near(a[20].ele, 20);
  }
  near(smoothSegment(sparse, 100)[0].ele, 2.5);
});

test("separate GPX segments and laps never add distance, ascent or artificial hills at joins", () => {
  const segments = [line(400, 0, 100), line(400, 0, 1000).map((p) => ({ ...p, lat: 20 }))];
  const one = analyzeRoute(segments, { trusted: true });
  const two = analyzeRoute(segments, { trusted: true, lapCount: 2 });
  near(two.distanceM, distanceOf(segments) * 2);
  near(one.ascentM, 0); near(two.ascentM, 0); near(two.descentM, 0);
  assert.equal(two.segments.length, 4); assert.equal(two.hills.length, 0);
  near(two.segments[2][0].x, one.distanceM);
  assert.equal(profilePoint(two, one.distanceM).lap, 2);
  assert.equal(profilePoint(two, two.distanceM).lap, 2);
  for (const s of two.segments) assert.equal(s[0].grade, undefined);
});

test("inclines and descents use smoothed grade thresholds and retain their segment", () => {
  const profile = analyzeRoute([line(600, .08), line(600, -.06, 900)], { trusted: true, windowM: 50 });
  assert.ok(profile.ascentM > 40); assert.ok(profile.descentM > 30);
  assert.equal(profile.hills.length, 2);
  assert.equal(profile.hills[0].type, "up"); assert.equal(profile.hills[1].type, "down");
  assert.equal(profile.hills[1].segment, 1);
  assert.ok(profile.hills[0].maxGrade <= .08001);
  assert.equal(detectHills([{ x: 0, ele: 0 }, { x: 50, ele: 15 }]).length, 0);
  assert.equal(detectHills([{ x: 0, ele: 0 }, { x: 1000, ele: 5 }]).length, 0);
  const bridged = detectHills([{ x: 0, ele: 0 }, { x: 100, ele: 10 }, { x: 140, ele: 10.4 }, { x: 240, ele: 20.4 }]);
  near(bridged[0].gainM, 20.4);
});

test("missing, untrusted and sparse elevation never produce invented ascent or effort", () => {
  for (const segments of [[line(200).map(({ lat, lon }) => ({ lat, lon }))], [[point(0), point(1001)]]]) {
    const profile = analyzeRoute(segments, { trusted: true });
    assert.equal(profile.available, false); assert.equal(profile.ascentM, undefined);
    assert.throws(() => planPace(profile, 3600, { strategy: "effort" }));
    assert.equal(planPace(profile, 3600).rows.at(-1).cumulativeSeconds, 3600);
  }
  assert.equal(analyzeRoute([line(200)], {}).available, false);
  assert.equal(elevationQuality([[point(0, Infinity), point(20)]]), "missing");
  assert.throws(() => analyzeRoute([[{ lat: 91, lon: 0 }, point(20)]]));
  for (const lapCount of [0, -1, 1.5, "2", 11]) { assert.equal(validLapCount(lapCount), false); assert.throws(() => analyzeRoute([line(200)], { lapCount })); }
});

test("pace rows and lap checkpoints sum exactly to target including partial kilometres", () => {
  const profile = analyzeRoute([line(1480, .06), line(600, -.08, 180)], { trusted: true, lapCount: 2 });
  for (const strategy of ["even", "effort"]) for (const target of [7201, 1, 172800]) {
    const result = planPace(profile, target, { strategy });
    assert.equal(result.rows.reduce((n, r) => n + r.seconds, 0), target);
    assert.equal(result.rows.at(-1).cumulativeSeconds, target);
    assert.equal(result.checkpoints.at(-1).seconds, target);
    assert.equal(result.checkpoints.length, 2);
    assert.ok(result.rows.at(-1).lengthM < 1000);
    assert.ok(result.rows.every((r) => r.seconds >= 0));
  }
  const result = planPace(profile, 7201, { strategy: "effort" });
  assert.ok(result.rows[0].pace > result.rows[1].pace);
  assert.throws(() => planPace(profile, 0));
  assert.throws(() => planPace(profile, 3600, { uphill: 9 }));
  assert.throws(() => planPace(profile, 3600, { downhill: -1 }));
  assert.throws(() => planPace(profile, 3600, { strategy: "magic" }));
});

test("target time parsing rejects invalid values without permissive numeric conversion", () => {
  for (const value of ["", "00:00:00", "2:70:00", "02:00", "-1:20:00", "49:00:00", "Infinity", "02:00:00x", "48:00:01"]) assert.equal(parseTargetTime(value), undefined);
  assert.equal(parseTargetTime("02:00:01"), 7201);
  assert.equal(parseTargetTime("48:00:00"), 172800);
  assert.equal(formatDuration(7201), "02:00:01");
});
