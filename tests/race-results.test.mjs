import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {normalizeRankings,legacyPlacing,compareArchivedRaces} from '../src/lib/race-results.mjs';import {loadRaces} from '../src/lib/running.mjs';import {validateCms} from '../scripts/validate-cms.mjs';
test('rankings require safe positive integer pairs; independent missing/invalid groups never produce fake numbers',()=>{
 const valid={place:12,total:80};
 for(const value of [undefined,null,[],0,'12'])assert.deepEqual(normalizeRankings(value),[]);
 for(const place of [0,-1,1.5,'12',true,Infinity,Number.MAX_SAFE_INTEGER+1,81,undefined])assert.deepEqual(normalizeRankings({overall:{...valid,place}}),[]);
 for(const total of [0,-1,1.5,'80',false,NaN,undefined])assert.deepEqual(normalizeRankings({overall:{...valid,total}}),[]);
 const ranks=normalizeRankings({overall:valid,men:{place:2,total:1},ageGroup:{...valid,label:'  М60–64  '}});assert.equal(ranks.length,2);assert.equal(ranks[1].label,'М60–64');
 assert.equal(normalizeRankings({ageGroup:valid})[0].label,'Възрастова група');
 assert.equal(legacyPlacing({placing:'12 от 80',rankings:ranks}),'');assert.equal(legacyPlacing({placing:'М60–64:12 / 80',rankings:ranks}),'');assert.equal(legacyPlacing({placing:'Възрастова група: специална награда',rankings:ranks}),'Възрастова група: специална награда');
});
test('CMS fields stay optional; round-tripped JSON preserves official result and legacy text without rewriting originals',()=>{
 const cms=validateCms(readFileSync('.pages.yml','utf8')),fields=cms.content.find(c=>c.name==='races').fields;
 const ranking=fields.find(f=>f.name==='rankings');assert.ok(!ranking.required);for(const g of ranking.fields){assert.ok(!g.required);for(const f of g.fields.filter(f=>f.type==='number')){assert.ok(!f.required);assert.equal(f.options.min,1);assert.equal(f.options.step,1);}}
 assert.equal(fields.find(f=>f.name==='result').type,'string');assert.equal(fields.find(f=>f.name==='placing').type,'string');
 const root=mkdtempSync(join(tmpdir(),'dido-rankings-'));try{mkdirSync(join(root,'src/content/races'),{recursive:true});const path=join(root,'src/content/races/test.json');
 const data={title:'Test',publicationStatus:'published',date:'2020-01-01',status:'completed',result:'2:07:14',placing:'Специално отличие',rankings:{overall:{place:42,total:200},men:{place:30,total:120},ageGroup:{label:'М60–64',place:3,total:18}}};writeFileSync(path,JSON.stringify(data));const source=readFileSync(path,'utf8');let race=loadRaces(root)[0];assert.equal(race.result,'2:07:14');assert.equal(race.rankings.length,3);assert.equal(race.placing,data.placing);assert.equal(readFileSync(path,'utf8'),source);
 delete data.rankings;writeFileSync(path,JSON.stringify(data));race=loadRaces(root)[0];assert.deepEqual(race.rankings,[]);assert.equal(race.placing,data.placing);
 delete data.result;data.rankings={result:'fake'};writeFileSync(path,JSON.stringify(data));assert.equal(loadRaces(root)[0].result,'');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('archive order is newest date first with deterministic ties and unknown dates last',()=>{
 const races=[{id:'old',date:'2024-01-01'},{id:'unknown',date:''},{id:'new',date:'2026-01-01'}];assert.deepEqual(races.sort(compareArchivedRaces).map(r=>r.id),['new','old','unknown']);
});
