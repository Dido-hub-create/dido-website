import test from 'node:test';
import assert from 'node:assert/strict';
import {importWorkout} from '../src/lib/running-lab/import.mjs';
import {analyzeActivity} from '../src/lib/running-lab/analyze.mjs';
import {measuredPointIndex,passageCandidates,routeColouring,routeLines,streetMapPossible,packMapPoints,unpackMapPoints} from '../src/lib/running-lab/map-data.mjs';
import {loopGpx} from './helpers/lab-map-fixtures.mjs';
const analysis=async options=>analyzeActivity((await importWorkout(new TextEncoder().encode(loopGpx(options)),'synthetic-map.gpx'))[0]);

test('map hit testing returns separate measured visits at an overlapping location without inventing points',async()=>{
 const a=await analysis(),before=structuredClone(a.points),index=measuredPointIndex(a.points),position=a.points[180],choices=passageCandidates(index,position,8);
 assert.equal(choices.length,2);assert.deepEqual(choices.map(c=>c.index),[180,900]);assert.deepEqual(choices.map(c=>c.visit),[1,2]);
 assert.ok(choices[1].point.d-choices[0].point.d>10500);assert.ok(choices[1].point.t-choices[0].point.t>3600000);
 for(const c of choices)assert.equal(c.point,a.points[c.index],'the candidate is an actual normalized measurement, not an interpolation');
 assert.deepEqual(a.points,before);assert.equal(a.manualLaps.length,0,'geographic revisits never invent racing laps');
});

test('map proximity is bounded, rejects invalid or isolated geometry, and supports the date line safely',()=>{
 const p=(lat,lon,d,run=0)=>({lat,lon,d,run,t:d*1000}),points=[p(42,24,0),p(42.0001,24,11),p(44,26,11,1),{lat:null,lon:null,d:11,run:2},p(42.001,24,20,3),p(42.0011,24,31,3)],index=measuredPointIndex(points);
 assert.equal(index.entries.length,4);assert.equal(index.query({lat:44,lon:26},150).length,0,'an isolated GPS jump cannot be picked');
 assert.equal(index.query({lat:42.02,lon:24},100000).length,0,'a huge requested radius still cannot select a far-away route');
 assert.deepEqual(index.query({lat:NaN,lon:24},20),[]);
 assert.equal(passageCandidates(index,{lat:42,lon:24},100,()=>50,18).length,0,'screen-space tolerance is checked too');
 const edge=measuredPointIndex([p(0,179.9999,0),p(0,-179.9999,23)]);assert.equal(edge.query({lat:0,lon:180},30).length,2);
 const polar=measuredPointIndex([p(90,0,0),p(90,179,1)]);assert.equal(polar.query({lat:90,lon:90},8).length,2);
 assert.match(streetMapPossible([{lat:89,lon:0,d:0},{lat:89,lon:.001,d:1}]),/проекция/);assert.match(streetMapPossible([p(0,179.9,0),p(0,-179.9,1)]),/180/);
});

test('stationary equal-distance measurements remain explicit choices rather than an arbitrary finish time',()=>{
 const points=Array.from({length:32},(_,i)=>({lat:42,lon:24,d:0,run:0,t:1000+i*1000})),index=measuredPointIndex(points),choices=passageCandidates(index,points[0],10);
 assert.equal(choices.length,32);assert.equal(choices[0].point.t,1000);assert.equal(choices.at(-1).point.t,32000);assert.ok(choices.every(c=>c.visit===1));
});

test('map colours reuse reliable analysis, preserve measured geometry and distinguish missing data',async()=>{
 const a=await analysis({laps:1,lapDistance:4000}),before=structuredClone(a),grade=routeColouring(a,'grade');
 assert.equal(grade.mode,'grade');const lines=routeLines(a.points,grade);assert.ok(lines.length>2);assert.deepEqual(new Set(lines.map(l=>l.style.key)),new Set(['up','flat','down']));
 assert.ok(lines.every(line=>line.points.every(p=>a.points.includes(p))));
 const range=routeLines(a.points,routeColouring(a,'single'),[1000,2000]);assert.ok(range.every(line=>line.points.every(p=>p.d>=1000&&p.d<=2000)));
 for(const metric of ['pace','hr']){const colours=routeColouring(a,metric);assert.equal(colours.mode,metric);assert.equal(colours.limits.length,2);assert.equal(colours.at({...a.points[0],run:99}).key,'missing');}
 assert.deepEqual(a,before);
 const missing=await analysis({laps:1,lapDistance:3000,heart:false,heights:false,times:false});
 for(const metric of ['pace','hr','grade']){const colours=routeColouring(missing,metric);assert.equal(colours.mode,'single');assert.equal(colours.available[metric],false);}
 const partial={...a,stats:{...a.stats,heart:{...a.stats.heart,coverage:.5}}};assert.equal(routeColouring(partial,'hr').mode,'single');
});

test('map route drawing never bridges missing coordinates or normalized run breaks',()=>{
 const p=(d,run=0)=>({lat:42+d/100000,lon:24,d,run}),points=[p(0),p(10),{lat:null,lon:null,d:10,run:1},p(20,2),p(30,2),p(40,3),p(50,3)],single={at:()=>({key:'single',color:'#fff'})};
 const lines=routeLines(points,single);assert.deepEqual(lines.map(line=>line.points.map(p=>p.d)),[[0,10],[20,30],[40,50]]);
 assert.ok(lines.every(line=>new Set(line.points.map(p=>p.run)).size===1));
});

test('map index handles a bounded 100,000-point activity without spreading large arrays or changing measurements',()=>{
 const points=Array.from({length:100000},(_,i)=>({lat:42+i/2000000,lon:24,d:i*.05,run:0,t:1000+i*1000})),index=measuredPointIndex(points),hits=index.query(points[50000],8);
 assert.equal(index.entries.length,100000);assert.ok(hits.length>200&&hits.length<400);assert.ok(hits.some(c=>c.index===50000));assert.equal(points[50000].d,2500);assert.equal(streetMapPossible(points),null);
 const packed=packMapPoints(points),restored=unpackMapPoints(packed);assert.equal(packed.byteLength,6400000);assert.equal(restored.length,100000);assert.deepEqual(restored[50000],{...points[50000],z:null,hr:null,cad:null});assert.throws(()=>unpackMapPoints(new Float64Array(7)),/Невалидни/);
});
