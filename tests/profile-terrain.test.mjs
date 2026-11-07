import test from "node:test";
import assert from "node:assert/strict";
import { terrainRuns, detectClimbs, topClimbs, TERRAIN } from "../src/lib/profile-terrain.mjs";
import { analyzeRoute } from "../src/lib/route-analysis.mjs";
const R = 6371008.8 * Math.PI / 180;
const points = (slopes, step = 10, startEle = 100) => {
  let ele = startEle;
  return [{ x: 0, ele, lat: 0, lon: 0 }, ...slopes.map((grade, i) => {
    ele += grade * step;
    return { x: (i + 1) * step, ele, lat: 0, lon: (i + 1) * step / R };
  })];
};
const luminance = (hex) => {
  const v = hex.slice(1).match(/../g).map((n) => parseInt(n, 16) / 255).map((s) => s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4);
  return v[0] * .2126 + v[1] * .7152 + v[2] * .0722;
};
test("terrain has contrast plus labels and line patterns, without mutating source heights", () => {
  const p = points([...Array(20).fill(.02), ...Array(20).fill(0), ...Array(20).fill(-.02)]), before = structuredClone(p);
  const runs = terrainRuns(p);
  assert.deepEqual(runs.map((r) => r.kind), ["up", "flat", "down"]);
  assert.equal(runs[0].points.at(-1), runs[1].points[0]);
  assert.deepEqual(p, before);
  assert.equal(new Set(Object.values(TERRAIN).map((s) => s.dash)).size, 3);
  for (const style of Object.values(TERRAIN)) {
    assert.ok((luminance(style.color) + .05) / (luminance("#0e1828") + .05) >= 3);
    assert.ok(style.label.length > 3);
  }
});

test("hysteresis, short-run rejection and metre-based gap bridging prevent colour flicker", () => {
  assert.deepEqual(terrainRuns(points(Array.from({length: 80}, (_, i) => i % 2 ? -.008 : .008))).map((r) => r.kind), ["flat"]);
  const hysteresis = terrainRuns(points([...Array(12).fill(.01), ...Array.from({length:30}, (_, i) => i % 2 ? .004 : .006)]));
  assert.deepEqual(hysteresis.map((r) => r.kind), ["up"]);
  const bridge = terrainRuns(points([...Array(15).fill(.02), ...Array(3).fill(0), ...Array(15).fill(.02)]));
  assert.equal(bridge.length, 1); assert.equal(bridge[0].kind, "up");
  assert.equal(terrainRuns(points([.1,.1], 10))[0].kind, "flat");
  assert.equal(terrainRuns(points([.1,.1], 100))[0].kind, "up", "duration uses metres, not point count");
});

test("climbs rank by accumulated ascent with deterministic ties and never invent a third", () => {
  const profile = analyzeRoute([points([...Array(40).fill(.04), ...Array(40).fill(-.04), ...Array(60).fill(.04), ...Array(60).fill(-.04), ...Array(80).fill(.04)] )], {trusted:true,windowM:50});
  const top = topClimbs(profile);
  assert.equal(top.length, 3); assert.deepEqual(top.map((c) => c.rank), [1,2,3]);
  assert.ok(top[0].gainM >= top[1].gainM && top[1].gainM >= top[2].gainM);
  assert.ok(top.every((c) => c.lengthM >= 200 && c.gainM >= 10 && c.averageGrade >= .005));
  assert.deepEqual(topClimbs({available:false}), []);
  assert.equal(topClimbs({...profile,climbs:profile.climbs.slice(0,1)}).length, 1);
  assert.deepEqual(detectClimbs(points(Array.from({length:200}, (_,i) => i%2 ? -.03 : .03))), []);
});

test("climb dips stop at explicit limits; plateaus and separate laps/segments stay separate", () => {
  const bridged = detectClimbs(points([...Array(30).fill(.05), ...Array(10).fill(-.02), ...Array(30).fill(.05)]));
  assert.equal(bridged.length,1); assert.ok(Math.abs(bridged[0].gainM-30)<.001);
  const split = detectClimbs(points([...Array(30).fill(.05), ...Array(15).fill(-.05), ...Array(30).fill(.05)]));
  assert.equal(split.length,2);
  const longPlateau = detectClimbs(points([...Array(30).fill(.05), ...Array(40).fill(0), ...Array(30).fill(.05)]));
  assert.equal(longPlateau.length,2);
  const p = analyzeRoute([points(Array(60).fill(.05)), points(Array(60).fill(.04),10,800)], {trusted:true,lapCount:2,windowM:50});
  assert.equal(p.climbs.length,4);
  for(const c of p.climbs) {
    const segment = p.segments[c.segment + (c.lap-1)*2];
    assert.ok(c.startM >= segment[0].x - .001 && c.endM <= segment.at(-1).x + .001);
    assert.ok(c.gainM < 40, "no fake jump between 100 m and 800 m segments");
  }
  assert.equal(new Set(topClimbs(p).map((c) => c.lap)).size,2);
});
