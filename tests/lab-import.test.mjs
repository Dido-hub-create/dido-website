import test from 'node:test';import assert from 'node:assert/strict';
import {importWorkout} from '../src/lib/running-lab/import.mjs';import {inspectZip,expandZip} from '../src/lib/running-lab/zip-import.mjs';import {LIMITS} from '../src/lib/running-lab/model.mjs';
import {gpx,fit,tcx} from './helpers/lab-fixtures.mjs';import {zipSync,strToU8} from 'fflate';
const bytes=text=>new TextEncoder().encode(text);
test('Lab GPX/TCX preserve private sensor/time values, provenance and segments without inventing missing fields',async()=>{
 const [a]=await importWorkout(bytes(gpx()),'run.gpx');assert.equal(a.points.length,501);assert.equal(a.points[0].hr,140);assert.equal(a.points[0].cad,90);assert.equal(a.source.format,'gpx');assert.equal(a.provenance.derived,'DIDO distance/time algorithms v1');
 const [missing]=await importWorkout(bytes(gpx({times:false,heart:false})),'missing.gpx');assert.equal(missing.points[0].t,null);assert.equal(missing.points[0].hr,null);
 const [indoor]=await importWorkout(bytes(tcx),'indoor.tcx');assert.equal(indoor.points[0].lat,null);assert.equal(indoor.points[2].deviceDistance,60);assert.equal(indoor.laps.length,1);
 const two=gpx({distance:100}).replace('</trkseg>','</trkseg><trkseg><trkpt lat="43" lon="25"><ele>80</ele></trkpt><trkpt lat="43.001" lon="25"><ele>81</ele></trkpt></trkseg>');assert.equal((await importWorkout(bytes(two),'two.gpx'))[0].points.at(-1).segment,1);
});
test('Lab FIT decodes actual wire definitions, endian variants, compressed timestamps and developer fields with strict CRC',async()=>{
 for(const options of [{},{bigEndian:true},{compressed:true},{developer:true},{noGps:true}]){
  const [a]=await importWorkout(fit(options),'real-wire.fit');assert.equal(a.points.length,121);assert.equal(a.points[0].hr,140);assert.equal(a.points[120].t-a.points[0].t,120000);assert.equal(a.points[120].deviceDistance,360);assert.equal(a.reported.timerSeconds,120);assert.equal(a.events.length,2);
  if(options.noGps)assert.equal(a.points[0].lat,null);else assert.ok(Math.abs(a.points[0].lat-42)<1e-6);
 }
 const bad=fit();bad[25]^=1;await assert.rejects(importWorkout(bad,'bad.fit'),/CRC/);await assert.rejects(importWorkout(fit().subarray(0,80),'short.fit'));
});
test('Lab malformed/oversized XML and unsafe ZIPs fail closed, supported members import locally',async()=>{
 for(const xml of ['',gpx().replace('<gpx','<!DOCTYPE x><gpx'),'<gpx><bad></gpx>','<wrong/>'])await assert.rejects(importWorkout(bytes(xml),'bad.gpx'));
 await assert.rejects(importWorkout(new Uint8Array(LIMITS.fileBytes+1),'large.gpx'));
 const zip=zipSync({'one.gpx':strToU8(gpx({distance:100})),'two.tcx':strToU8(tcx),'ignore.txt':strToU8('ignored')});assert.equal(inspectZip(zip).length,3);assert.equal((await expandZip(zip)).length,2);
 for(const contents of [{'../x.gpx':bytes(gpx())},{'nested.zip':bytes('test')},Object.fromEntries(Array.from({length:201},(_,i)=>[i+'.gpx',bytes('x')]))])assert.throws(()=>inspectZip(zipSync(contents)));
 const bomb=zipSync({'huge.gpx':new Uint8Array(2*1024*1024)});assert.throws(()=>inspectZip(bomb),/размер/);
});
