import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

test('production builds regenerate search from publication permissions, without drafts, GPS or application storage', {timeout:120000},()=>{
 const root=resolve('.'),fixture=mkdtempSync(join(tmpdir(),'dido-search-'));
 try {
  for(const entry of ['src','public','package.json','tsconfig.json','astro.config.mjs'])cpSync(join(root,entry),join(fixture,entry),{recursive:true});
  symlinkSync(join(root,'node_modules'),join(fixture,'node_modules'),'dir');
  const write=(path,value)=>writeFileSync(join(fixture,path),typeof value==='string'?value:JSON.stringify(value));
  const post=(name,status,extra='')=>write(`src/content/posts/${name}.md`,`---\ntitle: ${name}\nstatus: ${status}\n${extra}---\nПубличен текст за индексиране.\n<script>PRIVATE_SCRIPT</script>\n![x](/PRIVATE_IMAGE.png)`);
  post('search-published','published');post('private-draft','draft');post('private-legacy','published','draft: true\n');
  const race={title:'Search Race',publicationStatus:'published',date:'2026-12-01',location:'Плевен',notes:'Search Race Body',privateNote:'PRIVATE_RACE_FIELD'};
  write('src/content/races/search-race.json',race);
  write('src/content/races/private-race.json',{...race,title:'PRIVATE_RACE',publicationStatus:'draft'});
  const route=JSON.parse(readFileSync(join(root,'src/content/routes/kaylaka-21km-2026.json'),'utf8'));
  write('src/content/routes/search-route.json',{...route,title:'Search Route Pending',publicApproved:false,privateNote:'PRIVATE_ROUTE_FIELD'});
  write('src/content/routes/private-route.json',{...route,title:'PRIVATE_ROUTE_DRAFT',status:'draft'});
  write('src/content/routes/Bad.gpx.json',{...route,title:'PRIVATE_INVALID_NAME'});
  mkdirSync(join(fixture,'public/apps'),{recursive:true});
  write('public/apps/search-test.html','<!doctype html><title>App</title><script>localStorage.setItem("PRIVATE_BROWSER_DATA","PRIVATE_ORIGINAL_FILE_BODY")</script>');
  const app={id:'search-app',category:'fitnes-trakeri',title:'Search App Pending',description:'Публикувано приложение',status:'draft',download:'/apps/search-test.html'};
  write('src/data/applications.json',{apps:[app,{...app,id:'private-app',title:'PRIVATE_APP',status:'draft'}]});
  const build=()=>{
   execFileSync(process.execPath,[join(root,'node_modules/astro/bin/astro.mjs'),'build'],{cwd:fixture,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},stdio:'pipe'});
   return JSON.parse(readFileSync(join(fixture,'dist/search-index.json'),'utf8'));
  };
  const first=build(),serialized=JSON.stringify(first);
  assert.match(serialized,/search-published/);assert.match(serialized,/Search Race Body/);
  assert.doesNotMatch(serialized,/private-draft|private-legacy|PRIVATE|Search Route Pending|Search App Pending|gpx-source|route-geometry|"segments"|"lat"|"lon"/);
  for(const doc of first.documents){
   const url=new URL(doc.url,'https://dido.test');
   assert.ok(existsSync(join(fixture,'dist',decodeURIComponent(url.pathname),url.pathname.endsWith('/')?'index.html':'')),`missing result: ${doc.url}`);
   if(url.hash)assert.match(readFileSync(join(fixture,'dist',url.pathname,'index.html'),'utf8'),new RegExp(`id="${url.hash.slice(1)}"`));
  }
  // Content publication and withdrawal take effect on the very next build.
  post('private-draft','published');
  write('src/content/races/search-race.json',{...race,publicationStatus:'draft'});
  write('src/content/routes/search-route.json',{...route,title:'Search Route Approved',publicApproved:true,privateNote:'PRIVATE_ROUTE_FIELD'});
  write('src/data/applications.json',{apps:[{...app,title:'Search App Published',status:'published'}]});
  const second=build(),updated=JSON.stringify(second);
  for(const title of ['private-draft','Search Route Approved','Search App Published'])assert.ok(updated.includes(title),title);
  assert.doesNotMatch(updated,/Search Race|private-legacy|PRIVATE|"segments"|"lat"|"lon"/);
  assert.equal(second.documents.filter(doc=>doc.type==='Приложение' && doc.title==='Search App Published')[0]?.url,'/prilozheniya/fitnes-trakeri/#application-search-app');
  assert.match(readFileSync(join(fixture,'dist/prilozheniya/fitnes-trakeri/index.html'),'utf8'),/id="application-search-app"/);
  assert.equal(new Set(second.documents.map(doc=>doc.url)).size,second.documents.length);
 } finally {rmSync(fixture,{recursive:true,force:true});}
});
