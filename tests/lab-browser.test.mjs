import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {gpx,fit,tcx} from './helpers/lab-fixtures.mjs';
const enabled=!!(process.env.DIDO_BROWSER_MODULE&&process.env.DIDO_BROWSER_URL),base=process.env.DIDO_BROWSER_URL;
const fixture=(name,options={},day='01')=>({name,mimeType:'application/octet-stream',buffer:Buffer.from(gpx(options).replace('Тестово бягане',name.replace('.gpx','')).replaceAll('2026-01-01','2026-01-'+day))});
const binary=(name,buffer)=>({name,mimeType:'application/octet-stream',buffer:Buffer.from(buffer)});
const frame=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const idle=page=>page.locator('[data-lab-job]').waitFor({state:'hidden',timeout:90000});
const nav=(page,name)=>page.locator(`[data-tab="${name}"]`).click();
const action=async(page,name)=>{await page.locator(`[data-action="${name}"]`).first().click();await idle(page);};
async function dialogAction(page,name,accept=true){page.once('dialog',dialog=>accept?dialog.accept():dialog.dismiss());await action(page,name);}
async function upload(page,files){await nav(page,'import');await page.locator('[data-lab-files]').setInputFiles(files);await idle(page);}
const launch=async()=>{const {chromium}=createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE);return chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});};
async function ready(page){await page.goto(base+'/byagane/running-lab/');await page.locator('[data-lab-records] tbody tr').first().waitFor({state:'attached'});}
async function database(page,store='metadata'){return page.evaluate(store=>new Promise((resolve,reject)=>{const request=indexedDB.open('dido-running-lab-v1',1);request.onerror=()=>reject(Error('IDB open'));request.onsuccess=()=>{const db=request.result,query=db.transaction(store).objectStore(store).getAll();query.onsuccess=()=>{resolve(query.result);db.close();};query.onerror=()=>reject(Error('IDB read'));};}),store);}
async function downloaded(page,name){const pending=page.waitForEvent('download');await action(page,name);const download=await pending;return readFileSync(await download.path(),'utf8');}

