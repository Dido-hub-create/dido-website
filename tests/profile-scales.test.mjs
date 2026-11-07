import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { elevationAxis, comparisonAxis, displayElevation } from "../src/lib/profile-scales.mjs";
import { auditElevation } from "../src/lib/elevation-audit.mjs";
import { parseGpx } from "../src/lib/gpx.mjs";
import { loadRoutes, analysisPayload } from "../src/lib/running.mjs";

test("elevation axes zoom to actual data and use readable 5/10/20/50... metre ticks", () => {
  for (const [min, max] of [[128.4, 174.2], [800, 800], [100, 108], [-40, -10], [320, 2100]]) {
    const axis = elevationAxis(min, max);
    assert.ok(axis.min < min && axis.max > max);
    assert.ok(axis.ticks.length >= 3 && axis.ticks.length <= 9);
    assert.ok([1, 2, 5].includes(axis.step / 10 ** Math.floor(Math.log10(axis.step))));
    assert.ok(axis.step >= 5);
    for (let i = 1; i < axis.ticks.length; i++) assert.equal(axis.ticks[i] - axis.ticks[i-1], axis.step);
    if (min > 100) assert.ok(axis.min > 0, "do not flatten the relief by starting at sea level");
  }
  assert.deepEqual(elevationAxis(128.4, 174.2), { min: 120, max: 180, step: 10, ticks: [120, 130, 140, 150, 160, 170, 180] });
  assert.throws(() => elevationAxis(NaN, 100));
});

test("relative overlay removes city altitude offsets without normalizing or changing the relief", () => {
  const profiles = [100, 800, 1600].map((startM) => ({ available: true, startM, minM: startM - 5, maxM: startM + 25 }));
  const axis = comparisonAxis(profiles, "relative");
  assert.ok(axis.max - axis.min < 50);
  assert.ok(comparisonAxis(profiles, "absolute").max > 1600);
  for (const p of profiles) {
    assert.equal(displayElevation({ ele: p.startM }, p, "relative"), 0);
    assert.equal(displayElevation({ ele: p.startM + 25 }, p, "relative"), 25);
    assert.equal(displayElevation({ ele: p.startM + 25 }, p, "absolute"), p.startM + 25);
  }
  assert.deepEqual(profiles.map((p) => p.startM), [100, 800, 1600]);
  assert.throws(() => comparisonAxis([]));
});

test("Kaylaka audit is reproducible: complete dense heights, no jump at duplicate points, controlled sensitivity", () => {
  const source = readFileSync("src/data/gpx/marathonkaylaka21km.gpx");
  assert.equal(createHash("sha256").update(source).digest("hex"), "c91dd2e46c4829c5ce8be9211227c607ae1754d0b9caee19c8ffca62fceefee3");
  const audit = auditElevation(parseGpx(source.toString("utf8")));
  assert.equal(audit.pointCount, 6336); assert.equal(audit.heightCount, 6336);
  assert.equal(audit.quality, "ready"); assert.equal(audit.complete, true);
  assert.equal(audit.zeroLengthHeightChanges, 0);
  assert.ok(audit.maxSpacingM < 6 && audit.maxHeightJumpM < .61);
  assert.deepEqual([audit.minHeightM, audit.maxHeightM], [127.8, 174.4]);
  const fine = audit.profiles.find((p) => p.windowM === 25), normal = audit.profiles.find((p) => p.windowM === 100);
  assert.ok(fine.ascentM > normal.ascentM * 1.3);
  assert.ok(normal.ascentM > 129 && normal.ascentM < 130);
  const route = loadRoutes().find((r) => r.id === "kaylaka-21km-2026");
  // The owner may revoke analysis/map/download through CMS without breaking verify.
  if (route?.analysisHref) assert.deepEqual(analysisPayload(route).segments, parseGpx(source.toString("utf8")));
  assert.equal(auditElevation([[{lat: 0, lon: 0}, {lat:0, lon:.001}]]).profiles.length, 0);
});
