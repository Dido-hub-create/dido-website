import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {normalizeSiteSettings} from '../src/lib/site-settings.mjs';
import {recordDate} from '../src/lib/record-date.mjs';

const keys=['oneKm','fiveKm','tenKm','halfMarathon'];
test('record metadata is optional, independent and read-only; existing time fields retain their values',()=>{
 const current=JSON.parse(readFileSync('src/data/site.json','utf8'));
 const input={records:{...current.records,oneKmPlace:'Тестова писта',fiveKmDate:'2026-11-16',tenKmPlace:null,tenKmDate:42,halfMarathonPlace:{bad:true}}};
 const before=structuredClone(input),normalized=normalizeSiteSettings(input).records;
 for(const key of keys)assert.equal(normalized[key],current.records[key]);
 assert.equal(normalized.oneKmPlace,'Тестова писта');assert.equal(normalized.oneKmDate,'');
 assert.equal(normalized.fiveKmPlace,'');assert.equal(normalized.fiveKmDate,'2026-11-16');
 assert.equal(normalized.tenKmPlace,'');assert.equal(normalized.tenKmDate,'');assert.equal(normalized.halfMarathonPlace,'');
 assert.deepEqual(input,before);
 const withoutTime=normalizeSiteSettings({records:{oneKmPlace:'Тестова писта',oneKmDate:'2026-11-16'}}).records;
 assert.equal(withoutTime.oneKm,'');assert.equal(withoutTime.oneKmPlace,'Тестова писта');assert.equal(withoutTime.oneKmDate,'2026-11-16');
 const old=normalizeSiteSettings({records:current.records}).records;
 for(const key of keys){assert.equal(old[key],current.records[key]);assert.equal(old[key+'Place'],current.records[key+'Place']??'');assert.equal(old[key+'Date'],current.records[key+'Date']??'');}
});
test('record dates use Bulgarian calendar labels and reject empty, impossible or timestamp values',()=>{
 for(const [iso,label] of [['2026-11-16','16.11.2026'],['2024-02-29','29.02.2024'],['2026-01-01','01.01.2026']])assert.deepEqual(recordDate(' '+iso+' '),{iso,label});
 for(const value of [undefined,null,'','   ',42,{},'2026-02-29','2026-02-30','2026-04-31','2026-13-01','2026-00-10','2026-01-00','0000-01-01','2026-1-2','16.11.2026','2026-11-16T00:00:00Z','<script>bad</script>'])assert.equal(recordDate(value),undefined,String(value));
});
test('CMS keeps original record time keys and adds eight optional, correctly formatted fields',()=>{
 const site=parse(readFileSync('.pages.yml','utf8')).content.find(item=>item.name==='site');
 const fields=site.fields.find(field=>field.name==='records').fields;
 assert.deepEqual(fields.map(field=>field.name),keys.flatMap(key=>[key,key+'Place',key+'Date']));
 for(const key of keys){
  assert.equal(fields.find(field=>field.name===key).type,'string');
  const place=fields.find(field=>field.name===key+'Place'),date=fields.find(field=>field.name===key+'Date');
  assert.equal(place.type,'string');assert.equal(place.required,false);assert.equal(date.type,'date');assert.equal(date.required,false);assert.equal(date.options.format,'yyyy-MM-dd');
 }
});