test('Running Lab browser: explicit saves, library, charts, 2–3 comparisons, records, exports and checked atomic restore',{skip:!enabled,timeout:240000},async()=>{
 const browser=await launch(),context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true,acceptDownloads:true}),page=await context.newPage();
 const errors=[],traffic=[];page.on('pageerror',error=>errors.push(error.message));
 context.on('request',request=>traffic.push({url:request.url(),method:request.method(),body:request.postData()}));
 await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===base||url.protocol==='data:'?route.continue():route.abort();});
 const shots=process.env.DIDO_LAB_SCREENSHOTS||'work/lab-preview';mkdirSync(shots,{recursive:true});
 try{
  await ready(page);assert.equal((await database(page)).length,0);assert.equal(await page.locator('[data-lab-previews] article').count(),0);
  assert.equal(await page.locator('[data-lab-storage]').isVisible(),false);
  const favorite=page.locator('[data-favorite-url="/byagane/running-lab/"]');await favorite.click();assert.equal(await favorite.getAttribute('aria-pressed'),'true');
  const index=await page.request.get(base+'/search-index.json');const indexText=await index.text();assert.match(indexText,/DIDO Running Lab/);assert.doesNotMatch(indexText,/Контролиран тест|Без хранилище|run-[a-f0-9]{64}/);
  await page.locator('[data-running-lab]').screenshot({path:shots+'/empty-1440.png'});
  const files=[fixture('Контролиран тест A.gpx',{distance:5000,elevation:d=>100+25*Math.sin(d/700)}),fixture('Контролиран тест B.gpx',{distance:6000,pace:d=>d<3000?330:300},'02'),fixture('Контролиран тест C.gpx',{distance:7000,pace:()=>315},'03'),binary('broken.gpx','<bad>')];
  await upload(page,files);assert.equal(await page.locator('[data-lab-previews] article').count(),3);assert.match(await page.locator('[data-lab-import-report]').textContent(),/3 тренировки.*1 проблема/);
  assert.equal((await database(page)).length,0,'imports are temporary until an explicit confirmed save');
  await dialogAction(page,'save-selected',false);assert.equal((await database(page)).length,0);
  await dialogAction(page,'save-selected');assert.equal((await database(page)).length,3);
  await action(page,'open-preview');await page.locator('[data-lab-detail-graphs] > summary').click();await page.locator('[data-lab-charts] svg').first().waitFor({state:'attached'});
  assert.equal(await page.locator('[data-lab-charts] svg').count(),5);assert.match(await page.locator('[data-lab-stats]').textContent(),/5 km/);
  const chart=page.locator('[data-lab-charts] svg').first();await chart.scrollIntoViewIfNeeded();const box=await chart.boundingBox();
  const before=await page.locator('[data-lab-map-cursor]').getAttribute('cy');await page.mouse.move(box.x+box.width*.65,box.y+70);await frame(page);
  assert.notEqual(await page.locator('[data-lab-map-cursor]').getAttribute('cy'),before);
  const cursors=await page.locator('[data-lab-charts] .lab-cursor-line').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('x1')));assert.equal(new Set(cursors).size,1,'all charts share the cursor');
  await chart.focus();await chart.press('Home');await frame(page);assert.match(await page.locator('[data-point-field=distance]').textContent(),/^0 км/);await chart.press('End');await frame(page);assert.match(await page.locator('[data-point-field=distance]').textContent(),/^5 км/);
  await page.locator('.lab-range-details > summary').click();await page.locator('[data-lab-range-start]').fill('1');await page.locator('[data-lab-range-end]').fill('2');await action(page,'range');assert.match(await page.locator('[data-lab-range-result]').textContent(),/1.?000 м.*0:05:00/);
  const oldPath=await chart.locator('path').getAttribute('d');await action(page,'zoom');assert.notEqual(await page.locator('[data-lab-charts] svg path').first().getAttribute('d'),oldPath);await action(page,'reset-zoom');
  await page.locator('[data-lab-axis]').selectOption('time');assert.match(await page.locator('[data-lab-charts] svg').first().getAttribute('aria-label'),/мин/);await page.locator('[data-lab-axis]').selectOption('distance');
  await page.locator('.lab-overview-settings > summary').click();await page.locator('[data-lab-smoothing]').selectOption('50');await idle(page);assert.equal((await database(page,'activities'))[0].settings.smoothingM,100,'settings are not saved automatically');
  await dialogAction(page,'save-active');assert.ok((await database(page,'activities')).some(row=>row.settings.smoothingM===50));
  await page.locator('[data-lab-smoothing]').selectOption('100');await idle(page);await dialogAction(page,'save-active');
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(220);await nav(page,'overview');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no page overflow at '+width);
   const svg=page.locator('[data-lab-charts] svg').first();await svg.scrollIntoViewIfNeeded();const b=await svg.boundingBox();
   await page.touchscreen.tap(b.x+b.width*.55,b.y+85);assert.match(await page.locator('[data-lab-cursor]').textContent(),/наклон/i);
   if(width===390){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:0,x:b.x+b.width*.35,y:b.y+85}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:0,x:b.x+b.width*.75,y:b.y+85}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await idle(page);assert.match(await page.locator('[data-lab-range-result]').textContent(),/м/);}
   if([390,1440].includes(width)){await page.evaluate(()=>document.activeElement?.blur());await page.waitForFunction(()=>document.querySelector('.skip-link').getBoundingClientRect().bottom<0);await page.locator('[data-panel="overview"]').screenshot({path:`${shots}/overview-${width}.png`});await page.locator('[data-lab-charts]').screenshot({path:`${shots}/charts-${width}.png`});}
  }
  await page.setViewportSize({width:1440,height:1000});await nav(page,'analysis');assert.equal(await page.locator('[data-lab-splits] tbody tr').count(),5);assert.equal(await page.locator('[data-lab-lap-table] tbody tr').count(),0,'no invented laps');
  await page.locator('.lab-lap-settings > summary').click();await page.locator('[data-lab-laps-form] [name="length"]').fill('2.5');await page.locator('[data-lab-laps-form] button').click();await idle(page);assert.equal(await page.locator('[data-lab-lap-table] tbody tr').count(),2);
  await nav(page,'overview');await dialogAction(page,'save-active');
  const summary=JSON.parse(await downloaded(page,'summary'));assert.equal(summary.coordinateDataIncluded,false);assert.equal(JSON.stringify(summary).includes('"lat"'),false);
  const csv=await downloaded(page,'metrics-csv');assert.match(csv,/Дистанция m/);assert.doesNotMatch(csv,/latitude|longitude|"lat"/);
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('.lab-private-map').isVisible(),false);await page.emulateMedia({media:'screen'});
  await nav(page,'library');assert.equal(await page.locator('[data-lab-library] article').count(),3);
  await page.locator('[data-lab-min-distance]').fill('5.5');await page.locator('[data-lab-max-distance]').fill('6.5');assert.equal(await page.locator('[data-lab-library] article').count(),1);
  await page.locator('[data-lab-min-distance]').fill('');await page.locator('[data-lab-max-distance]').fill('');await page.locator('[data-lab-search]').fill('тест B');assert.equal(await page.locator('[data-lab-library] article').count(),1);await page.locator('[data-lab-search]').fill('');
  let promptIndex=0;const prompts=['Вечерен тест <img src=x onerror=alert(1)>','Личен коментар <script>не се изпълнява</script>'];const onPrompt=dialog=>dialog.accept(prompts[promptIndex++]);page.on('dialog',onPrompt);await page.locator('[data-action="rename"]').first().click();await idle(page);page.off('dialog',onPrompt);assert.equal(promptIndex,2);assert.equal(await page.locator('[data-lab-library] img,[data-lab-library] script').count(),0);
  await page.locator('[data-lab-sort]').selectOption('distance');const libraryChecks=page.locator('[data-lab-library] input[type="checkbox"]');await libraryChecks.nth(0).check();await libraryChecks.nth(1).check();await action(page,'compare-selected');assert.equal(await page.locator('[data-lab-comparison] .lab-chart-card').count(),2);
  await nav(page,'library');await libraryChecks.nth(2).check();await action(page,'compare-selected');assert.equal(await page.locator('[data-lab-comparison] .lab-chart-card').count(),3);
  for(const mode of ['time','splits','laps','distance']){await page.locator('[data-lab-compare-mode]').selectOption(mode);await idle(page);assert.equal(await page.locator('[data-lab-comparison] .lab-chart-card').count(),3);}
  for(const metric of ['hr','elevation','cad','pace']){await page.locator('[data-lab-compare-metric]').selectOption(metric);assert.equal(await page.locator('[data-lab-comparison] .lab-chart-card').count(),3);assert.equal(await page.locator('[data-lab-comparison] svg').count(),3);}
  await page.locator('[data-panel="compare"]').screenshot({path:shots+'/compare-1440.png'});
  await nav(page,'records');await page.locator('[data-lab-distance-form] [name="km"]').fill('2.3');await page.locator('[data-lab-distance-form] button').click();await idle(page);assert.match(await page.locator('[data-lab-records]').textContent(),/2,3 km/);
  const official=page.locator('[data-lab-official-form]');for(const [name,value]of Object.entries({km:'5',time:'24:55',date:'2026-02-01',race:'Контролиран официален тест',url:'https://example.org/results',comment:'Тестова стойност'}))await official.locator(`[name="${name}"]`).fill(value);
  await official.locator('button').first().click();await idle(page);assert.match(await page.locator('[data-lab-official]').textContent(),/0:24:55/);
  await action(page,'edit-official');await official.locator('[name="time"]').fill('24:50');await official.locator('button').first().click();await idle(page);assert.match(await page.locator('[data-lab-official]').textContent(),/0:24:50/);
  await nav(page,'history');assert.match(await page.locator('[data-lab-history]').textContent(),/2026-01/);assert.match(await page.locator('[data-lab-years]').textContent(),/3 тренировки/);
  await nav(page,'settings');const archive=await downloaded(page,'backup'),payload=JSON.parse(archive);assert.equal(payload.payload.activities.length,3);assert.equal(payload.payload.preferences.officialResults.length,1);assert.deepEqual(payload.payload.preferences.customDistances,[2300]);
  await page.locator('[data-lab-restore]').setInputFiles(binary('bad.json',archive.replace('Контролиран','Променен')));await idle(page);assert.equal(await page.locator('[data-action="restore"]').isDisabled(),true);assert.match(await page.locator('[data-lab-status]').textContent(),/Checksum/);assert.equal((await database(page)).length,3);
  await page.locator('[data-lab-restore]').setInputFiles(binary('backup.json',archive));await idle(page);assert.match(await page.locator('[data-lab-restore-preview]').textContent(),/3 точни/);await dialogAction(page,'restore');assert.equal((await database(page)).length,3);
  await dialogAction(page,'delete-library',false);assert.equal((await database(page)).length,3);await dialogAction(page,'delete-library');assert.equal((await database(page)).length,0);
  await page.locator('[data-lab-restore]').setInputFiles(binary('backup.json',archive));await idle(page);await page.locator('[data-lab-restore-mode]').selectOption('replace');await dialogAction(page,'restore',false);assert.equal((await database(page)).length,0);await dialogAction(page,'restore');assert.equal((await database(page)).length,3);
  assert.equal((await database(page,'preferences'))[0].value.officialResults[0].seconds,1490);
  await page.reload();await page.locator('[data-lab-records] tbody tr').first().waitFor({state:'attached'});await nav(page,'library');assert.equal(await page.locator('[data-lab-library] article').count(),3);assert.match(await page.locator('[data-lab-library]').textContent(),/Вечерен тест <img/);
  await upload(page,[files[0]]);assert.match(await page.locator('[data-lab-previews]').textContent(),/Точен дубликат/);assert.equal(await page.locator('[data-action="save-selected"]').isDisabled(),true);
  // A forced quota exception occurs after clear() has been queued in the same transaction.
  await nav(page,'settings');await page.locator('[data-lab-restore]').setInputFiles(binary('backup.json',archive));await idle(page);await page.locator('[data-lab-restore-mode]').selectOption('replace');
  await page.evaluate(()=>{window.__labPut=IDBObjectStore.prototype.put;let writes=0;IDBObjectStore.prototype.put=function(...args){if(this.name==='activities'&&++writes===2)throw new DOMException('Forced test quota','QuotaExceededError');return window.__labPut.apply(this,args);};});
  await dialogAction(page,'restore');assert.match(await page.locator('[data-lab-status]').textContent(),/квота|quota|място|запазена/i);assert.equal((await database(page)).length,3,'aborted replace preserves all old data');await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__labPut;});
  await page.reload();await page.locator('[data-lab-records] tbody tr').first().waitFor({state:'attached'});assert.equal((await database(page)).length,3);
  await upload(page,[binary('mixed.zip',zipSync({'indoor.tcx':strToU8(tcx),'watch.fit':fit({compressed:true}),'bad.fit':new Uint8Array([1,2,3])}))]);assert.equal(await page.locator('[data-lab-previews] article').count(),2);assert.match(await page.locator('[data-lab-import-report]').textContent(),/1 проблема/);
  assert.deepEqual(errors,[]);assert.ok(traffic.every(request=>request.method==='GET'&&!request.body),'no workout upload, POST or telemetry payload');
  assert.ok(traffic.filter(request=>new URL(request.url).origin!==base).every(request=>/cloudflareinsights\.com/.test(request.url)),'only unchanged site analytics may request an external script');
 }finally{await browser.close();}
});

