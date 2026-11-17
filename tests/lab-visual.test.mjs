import test from 'node:test';
import assert from 'node:assert/strict';
import {importWorkout} from '../src/lib/running-lab/import.mjs';
import {analyzeActivity} from '../src/lib/running-lab/analyze.mjs';
import {visualScale,axisTicks} from '../src/lib/running-lab/chart-scale.mjs';
import {gradientProfile} from '../src/lib/running-lab/gradient.mjs';
import {cadenceDisplay} from '../src/lib/running-lab/cadence.mjs';
import {adaptiveMetrics,lapPresentation} from '../src/lib/running-lab/visual-summary.mjs';
import {createArchive,validateArchive,validateActivity,defaultPreferences} from '../src/lib/running-lab/backup.mjs';
import {gpx} from './helpers/lab-fixtures.mjs';
const model=async options=>(await importWorkout(new TextEncoder().encode(gpx(options)),'visual-test.gpx'))[0];
const close=(a,b,tolerance=.02)=>assert.ok(Math.abs(a-b)<tolerance,`${a} vs ${b}`);

test('visual axes retain data, mark sparse extremes, restore all values and respect the actual horizontal span',()=>{
 const points=Array.from({length:200},(_,i)=>({x:i,y:i<197?300+i%12:2400,run:0})),before=structuredClone(points);
 const typical=visualScale(points,{metric:'pace'}),all=visualScale(points,{metric:'pace',mode:'all'});
 assert.ok(typical.max<600);assert.equal(typical.above,3);assert.equal(typical.rawMax,2400);assert.ok(all.max>2400);assert.equal(all.above,0);assert.deepEqual(points,before);
 const intervals=Array.from({length:200},(_,i)=>({x:i,y:i%2?250:600}));assert.equal(visualScale(intervals,{metric:'pace'}).trimmed,false,'substantial fast/slow phases remain visible');
 const longInterval=[...Array.from({length:100},(_,i)=>({x:i,y:300})),{x:1000,y:2400}];assert.equal(visualScale(longInterval,{metric:'pace'}).trimmed,false,'one sparse sample can represent a substantial real interval');
 assert.equal(visualScale([{x:0,y:null}]),null);assert.ok(visualScale([{x:0,y:0},{x:1,y:0}]).max>0);
 for(const [min,max]of [[299,304],[-3,4],[120,180],[0,1]]){const ticks=axisTicks(min,max,5);assert.ok(ticks.length>=2);assert.ok(ticks.every(Number.isFinite));}
});

test('gradient uses a documented distance window and cannot bridge segments or missing heights',()=>{
 const points=Array.from({length:101},(_,i)=>({d:i*10,ele:100+i*.2,run:0}));
 const profile={available:true,samples:points},before=structuredClone(profile),grade=gradientProfile(profile,100);assert.equal(grade.available,true);assert.ok(grade.samples.every(p=>Math.abs(p.grade-.02)<1e-10));assert.deepEqual(profile,before);
 const second=points.map(p=>({...p,d:p.d+1000,ele:p.ele+1000,run:1}));assert.ok(gradientProfile({available:true,samples:[...points,...second]},100).samples.every(p=>Math.abs(p.grade-.02)<1e-10));
 assert.deepEqual(gradientProfile({available:false,samples:points}).samples,[]);
 assert.equal(gradientProfile({available:true,samples:points.slice(0,2)}).available,false);
});

test('cadence presentation doubles only documented running fields, never raw values or all formats blindly',async()=>{
 const raw=await model({distance:3000}),before=structuredClone(raw.points);assert.equal(cadenceDisplay(raw).factor,1);
 raw.source.format='fit';raw.reported.sport='running';const a=analyzeActivity(raw);assert.equal(a.cadenceDisplay.factor,2);assert.equal(a.stats.cadence.mean,90);assert.deepEqual(raw.points,before);
 raw.reported.sport='cycling';assert.equal(cadenceDisplay(raw).factor,1);raw.source.format='tcx';raw.reported.sport='Running';assert.equal(cadenceDisplay(raw).factor,1);
 const known=gpx({distance:100}).replace('urn:test','http://www.garmin.com/xmlschemas/TrackPointExtension/v1').replace('</name>','</name><type>running</type>');
 const [garmin]=await importWorkout(new TextEncoder().encode(known),'documented.gpx');assert.equal(cadenceDisplay(garmin).factor,2);assert.equal(garmin.points[0].cad,90);
 const [unknown]=await importWorkout(new TextEncoder().encode(known.replace('<type>running</type>','')),'unknown.gpx');assert.equal(cadenceDisplay(unknown).factor,1);
});

