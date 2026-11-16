import test from 'node:test';import assert from 'node:assert/strict';
import {importWorkout} from '../src/lib/running-lab/import.mjs';import {analyzeActivity} from '../src/lib/running-lab/analyze.mjs';import {createArchive,validateArchive,validatePreferences,defaultPreferences} from '../src/lib/running-lab/backup.mjs';import {officialResult,validateDistance,historicalStats} from '../src/lib/running-lab/history.mjs';import {metadata,openLibrary} from '../src/lib/running-lab/library.mjs';import {probableDuplicate} from '../src/lib/running-lab/compare.mjs';import {csv,publicSummary,metricsCsv} from '../src/lib/running-lab/export.mjs';import {gpx} from './helpers/lab-fixtures.mjs';
const model=async()=>(await importWorkout(new TextEncoder().encode(gpx()),'history.gpx'))[0];
test('Lab backup restores all original normalized measurements, settings, official records and custom distances',async()=>{
 const a=await model();a.name='Лично бягане';a.comment='Личен коментар';a.settings.lapBoundaries=[2300];
 const preferences={...defaultPreferences(),customDistances:[2300,5280],officialResults:[officialResult({distanceM:5000,seconds:1490,date:'2026-01-01',race:'Тестово състезание',url:'https://example.org/result'})]};
 const archive=await createArchive([a],preferences),restored=await validateArchive(archive);assert.deepEqual(restored.activities,[a]);assert.deepEqual(restored.preferences,preferences);
 assert.deepEqual(analyzeActivity(restored.activities[0]).stats,analyzeActivity(a).stats);
 const corrupt=JSON.parse(archive);corrupt.payload.activities[0].name='Changed';await assert.rejects(validateArchive(JSON.stringify(corrupt)),/Checksum/);
 await assert.rejects(validateArchive('{bad'));await assert.rejects(validateArchive(JSON.stringify({...JSON.parse(archive),version:2})));
 await assert.rejects(validateArchive('{"format":"DIDO-Running-Lab","__proto__":{}}'),/Недопустимо/);
 const bad=structuredClone(a);bad.points[0].lat=200;await assert.rejects(createArchive([bad],preferences));
});
test('Lab official results and personal distances validate independently without overwriting GPS data',()=>{
 const result=officialResult({distanceM:21097.5,seconds:7500,date:'2026-11-15',race:'Личен резултат'});assert.equal(result.source,'official, manually entered');assert.equal(result.distanceM,21097.5);
 for(const distance of [0,-1,NaN,Infinity,100001])assert.throws(()=>validateDistance(distance));
 for(const change of [{date:'2026-02-30'},{date:'2026-13-99'},{seconds:0},{url:'javascript:alert(1)'},{race:''}])assert.throws(()=>officialResult({...result,...change}));
 assert.throws(()=>validatePreferences({...defaultPreferences(),timeZone:'not/a/zone'}));
});
test('Lab exact/probable duplicates differ, summary exports have no coordinates and CSV prevents formulas',async()=>{
 const a=await model(),analysis=analyzeActivity(a),meta=metadata(a,analysis);assert.equal(probableDuplicate(meta,meta),'exact');
 assert.equal(probableDuplicate(meta,{...meta,source:{...meta.source,hash:'f'.repeat(64)}}),'probable');assert.equal(probableDuplicate(meta,{...meta,source:{...meta.source,hash:'f'.repeat(64)},summary:{...meta.summary,start:meta.summary.start+86400000}}),null);
 assert.ok(!JSON.stringify(publicSummary(analysis)).includes('"lat"'));assert.ok(!metricsCsv([analysis]).includes('latitude'));assert.ok(csv([['=CMD()',42]]).includes("'=CMD()"));
 const rows=historicalStats([meta]);assert.equal(rows.length,1);assert.equal(rows[0].count,1);assert.ok(Math.abs(rows[0].distanceM-5000)<.01);
 await assert.rejects(openLibrary(undefined),/IndexedDB/);
});