test('Running Lab browser: no IndexedDB, local-only requests, cancellation and browser restart persistence',{skip:!enabled,timeout:180000},async()=>{
 const browser=await launch();let context;
 try{
  context=await browser.newContext();await context.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('Denied','SecurityError');}});});const page=await context.newPage();await page.goto(base+'/byagane/running-lab/');await page.locator('[data-lab-storage]').waitFor({state:'visible'});
  await upload(page,[fixture('Без хранилище.gpx')]);assert.equal(await page.locator('[data-lab-previews] article').count(),1);await action(page,'open-preview');await page.locator('[data-lab-detail-graphs] > summary').click();await page.locator('[data-lab-charts] svg').first().waitFor({state:'attached'});assert.equal(await page.locator('[data-lab-charts] svg').count(),5);await action(page,'save-active');assert.match(await page.locator('[data-lab-status]').textContent(),/не е достъпна/);await context.close();
  context=await browser.newContext();const cancel=await context.newPage();await ready(cancel);
  const batch=Array.from({length:80},(_,i)=>fixture(`Партида ${i}.gpx`,{distance:5000,offset:i}));await cancel.locator('[data-lab-files]').setInputFiles(batch);await cancel.locator('[data-action="cancel"]').click();await idle(cancel);assert.match(await cancel.locator('[data-lab-status]').textContent(),/прекратен/);assert.equal((await database(cancel)).length,0);
  const pending=await cancel.locator('[data-lab-previews] article').count();if(pending)cancel.once('dialog',dialog=>dialog.accept());await upload(cancel,[binary('real-wire.fit',fit({developer:true}))]);assert.equal(await cancel.locator('[data-lab-previews] article').count(),1,'worker can restart after cancellation');await context.close();
 }finally{await browser.close();}
 const directory=mkdtempSync(join(tmpdir(),'dido-lab-browser-'));const {chromium}=createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE);let persistent;
 try{
  const options={executablePath:'/usr/bin/chromium',args:['--no-sandbox']};persistent=await chromium.launchPersistentContext(directory,options);let page=await persistent.newPage();await ready(page);await upload(page,[fixture('Запазен след затваряне.gpx')]);await dialogAction(page,'save-selected');await persistent.close();
  persistent=await chromium.launchPersistentContext(directory,options);page=await persistent.newPage();await ready(page);await nav(page,'library');assert.equal(await page.locator('[data-lab-library] article').count(),1);assert.match(await page.locator('[data-lab-library]').textContent(),/Запазен след затваряне/);
  const requests=[];page.on('request',request=>requests.push(request.url()));await page.goto(base+'/');await page.waitForLoadState('networkidle');assert.ok(!requests.some(url=>/worker-|fit-import|fit-file|fflate|running-lab.*\.js/.test(url)),'home does not fetch Lab worker or decoders');
 }finally{await persistent?.close();rmSync(directory,{recursive:true,force:true});}
});