test('adaptive summaries change with distance and available measurements, without invented empty cards',async()=>{
 const short=analyzeActivity(await model({distance:3000})),medium=analyzeActivity(await model({distance:8000})),long=analyzeActivity(await model({distance:21126}));
 const keys=a=>adaptiveMetrics(a).map(m=>m.id);assert.ok(!keys(short).includes('record-5000'));assert.ok(keys(medium).includes('record-5000'));assert.ok(keys(long).includes('record-10000'));assert.ok(!keys(short).includes('variation'));
 for(const a of [short,medium,long]){assert.ok(adaptiveMetrics(a).length<=8);assert.ok(adaptiveMetrics(a).every(m=>Number.isFinite(m.value)));assert.ok(!keys(a).includes('estimatedStopSeconds'));}
 const missing=await model({distance:3000,heart:false,times:false});missing.points.forEach(p=>{p.cad=null;p.z=null;});const a=analyzeActivity(missing);assert.deepEqual(keys(a),['distance']);
});

test('5280 m laps keep a tiny remainder separate; unequal manual boundaries and device laps retain their own meaning',async()=>{
 const raw=await model({distance:21126});raw.settings.lapLengthM=5280;const a=analyzeActivity(raw),laps=lapPresentation(a);assert.equal(laps.length,5);assert.equal(laps[4].partial,true);assert.equal(laps[4].label,'Непълен остатък');close(laps[4].lengthM,6);close(laps.reduce((sum,r)=>sum+r.lengthM,0),a.stats.distanceM);assert.equal(laps.slice(0,4).some(r=>r.partial),false);
 raw.settings.lapLengthM=null;raw.settings.lapBoundaries=[1000,3500,21121];const unequal=lapPresentation(analyzeActivity(raw));close(unequal[1].lengthM,2500);close(unequal.at(-1).lengthM,5);assert.equal(unequal.at(-1).partial,true);
 const empty=analyzeActivity(await model({distance:21126}));assert.deepEqual(lapPresentation(empty),[]);
 empty.deviceLaps=[{distanceM:1000,timerSeconds:300,start:null,end:null}];const device=lapPresentation(empty,'device');assert.equal(device[0].pace,300);assert.match(device[0].source,/устройството/);
});

test('manual finish creates a separate measured prefix, preserves original records, times and archive compatibility',async()=>{
 const raw=await model({distance:21120,pace:()=>7507/21.12});const finish=raw.points.at(-1);
 for(let i=1;i<=148;i++)raw.points.push({...finish,t:finish.t+i*1000,lat:finish.lat+i*.03/111195.0802335329,cad:1});
 raw.events=[{t:raw.points[0].t,type:'start'},{t:raw.points.at(-1).t,type:'stop'}];raw.reported.timerSeconds=7655;
 const original=analyzeActivity(raw),points=structuredClone(raw.points);raw.settings.manualFinishElapsedS=7507;const marked=analyzeActivity(raw);
 close(marked.stats.elapsedSeconds,7655);close(marked.manualFinish.stats.elapsedSeconds,7507);close(marked.manualFinish.afterSeconds,148);close(marked.manualFinish.distanceM,21120);close(marked.manualFinish.stats.timerSeconds,7507);
 assert.deepEqual(marked.records,original.records);assert.deepEqual(marked.stats,original.stats);assert.deepEqual(raw.points,points);assert.match(marked.manualFinish.note,/не е официален Chip Time/);
 const restored=await validateArchive(await createArchive([raw],defaultPreferences()));assert.equal(restored.activities[0].settings.manualFinishElapsedS,7507);
 delete raw.settings.manualFinishElapsedS;assert.equal(validateActivity(raw),raw);raw.settings.manualFinishElapsedS=-1;assert.throws(()=>validateActivity(raw));
 const untimed=await model({times:false});untimed.settings.manualFinishElapsedS=10;assert.equal(analyzeActivity(untimed).manualFinish.available,false);
});
