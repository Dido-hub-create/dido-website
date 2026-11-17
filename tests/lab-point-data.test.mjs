import test from 'node:test';
import assert from 'node:assert/strict';
import {pointData} from '../src/lib/running-lab/point-data.mjs';
import {importWorkout} from '../src/lib/running-lab/import.mjs';
import {analyzeActivity} from '../src/lib/running-lab/analyze.mjs';
import {loopGpx} from './helpers/lab-map-fixtures.mjs';

test('point readout uses a measured visit, existing local analysis and explicit cadence units without changing raw data',async()=>{
 const a=analyzeActivity((await importWorkout(new TextEncoder().encode(loopGpx()),'synthetic.gpx'))[0]),before=structuredClone(a),p=a.points[900],value=pointData(a,p);
 assert.equal(value.distanceM,p.d);assert.equal(value.elapsedS,(p.t-a.stats.start)/1000);
 assert.equal(value.clock,new Intl.DateTimeFormat('bg-BG',{timeZone:'Europe/Sofia',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(p.t));
 assert.equal(value.heart,p.hr);assert.equal(value.cadence,p.cad*2);assert.equal(value.cadenceUnit,'стъпки/мин');assert.equal(value.elevationM,p.z);
 assert.ok(value.pace>340&&value.pace<360);assert.ok(Number.isFinite(value.gradePercent));assert.equal(value.hasGps,true);
 assert.equal(pointData(a,p,'UTC').clock,new Date(p.t).toISOString().slice(11,19));assert.equal(pointData(a,p,'not/a-zone').clock,null);
 assert.deepEqual(a,before);assert.equal('gap' in value,false,'no unverified GAP model is fabricated');
});

test('point readout preserves valid zero values and distinguishes absent sensors, timing and reliable slope',()=>{
 const p={d:0,t:null,hr:null,cad:null,z:0,lat:null,lon:null,run:1},a={quality:{clockReliable:false},stats:{start:null},samples:[{...p,pace:null}],elevation:{available:false},gradient:{available:false,samples:[]}};
 assert.deepEqual(pointData(a,p),{distanceM:0,elapsedS:null,clock:null,pace:null,heart:null,cadence:null,cadenceUnit:'отчетени ед./мин',elevationM:0,gradePercent:null,hasGps:false});
 a.elevation.available=true;a.gradient={available:true,samples:[{d:0,grade:0,run:1}]};assert.equal(pointData(a,p).gradePercent,0);
 assert.equal(pointData(a,{...p,cad:82}).cadence,82,'unknown cadence units must not be doubled');
});

test('a missing pace or gradient is never borrowed from another normalized run',()=>{
 const p={d:120,t:2000,hr:135,cad:80,z:15,lat:42,lon:24,run:2},a={quality:{clockReliable:true},stats:{start:1000},samples:[{d:120,t:2000,pace:300,run:1}],elevation:{available:true},gradient:{available:true,samples:[{d:120,grade:.1,run:1}]}};
 assert.equal(pointData(a,p).pace,null);assert.equal(pointData(a,p).gradePercent,null);assert.equal(pointData(a,p).elapsedS,1);
 assert.equal(pointData(a,{...p,pace:0}).pace,null);assert.equal(pointData(a,{...p,pace:NaN}).pace,null);
});
