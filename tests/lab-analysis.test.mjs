import test from 'node:test';import assert from 'node:assert/strict';
import {importWorkout} from '../src/lib/running-lab/import.mjs';import {analyzeActivity} from '../src/lib/running-lab/analyze.mjs';import {fastestWindow,recordHistory,STANDARD_DISTANCES} from '../src/lib/running-lab/records.mjs';import {insights} from '../src/lib/running-lab/insights.mjs';import {compareActivities} from '../src/lib/running-lab/compare.mjs';
import {gpx,tcx} from './helpers/lab-fixtures.mjs';
const activity=async options=>(await importWorkout(new TextEncoder().encode(gpx(options)),'workout.gpx'))[0];
const close=(a,b,tolerance=.02)=>assert.ok(Math.abs(a-b)<tolerance,`${a} vs ${b}`);
test('Lab known distance/time, weighted sensors, km/final partial splits and interpolated fractions are consistent',async()=>{
 const model=await activity({distance:5280}),a=analyzeActivity(model);close(a.stats.distanceM,5280);close(a.stats.elapsedSeconds,1584);close(a.stats.pace,300);close(a.stats.heart.mean,140);assert.equal(a.splits.length,6);close(a.splits.at(-1).lengthM,280);close(a.splits.reduce((sum,r)=>sum+r.seconds,0),a.stats.elapsedSeconds);assert.equal(a.fractions[4].length,4);assert.equal(a.records.filter(r=>r.distanceM===5000).length,1);assert.equal(a.elevation.available,true);assert.ok(a.stats.ascentM>20&&a.stats.ascentM<27);
});
test('Lab records evaluate sample and shifted end boundaries, including starts between GPS and kilometre markers',async()=>{
 const model=await activity({distance:2000});const positions=[...new Set([...model.points.map((p,i)=>i*10),1237.5])].sort((a,b)=>a-b);let seconds=0,last=0;
 model.points=positions.map(d=>{const midpoint=(last+d)/2;seconds+=(d-last)*(midpoint<400?.5:midpoint<1237.5?.2:.8);last=d;return {...model.points[0],lat:42+d/111195.0802335329,t:model.points[0].t+seconds*1000};});
 const a=analyzeActivity(model),best=fastestWindow(a.points,1000,a.quality);close(best.startM,237.5);close(best.seconds,248.75);assert.ok(best.startM%10>1);
 for(const distance of [1000,3000,5000,10000,21097.5,42195,2300]){const large=analyzeActivity(await activity({distance:distance+100} ),{distances:[distance]});const record=large.records.find(r=>r.distanceM===distance);assert.ok(record);close(record.seconds,distance*.3);}
});
test('Lab missing clocks, jumps, gaps, GPS absence and segment boundaries cannot create false records or pace',async()=>{
 const untimed=analyzeActivity(await activity({times:false}));assert.equal(untimed.stats.pace,null);assert.equal(untimed.records.length,0);assert.equal(untimed.splits.length,0);
 const model=await activity({distance:1500});model.points[70].lat=60;const jump=analyzeActivity(model);assert.ok(jump.quality.jumps>0||jump.quality.gaps>0);assert.equal(jump.stats.pace,null);assert.equal(jump.records.find(r=>r.distanceM===1000),undefined);
 const backwards=await activity();backwards.points[50].t=backwards.points[49].t-100;assert.equal(analyzeActivity(backwards).records.length,0);
 const multi=await activity({distance:1500});multi.points.slice(75).forEach(p=>p.segment=1);assert.equal(analyzeActivity(multi).records.find(r=>r.distanceM===1000),undefined);
 const [indoor]=await importWorkout(new TextEncoder().encode(tcx),'indoor.tcx');const a=analyzeActivity(indoor);assert.equal(a.quality.distanceSource,'device');close(a.stats.distanceM,60);assert.equal(a.records.length,0);assert.ok(a.stats.pace>0);
});
test('Lab elapsed, moving estimate, timer and real stop events are distinct; stationary pauses remain in km splits',async()=>{
 const model=await activity({distance:2000});const duplicate={...model.points[100],t:model.points[100].t+10000};model.points.splice(101,0,duplicate);model.points.slice(102).forEach(p=>p.t+=10000);
 model.events=[{t:model.points[0].t,type:'start'},{t:model.points[100].t,type:'stop'},{t:duplicate.t,type:'start'},{t:model.points.at(-1).t,type:'stop'}];
 const a=analyzeActivity(model);close(a.stats.elapsedSeconds,610);close(a.stats.movingSeconds,600);close(a.stats.timerSeconds,600);close(a.stats.confirmedPauseSeconds,10);close(a.splits.reduce((sum,r)=>sum+r.seconds,0),610);assert.equal(a.stats.confirmedStops,2);
 const noEvents=structuredClone(model);noEvents.events=[];assert.equal(analyzeActivity(noEvents).stats.confirmedPauseSeconds,null);
});
test('Lab record history ignores ties/worse results and recomputes after deletion; custom distances work',async()=>{
 const slow=analyzeActivity(await activity({distance:6000,pace:()=>330})),fast=analyzeActivity(await activity({distance:6000,pace:()=>300}));fast.id='new';fast.stats.start+=86400000;
 const tie={...fast,id:'tie',stats:{...fast.stats,start:fast.stats.start+86400000}};
 const h=recordHistory([slow,fast,tie],[5000])[0];assert.equal(h.history.length,2);close(h.current.seconds,1500);close(h.history[1].improvementSeconds,150);assert.equal(recordHistory([slow],[5000])[0].current.activityId,slow.id);assert.equal(recordHistory([],[5000])[0].current,null);
 const custom=analyzeActivity(await activity(),{distances:[2300]});close(custom.records.find(r=>r.distanceM===2300).seconds,690);assert.equal(STANDARD_DISTANCES.length,9);
});
test('Lab rule findings have evidence and suppress unsupported claims; comparison uses real shared extent',async()=>{
 const negative=analyzeActivity(await activity({distance:12000,pace:d=>d<6000?330:300,elevation:()=>100}));assert.ok(insights(negative).some(r=>r.id==='halves'));assert.ok(insights(negative).some(r=>r.id==='finish'));
 const even=analyzeActivity(await activity({distance:12000,elevation:()=>100}));assert.equal(insights(even).some(r=>r.id==='halves'),false);assert.equal(insights(even).some(r=>r.id==='variability'),false);assert.equal(insights(even).some(r=>r.id==='hr-drift'),false);
 const unavailable=analyzeActivity(await activity({times:false}));assert.deepEqual(insights(unavailable).map(r=>r.id),['quality']);
 const short=analyzeActivity(await activity({distance:5000,pace:()=>330})),comparison=compareActivities([even,short],'distance');close(comparison.commonDistanceM,5000);close(comparison.rows[0].seconds,1500);close(comparison.rows[1].seconds,1650);assert.equal(comparison.findings.length,1);assert.ok(comparison.warning.includes('няма разтягане'));
 assert.equal(compareActivities([even,short,negative],'time').rows.length,3);assert.equal(compareActivities([even,unavailable]).timed,false);
});
