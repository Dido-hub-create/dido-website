import test from 'node:test';
import assert from 'node:assert/strict';
import {reliefAvailable,reliefValues,reliefAt} from '../src/lib/running-lab/relief-view.mjs';
import {kilometreMarkerSize,spacedKilometres} from '../src/lib/running-lab/kilometre-markers.mjs';
import {importWorkout} from '../src/lib/running-lab/import.mjs';
import {analyzeActivity} from '../src/lib/running-lab/analyze.mjs';
import {visualScale} from '../src/lib/running-lab/chart-scale.mjs';
import {loopGpx} from './helpers/lab-map-fixtures.mjs';
const workout=async options=>(await importWorkout(new TextEncoder().encode(loopGpx(options)),'synthetic-relief.gpx'))[0];

test('relief uses only the checked existing smoothed profile, with real units and no mutation of data or statistics',async()=>{
 const model=await workout();
 for(const smoothingM of [25,50,100,200]){
  const a=analyzeActivity(model,{smoothingM}),before=structuredClone(a);assert.equal(reliefAvailable(a),true);
  const rows=reliefValues(a);assert.deepEqual(rows,a.elevation.samples.map(p=>({x:p.d/1000,y:p.ele,run:p.run})));
  const scale=visualScale(rows,{metric:'elevation'});assert.ok(scale.min>0&&scale.min<75);assert.ok(scale.max>125);
  for(const index of [0,180,900,1440]){const p=a.points[index],nearest=a.elevation.samples.reduce((best,q)=>Math.abs(q.d-p.d)<Math.abs(best.d-p.d)?q:best);assert.equal(reliefAt(a,p),nearest.ele);}
  const timed=reliefValues(a,'time');assert.equal(timed[0].x,0);assert.ok(timed.at(-1).x>120);assert.deepEqual(a,before);
 }
});

test('relief refuses missing/rejected heights and incomplete geometry, without inventing a fallback profile',async()=>{
 const a=analyzeActivity(await workout({heights:false}));assert.equal(reliefAvailable(a),false);assert.deepEqual(reliefValues(a),[]);assert.equal(reliefAt(a,a.points[0]),null);
 const valid=analyzeActivity(await workout());
 for(const bad of [{...valid,quality:{...valid.quality,complete:false}},{...valid,elevation:{...valid.elevation,available:false}},{...valid,elevation:{...valid.elevation,samples:[{d:0,ele:100},{d:1,ele:NaN}]}}]){assert.equal(reliefAvailable(bad),false);assert.deepEqual(reliefValues(bad),[]);assert.equal(reliefAt(bad,bad.points[0]),null);}
 const model=await workout();model.points[100].z=10000;
 // Quality policy belongs to the existing analyser, never to a drawing fallback.
 const rejected=analyzeActivity(model);assert.equal(rejected.elevation.available,false);assert.equal(reliefAvailable(rejected),false);
});

test('kilometre decluttering is stable under pan, preserves measurements and reveals all separated labels when zoomed in',()=>{
 const input=Array.from({length:42},(_,i)=>({km:i+1,x:i*9,y:0,point:{d:(i+1)*1000}})),before=structuredClone(input);
 const small=spacedKilometres(input,10),moved=spacedKilometres(input.map(p=>({...p,x:p.x+117.3,y:p.y-79.8})),10);
 assert.deepEqual(moved.map(p=>p.km),small.map(p=>p.km));assert.ok(small.length<42);
 for(let i=0;i<small.length;i++)for(let j=i+1;j<small.length;j++)assert.ok(Math.hypot(small[i].x-small[j].x,small[i].y-small[j].y)>=kilometreMarkerSize(10)+10);
 const large=spacedKilometres(input.map(p=>({...p,x:p.x*16})),17);assert.equal(large.length,42);assert.deepEqual(input,before);
 assert.equal(spacedKilometres([{km:1,x:NaN,y:0}],10).length,0);
});

test('kilometre circles grow continuously within small readable bounds; invalid zoom has a safe size',()=>{
 for(const z of [2,10,12,14,16,19,NaN])assert.ok(kilometreMarkerSize(z)>=13&&kilometreMarkerSize(z)<=20);
 assert.ok(kilometreMarkerSize(16)>kilometreMarkerSize(10));assert.ok(Math.abs(kilometreMarkerSize(12.01)-kilometreMarkerSize(12))<.02);
});
