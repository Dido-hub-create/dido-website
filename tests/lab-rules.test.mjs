import test from 'node:test';
import assert from 'node:assert/strict';
import {importWorkout} from '../src/lib/running-lab/import.mjs';
import {analyzeActivity} from '../src/lib/running-lab/analyze.mjs';
import {insights,confirmedRecordFindings} from '../src/lib/running-lab/insights.mjs';
import {recordHistory} from '../src/lib/running-lab/records.mjs';
import {compareActivities} from '../src/lib/running-lab/compare.mjs';
import {timestamp} from '../src/lib/running-lab/model.mjs';
import {gpx} from './helpers/lab-fixtures.mjs';
const model=async options=>(await importWorkout(new TextEncoder().encode(gpx(options)),'rules.gpx'))[0];
const ids=a=>insights(a).map(f=>{for(const field of ['title','values','method','limitation'])assert.ok(f[field],field);return f.id;});

test('Lab variability and lap rules distinguish measured changes, equal pace and unequal lengths',async()=>{
 const variable=analyzeActivity(await model({distance:6000,pace:d=>Math.floor(d/1000)%2?400:250,elevation:()=>100}));
 assert.ok(ids(variable).includes('variability'));assert.ok(variable.stats.paceCV>.10);
 const even=analyzeActivity(await model({distance:6000,elevation:()=>100}));assert.ok(!ids(even).includes('variability'));assert.equal(even.manualLaps.length,0,'no invented manual lap');
 const two=await model({distance:4000,pace:d=>d<2000?330:300});two.settings.lapLengthM=2000;
 assert.ok(ids(analyzeActivity(two)).includes('laps'));
 two.settings.lapLengthM=null;two.settings.lapBoundaries=[1500];assert.ok(!ids(analyzeActivity(two)).includes('laps'));
 const equal=await model({distance:4000});equal.settings.lapLengthM=2000;assert.ok(!ids(analyzeActivity(equal)).includes('laps'));
});

test('Lab HR tendency requires 30 minutes, flat verified usable heights, stable pace and 90% sensor coverage',async()=>{
 const run=await model({distance:8000,elevation:()=>100});run.points.forEach((p,i)=>p.hr=i<400?130:145);
 const positive=analyzeActivity(run);assert.ok(ids(positive).includes('hr-drift'));
 for(const change of [
  a=>a.points.forEach(p=>p.hr=140),
  a=>a.points.forEach((p,i)=>{if(i%3===0)p.hr=null;}),
  a=>a.points.forEach((p,i)=>p.z=100+i*1.5),
  a=>a.points.forEach(p=>p.z=null),
  a=>{a.points=a.points.slice(0,301);},
 ]){const negative=structuredClone(run);change(negative);assert.ok(!ids(analyzeActivity(negative)).includes('hr-drift'));}
 const interrupted=structuredClone(run);interrupted.points[400].t=null;
 assert.deepEqual(ids(analyzeActivity(interrupted)),['quality']);
});

test('Lab uphill finding uses at least two complete kilometres per direction and smoothed heights',async()=>{
 const hill=d=>d<2000?100+d*.02:140-(d-2000)*.02;
 const run=await model({distance:4000,elevation:hill,pace:d=>d<2000?360:300});
 const a=analyzeActivity(run);assert.ok(ids(a).includes('hills'));
 assert.ok(Math.abs(a.splits.reduce((sum,r)=>sum+r.ascentM,0)-a.stats.ascentM)<1e-6);
 assert.ok(Math.abs(a.splits.reduce((sum,r)=>sum+r.descentM,0)-a.stats.descentM)<1e-6);
 assert.ok(a.elevation.climbs.every(c=>c.pace!==null&&c.heartRate===140));
 const same=await model({distance:4000,elevation:hill});assert.ok(!ids(analyzeActivity(same)).includes('hills'));
 run.points.forEach(p=>p.z=null);assert.ok(!ids(analyzeActivity(run)).includes('hills'));
});

test('Lab record findings require a successful save; ties are silent, deletion recalculates history',async()=>{
 const slow=analyzeActivity(await model({distance:5000,pace:()=>330}));
 const fast=analyzeActivity(await model({distance:5000,pace:()=>300})),previous=recordHistory([slow]);
 assert.equal(confirmedRecordFindings(fast,previous,false).length,0);
 const findings=confirmedRecordFindings(fast,previous,true);assert.ok(findings.length>0);assert.ok(findings.every(f=>f.values.includes('подобрение')));
 assert.equal(confirmedRecordFindings(slow,previous,true).length,0);
 assert.ok(confirmedRecordFindings(fast,[],true).every(f=>f.title==='Първа налична GPS оценка'));
 const three=compareActivities([slow,fast,{...fast,id:'third',name:'Трето'}]);assert.equal(three.findings.length,2);
 assert.equal(compareActivities([slow,fast],'time').findings[0].id,'comparison-time-0');
 const unknown=analyzeActivity(await model({times:false}));assert.deepEqual(compareActivities([slow,unknown]).findings,[]);
 const cycling=await model({distance:5000});cycling.reported.sport='cycling';const bike=analyzeActivity(cycling);assert.equal(bike.records.length,0);assert.deepEqual(ids(bike),['quality']);assert.equal(compareActivities([slow,bike]).timed,false);
 assert.throws(()=>compareActivities([slow]));assert.throws(()=>compareActivities([slow,fast],'arbitrary'));
});

test('Lab rejects impossible dates and duplicate nonidentical clocks, preserves TCX boundary data',async()=>{
 assert.equal(timestamp('2026-02-30T08:00:00Z'),null);assert.equal(timestamp('2026-01-01T08:00:00'),null);
 assert.equal(timestamp('2026-01-01T10:00:00+02:00'),Date.parse('2026-01-01T08:00:00Z'));
 const tcx=await model({distance:3000});tcx.source.format='tcx';tcx.points.splice(51,0,{...tcx.points[50]});
 const a=analyzeActivity(tcx);assert.equal(a.quality.duplicates,1);assert.equal(a.quality.clockReliable,true);assert.equal(tcx.points.length,302,'raw measurements are retained');
 tcx.points[51].lat+=.00001;assert.equal(analyzeActivity(tcx).quality.clockReliable,false);
});

test('Lab height quality tolerates sub-metre stationary GPS noise but rejects a large vertical jump',async()=>{
 const run=await model({distance:2000,elevation:()=>100});run.points[50].lat=run.points[49].lat+.2/111195.0802335329;run.points[50].z+=.2;
 const a=analyzeActivity(run);assert.equal(a.elevation.available,true);assert.ok(a.stats.ascentM<1,'small jitter is smoothed, not counted as a climb');
 run.points[50].z+=30;const bad=analyzeActivity(run);assert.equal(bad.elevation.available,false);assert.equal(bad.stats.ascentM,null);
});
