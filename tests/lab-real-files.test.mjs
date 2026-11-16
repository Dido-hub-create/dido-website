import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {importWorkout} from '../src/lib/running-lab/import.mjs';
import {analyzeActivity} from '../src/lib/running-lab/analyze.mjs';
const load=async path=>importWorkout(new Uint8Array(readFileSync(path)),path.split('/').at(-1));

test('Running Lab reads the existing real Kaylaka source without inventing pace or sensor data',async()=>{
 const [model]=await load('src/data/gpx/marathonkaylaka21km.gpx'),a=analyzeActivity(model);
 assert.equal(model.points.length,6336);assert.ok(Math.abs(a.stats.distanceM-21122.305)<.02);
 assert.equal(a.quality.clockReliable,false);assert.equal(a.stats.pace,null);assert.equal(a.stats.heart.mean,null);assert.equal(a.records.length,0);
 assert.equal(a.elevation.available,true);assert.equal(a.elevation.climbs.length,3);assert.ok(Math.abs(a.stats.ascentM-129.468)<.02);
});

// External published device samples stay outside the repository and website.
// Pinned source commits and download instructions are in docs/RUNNING-LAB.md.
test('Running Lab real FIT corpus: running developer fields, cycling rejection and five sport sessions',{skip:!process.env.DIDO_LAB_EXTERNAL_FIT_DIR},async()=>{
 const root=process.env.DIDO_LAB_EXTERNAL_FIT_DIR;
 const [running]=await load(join(root,'test/running-with-developer-data.fit')),a=analyzeActivity(running);
 assert.equal(running.points.length,1681);assert.equal(running.laps.length,14);assert.equal(a.quality.complete,true);assert.equal(a.stats.elapsedSeconds,1680);assert.ok(Math.abs(a.stats.distanceM-5392)<1);assert.ok(Math.abs(a.stats.heart.mean-157.655)<.01);assert.equal(a.records.length,3);
 const [cycling]=await load(join(root,'test/test.fit'));assert.equal(cycling.reported.sport,'cycling');assert.equal(analyzeActivity(cycling).records.length,0);
 const sessions=await load(join(root,'examples/triathlon_summary_last.fit'));assert.equal(sessions.length,5);assert.equal(sessions.filter(s=>s.reported.sport==='running').length,1);
 assert.ok(sessions.filter(s=>s.reported.sport!=='running').every(s=>analyzeActivity(s).records.length===0));
 for(const session of sessions)for(const lap of session.laps)assert.ok(lap.end>=session.points[0].t&&lap.start<=session.points.at(-1).t+1000,'device laps must belong to their own session');
});

test('Running Lab real TCX corpus: device laps, partial GPS and missing HR remain honest',{skip:!process.env.DIDO_LAB_EXTERNAL_TCX_DIR},async()=>{
 const root=process.env.DIDO_LAB_EXTERNAL_TCX_DIR,[withHr]=await load(join(root,'test.tcx')),[withoutHr]=await load(join(root,'no_hr.tcx'));
 const a=analyzeActivity(withHr),b=analyzeActivity(withoutHr);assert.equal(withHr.laps.length,3);assert.equal(withHr.points.length,384);assert.ok(Math.abs(a.stats.distanceM-4688.00655)<.01);assert.equal(a.stats.elapsedSeconds,1992);
 assert.equal(a.quality.complete,false);assert.equal(a.stats.pace,null);assert.ok(Math.abs(a.stats.heart.mean-160.0417)<.01);assert.equal(b.stats.heart.mean,null);
 assert.equal(a.stats.distanceM,b.stats.distanceM);assert.ok(a.quality.messages.length>0);
});
