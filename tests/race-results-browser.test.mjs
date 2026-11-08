import test from 'node:test';import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync,symlinkSync,existsSync,readdirSync,statSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';import {createServer} from 'node:http';
const enabled=process.env.DIDO_BROWSER_MODULE&&process.env.DIDO_BROWSER_URL;
test('race archive: real local fixture build, responsive cards, 3+3 disclosure, detail parity and automatic midnight migration',{skip:!enabled,timeout:180000},async()=>{
 const root=process.cwd(),fixture=mkdtempSync(join(tmpdir(),'dido-race-ui-'));let browser,server;
 try{
  for(const entry of ['src','public','package.json','tsconfig.json','astro.config.mjs'])cpSync(join(root,entry),join(fixture,entry),{recursive:true});
  symlinkSync(join(root,'node_modules'),join(fixture,'node_modules'),'dir');rmSync(join(fixture,'src/content/races'),{recursive:true});mkdirSync(join(fixture,'src/content/races'));
  const post=readdirSync(join(fixture,'src/content/posts')).find(f=>f.endsWith('.md'));
  for(let i=1;i<=7;i++){
   const data={title:`Тестов полумаратон ${i}`,publicationStatus:'published',date:`2020-01-0${i}`,status:'completed',distance:'21,1 км',location:'Тестов град',result:'2:11:13',rankings:{overall:{place:27,total:200},men:{place:19,total:140},ageGroup:{label:'М60–64',place:3,total:12}}};
   if(i===6)data.rankings={overall:{place:5,total:50},men:{place:51,total:50}};
   if(i===5){delete data.result;delete data.rankings;data.placing='Лично участие — тест';}
   if(i===3)delete data.rankings.men;
   if(i===2)delete data.result;
   if(i===4)data.rankings.ageGroup.label='<img src=x onerror=alert(1)>';
   if(i===7){data.notes='Тестови бележки';data.gallery=['/images/dido-mountain-hero.webp'];data.cover='/images/dido-mountain-hero.webp';data.route='src/content/routes/kaylaka-21km-2026.json';data.post='src/content/posts/'+post;data.officialUrl='https://example.org';}
   writeFileSync(join(fixture,`src/content/races/fixture-${i}.json`),JSON.stringify(data));
  }
  writeFileSync(join(fixture,'src/content/races/fixture-upcoming.json'),JSON.stringify({title:'Бъдещ тестов старт',publicationStatus:'published',status:'confirmed',date:'2099-01-01',startTime:'10:00',result:'9:59:59',rankings:{overall:{place:1,total:100}}}));
  const build=spawnSync(process.execPath,['node_modules/astro/bin/astro.mjs','build'],{cwd:fixture,encoding:'utf8',env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},timeout:90000});assert.equal(build.status,0,(build.stdout+build.stderr).slice(-4000));
  const dist=join(fixture,'dist'),mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
  server=createServer((req,res)=>{try{let file=resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(dist+'/'))throw Error();if(existsSync(file)&&statSync(file).isDirectory())file=join(file,'index.html');res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}catch{res.statusCode=404;res.end('Not found');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  const {chromium}=createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE);browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});mkdirSync('work/race-results-visuals',{recursive:true});
  for(const width of [320,390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:960}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/byagane/sastezaniya/');const archive=page.locator('[data-race-group="archive"]'),more=page.locator('[data-race-more]');
   assert.equal(await archive.locator('.race-card:visible').count(),3);assert.deepEqual(await archive.locator('.race-card:visible').evaluateAll(cs=>cs.map(c=>c.id)),['race-fixture-7','race-fixture-6','race-fixture-5']);
   assert.equal(await more.getAttribute('aria-expanded'),'false');assert.equal(await archive.locator('img').count(),0);
   assert.equal(await archive.locator('#race-fixture-7 .ranking-panel').count(),3);assert.equal(await archive.locator('#race-fixture-6 .ranking-panel').count(),1);assert.equal(await archive.locator('#race-fixture-5 .official-time,.race-card#race-fixture-5 .ranking-panel').count(),0);
   assert.equal(await page.locator('[data-race-group="upcoming"] .official-time:visible').count(),0);assert.ok((await page.locator('[data-race-group="upcoming"] [data-countdown]').textContent()).length>0);
   assert.equal(await archive.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),width>=768?2:1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('#races-archive').click();await page.locator('#arhiv-sastezaniya').screenshot({path:`work/race-results-visuals/archive-${width}.png`});
   await archive.locator('#race-fixture-7').screenshot({path:`work/race-results-visuals/three-rankings-${width}.png`});await archive.locator('#race-fixture-6').screenshot({path:`work/race-results-visuals/partial-${width}.png`});
   await more.focus();await page.keyboard.press('Enter');assert.equal(await archive.locator('.race-card:visible').count(),6);assert.equal(await more.getAttribute('aria-expanded'),'true');assert.equal(await archive.locator('#race-fixture-4 img').count(),0);assert.equal(await archive.locator('#race-fixture-3 .ranking-panel').count(),2);assert.equal(await archive.locator('#race-fixture-2 .official-time').count(),0);assert.equal(await archive.locator('#race-fixture-2 .ranking-panel').count(),3);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await more.focus();await page.keyboard.press('Enter');assert.equal(await archive.locator('.race-card:visible').count(),7);assert.equal(await more.isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.closest('.race-card')?.id),'race-fixture-1');
   await page.goto(origin+'/byagane/sastezaniya/fixture-7/');assert.equal(await page.locator('.official-time:visible strong').textContent(),'2:11:13');assert.equal(await page.locator('.ranking-panel:visible').count(),3);assert.ok(await page.locator('a[href="/byagane/marshruti/kaylaka-21km-2026/"]').count());assert.ok(await page.locator('.running-gallery a').count());assert.ok((await page.locator('.running-notes').textContent()).includes('Тестови бележки'));assert.equal(await page.locator('[data-race-more]').count(),0);assert.ok(await page.locator('a[href="https://example.org/"]').count());assert.ok(await page.locator('a[href^="/posts/"]').count());
   await page.goto(origin+'/byagane/sastezaniya/fixture-upcoming/');assert.equal(await page.locator('.official-time:visible').count(),0);
   if(width===390){
    await page.clock.install({time:new Date('2099-01-01T21:59:30Z')});await page.goto(origin+'/byagane/sastezaniya/');assert.equal(await page.locator('[data-race-group="upcoming"] > .race-card').count(),1);
    await page.clock.fastForward(61000);assert.equal(await page.locator('[data-race-group="upcoming"] > .race-card').count(),0);assert.equal(await page.locator('[data-race-group="archive"] > .race-card:visible').count(),3);assert.equal(await page.locator('[data-race-group="archive"] > .race-card').first().getAttribute('id'),'race-fixture-upcoming');assert.equal(await page.locator('#race-fixture-upcoming .official-time strong').textContent(),'9:59:59');assert.ok(await page.locator('#race-fixture-upcoming').evaluate(c=>c.classList.contains('archived-race-card')));
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();await page.goto(origin+'/byagane/sastezaniya/');assert.equal(await page.locator('[data-race-group="archive"] > .race-card:visible').count(),7);assert.equal(await page.locator('[data-race-more]').isVisible(),false);await context.close();
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));rmSync(fixture,{recursive:true,force:true});}
});
