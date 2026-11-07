import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { reviewGpx } from "../src/lib/gpx-review.mjs";
const segment = Array.from({length: 7}, (_, i) => ({lat:0,lon:i*.001,ele:100+i*5}));

test("local review separates ascent, descent and altitude range; repeats only explicitly requested laps", () => {
  const segments = [segment, segment.map((p) => ({...p,ele:p.ele+700}))];
  const one = reviewGpx(segments), two = reviewGpx(segments,{lapCount:2});
  assert.equal(one.publicationApproved,false); assert.equal(one.purpose,"local-review-only");
  assert.equal(one.lapCount,1); assert.equal(one.elevation.rawAscentM,60);
  assert.equal(one.elevation.rawDescentM,0); assert.equal(one.elevation.rangeM,730);
  assert.equal(two.geometry.distanceM,one.geometry.distanceM*2);
  assert.deepEqual(one.profiles.map((p) => p.windowM),[25,50,100,200]);
  for(let i=0;i<4;i++) {
    assert.ok(Math.abs(two.profiles[i].ascentM - one.profiles[i].ascentM*2)<1e-6);
    assert.ok(one.profiles[i].ascentM<61,"never count the 700 m jump between disconnected segments");
  }
  const climb = reviewGpx([segment]).profiles[2];
  assert.ok(Math.abs(climb.ascentM-climb.descentM - (climb.endM-climb.startM))<1e-8);
});

test("diagnostics never grant trust or emit geometry, paths, names or telemetry", () => {
  const review = reviewGpx([segment]);
  function walk(value) {
    if (!value || typeof value !== "object") return;
    for(const [key, child] of Object.entries(value)) {
      assert.ok(!["lat","lon","segments","points","path","file","name","time","hr","cad","metadata","elevationTrusted","publicApproved","publishMap","allowDownload"].includes(key),key);
      walk(child);
    }
  }
  walk(review);
  const missing = reviewGpx([[{lat:0,lon:0,ele:100},{lat:0,lon:.001}]]);
  assert.equal(missing.elevation.complete,false);assert.equal(missing.elevation.rawAscentM,undefined);
  assert.ok(missing.profiles.every((p) => !p.available && p.ascentM === undefined));
  assert.throws(() => reviewGpx([segment],{lapCount:0}));
});

test("private CLI writes only a new outside-checkout report; rejects symlinks and dot-prefixed inside folders", () => {
  const outside=mkdtempSync(join(tmpdir(),"dido-private-review-"));
  const inside=mkdtempSync(resolve("..inside-review-test-"));
  const source=join(outside,"OWNER_PRIVATE_NAME.gpx"), output=join(outside,"review.json");
  writeFileSync(source,`<gpx><metadata><name>PRIVATE_ACCOUNT_MARKER</name></metadata><trk><trkseg>${segment.map((p)=>`<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele><time>2099-01-01T00:00:00Z</time><extensions><hr>123</hr></extensions></trkpt>`).join("")}</trkseg></trk></gpx>`);
  const run=(dest,input=source)=>spawnSync(process.execPath,["scripts/review-private-gpx.mjs","--output",dest,input],{encoding:"utf8"});
  try {
    const result=run(output);assert.equal(result.status,0,result.stderr);
    assert.ok(existsSync(output));assert.equal(statSync(output).mode&0o777,0o600);
    const content=readFileSync(output,"utf8");
    assert.doesNotMatch(content,/PRIVATE_ACCOUNT_MARKER|OWNER_PRIVATE_NAME|2099-01-01|"lat"|"lon"|"segments"|"hr"/);
    assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE_ACCOUNT_MARKER|OWNER_PRIVATE_NAME/);
    assert.equal(JSON.parse(content).reviews[0].lapCount,1);
    assert.notEqual(run(output).status,0,"never overwrite an existing report");
    const rejected=join(inside,"report.json");assert.notEqual(run(rejected).status,0);assert.ok(!existsSync(rejected));
    mkdirSync(join(outside,"safe"));symlinkSync(inside,join(outside,"points-inside"));
    assert.notEqual(run(join(outside,"points-inside/report.json")).status,0);
    assert.notEqual(run(join(outside,"bad.json"),join(outside,"missing.gpx")).status,0);
    assert.ok(!existsSync(join(outside,"bad.json")));
  } finally { rmSync(outside,{recursive:true,force:true});rmSync(inside,{recursive:true,force:true}); }
});
