import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,writeFileSync,readFileSync,rmSync,symlinkSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {join,resolve,extname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
const enabled=process.env.DIDO_BROWSER_MODULE && process.env.DIDO_BROWSER_URL;

test('personal records: legacy times, optional CMS places/dates, invalid dates and responsive typography',{skip:!enabled,timeout:120000},async()=>{
 const root=process.cwd(),fixture=mkdtempSync(join(tmpdir(),'dido-record-details-'));let browser,server;
 const original=readFileSync('src/data/site.json','utf8'),site=JSON.parse(original),keys=['oneKm','fiveKm','tenKm','halfMarathon'];
 try{
  for(const entry of ['src','public','package.json','tsconfig.json','astro.config.mjs'])cpSync(join(root,entry),join(fixture,entry),{recursive:true});
  symlinkSync(join(root,'node_modules'),join(fixture,'node_modules'),'dir');
  const saved=JSON.stringify({...site,records:{...site.records,
   oneKmPlace:'Тестова писта & парк',oneKmDate:'2026-03-21',
   fiveKmPlace:'Тестов парк',fiveKmDate:'2026-02-30',
   tenKmPlace:'   ',tenKmDate:'2024-02-29',
   halfMarathonPlace:'Тестов маршрут с дълго име за проверка на пренасянето на текста',halfMarathonDate:'2026-11-15'
  }});
  writeFileSync(join(fixture,'src/data/site.json'),saved);
  execFileSync(process.execPath,[join(root,'node_modules/astro/bin/astro.mjs'),'build'],{cwd:fixture,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},stdio:'pipe',timeout:90000});
  const dist=join(fixture,'dist'),mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
  server=createServer((req,res)=>{try{let file=resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(relative(dist,file).startsWith('..'))throw Error();if(existsSync(file)&&statSync(file).isDirectory())file=join(file,'index.html');res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.statusCode=404;res.end('Not found');}});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
  const {chromium}=createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE);browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});mkdirSync('work/record-details-preview',{recursive:true});
  for(const width of [320,390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
   let baseline;
   for(const path of ['/','/byagane/']){
    await page.goto(process.env.DIDO_BROWSER_URL+path);await page.locator('.records-photo').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    const records=page.locator('.records .record');assert.equal(await records.count(),4);assert.deepEqual(await records.locator('strong').allTextContents(),keys.map(key=>site.records[key]));
    assert.equal(await page.locator('.records .record-details').count(),0,'old CMS save must not add empty details');assert.doesNotMatch(await page.locator('.records').textContent(),/мин:сек/);
    baseline=await records.locator('strong').evaluateAll(nodes=>nodes.map(node=>({size:getComputedStyle(node).fontSize,color:getComputedStyle(node).color})));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(path==='/byagane/' && [390,1440].includes(width))await page.locator('.records').screenshot({path:`work/record-details-preview/current-${width}.png`});
   }
   await page.goto(origin+'/byagane/');await page.locator('.records-photo').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
   const records=page.locator('.records .record');assert.deepEqual(await records.locator('strong').allTextContents(),keys.map(key=>site.records[key]));
   assert.deepEqual(await records.locator('strong').evaluateAll(nodes=>nodes.map(node=>({size:getComputedStyle(node).fontSize,color:getComputedStyle(node).color}))),baseline,'time typography and half-marathon accent must stay unchanged');
   assert.equal(await page.locator('.records .record-highlight').count(),1);assert.equal(await page.locator('.records .record-highlight > span svg').count(),1);
   assert.equal(await records.nth(0).locator('.record-details span').textContent(),'Тестова писта & парк');assert.equal(await records.nth(0).locator('time').getAttribute('datetime'),'2026-03-21');assert.equal(await records.nth(0).locator('time').textContent(),'21.03.2026');
   assert.equal(await records.nth(1).locator('time').count(),0,'impossible dates stay hidden');assert.equal(await records.nth(1).locator('.record-details span').textContent(),'Тестов парк');
   assert.equal(await records.nth(2).locator('.record-details span').count(),0,'whitespace-only places stay hidden');assert.equal(await records.nth(2).locator('time').textContent(),'29.02.2024');
   assert.equal(await records.nth(3).locator('time').textContent(),'15.11.2026');assert.equal(await page.locator('.record-details svg').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   for(const record of await records.all())assert.equal(await record.evaluate(node=>node.scrollWidth>node.clientWidth+1),false,'metadata must wrap without overflow');
   if([390,1440].includes(width))await page.locator('.records').screenshot({path:`work/record-details-preview/example-${width}.png`});
   assert.deepEqual(errors,[]);await page.close();
  }
  assert.equal(readFileSync('src/data/site.json','utf8'),original);assert.equal(readFileSync(join(fixture,'src/data/site.json'),'utf8'),saved);
 }finally{await browser?.close();if(server)await new Promise(done=>server.close(done));rmSync(fixture,{recursive:true,force:true});}
});