test('Running Lab browser: bounded 200-file import and 10,000-point FIT keep the UI responsive',{skip:!enabled,timeout:180000},async()=>{
 const browser=await launch(),page=await browser.newPage({viewport:{width:390,height:900}});
 try{
  await ready(page);await page.evaluate(()=>{window.__labTicks=0;setInterval(()=>window.__labTicks++,25);});
  const batch=Array.from({length:200},(_,i)=>fixture(`Контролиран масов тест ${i}.gpx`,{distance:1000,step:20,offset:i}));
  let started=performance.now();await upload(page,batch);const batchMs=Math.round(performance.now()-started);assert.equal(await page.locator('[data-lab-previews] article').count(),200);assert.equal((await database(page)).length,0);
  assert.ok(await page.evaluate(()=>window.__labTicks>10),'main thread responds while the worker imports a batch');
  await action(page,'clear-preview');
  const activity=tcx.match(/<Activity[\s\S]*<\/Activity>/)[0],manyTcx='<TrainingCenterDatabase><Activities>'+activity.repeat(200)+'</Activities></TrainingCenterDatabase>';
  await upload(page,[binary('many-sessions.zip',zipSync({'first.tcx':strToU8(manyTcx),'second.tcx':strToU8(manyTcx+'\n')}))]);assert.equal(await page.locator('[data-lab-previews] article').count(),200,'multiple sessions cannot exceed the per-batch activity limit');assert.match(await page.locator('[data-lab-import-report]').textContent(),/200 тренировки/);
  await action(page,'clear-preview');const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const before=await page.evaluate(()=>window.__labTicks);started=performance.now();await upload(page,[binary('Контролиран FIT 10000.fit',fit({recordCount:10000}))]);const fitMs=Math.round(performance.now()-started);assert.equal(await page.locator('[data-lab-previews] article').count(),1);assert.ok(await page.evaluate(()=>window.__labTicks>0));assert.ok(await page.evaluate(previous=>window.__labTicks-previous,before)>5);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log(JSON.stringify({labPerformance:{files:200,batchMs,fitPoints:10000,fitMs,cpuThrottle:4}}));
 }finally{await browser.close();}
});
