import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdirSync,readFileSync} from 'node:fs';
const enabled=process.env.DIDO_BROWSER_MODULE&&process.env.DIDO_BROWSER_URL;
test('cabinet online and standalone document: CRUD, reload, topics, confirmed JSON round-trip, mobile and isolation',{skip:!enabled,timeout:120000},async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE);const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const url of [process.env.DIDO_BROWSER_URL+'/tehnologii/digitalen-kabinet/',process.env.DIDO_BROWSER_URL+'/downloads/digitalen-kabinet.html']){
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("teacherHub.resources")||"[]").length+JSON.parse(localStorage.getItem("teacherHub.topics")||"[]").length),0);
  await page.locator('#btnAddResource').click();await page.locator('#fName').fill('Тест <img src=x onerror=alert(1)>');await page.locator('#fLink').fill('https://example.org/');await page.locator('#fFav').check();await page.locator('#mSave').click();
  assert.equal(await page.locator('#content img').count(),0);await page.reload();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("teacherHub.resources")||"[]").length),1);
  await page.locator('[data-edit-res]').first().click();await page.locator('#fName').fill('Променен ресурс');await page.locator('#mSave').click();await page.reload();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("teacherHub.resources")||"[]")[0].name),'Променен ресурс');
  await page.locator('#btnAddTopic').click();await page.locator('#fName').fill('Нова тема');await page.locator('#mSave').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("teacherHub.topics")||"[]").length),1);
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-qa="export"]').click();const download=await downloadPromise;const path=await download.path();
  await page.locator('[data-del-res]').first().click();await page.locator('#mOk').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("teacherHub.resources")||"[]").length),0);
  await page.locator('[data-nav="settings"]').evaluate(el=>el.click());
  await page.locator('#stImportFile').setInputFiles(path);await page.locator('#mOk').waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("teacherHub.resources")||"[]").length),0);await page.locator('#mCancel').click();
  await page.locator('#stImportFile').setInputFiles([]);await page.locator('#stImportFile').setInputFiles(path);await page.locator('#mOk').click();await page.reload();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("teacherHub.resources")||"[]").length),1);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("teacherHub.topics")||"[]").length),1);
  await page.locator('[data-nav="dashboard"]').evaluate(el=>el.click());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  mkdirSync('work/cabinet',{recursive:true});await page.screenshot({path:`work/cabinet/${url.includes('/downloads/')?'local':'online'}-390.png`,fullPage:true});
  await page.setViewportSize({width:1440,height:960});await page.screenshot({path:`work/cabinet/${url.includes('/downloads/')?'local':'online'}-1440.png`,fullPage:true});
  assert.deepEqual(errors,[]);await context.close();
 }
 const presentation=await browser.newContext({acceptDownloads:true,reducedMotion:'reduce'}),show=await presentation.newPage();
 for(const width of [320,390,768,1440]){
  await show.setViewportSize({width,height:960});
  await show.goto(process.env.DIDO_BROWSER_URL+'/');
  assert.equal(await show.locator('.compact-applications').count(),1);assert.equal(await show.locator('.app-gallery').count(),0);
  await show.locator('.compact-applications h2').click();
  await show.locator('.compact-applications').screenshot({path:`work/cabinet/home-apps-${width}.png`});
  assert.equal(await show.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const nav=show.locator('#main-navigation');
  if(!await nav.isVisible())await show.locator('[aria-controls="main-navigation"]').click();
  await nav.locator('a[href="/prilozheniya/"]').click();await show.waitForURL('**/prilozheniya/');
  assert.equal(await show.locator('.app-card').count(),5);
  assert.deepEqual(await show.locator('.app-gallery h2').allTextContents(),['Дигитални дъски','Финансови инструменти','Лични органайзери','Дигитални кабинети','Фитнес тракери']);
  assert.equal(await show.locator('a.app-card').count(),1);assert.equal(await show.locator('article.app-card').count(),4);
  assert.equal(await show.locator('.app-status').count(),0);assert.equal(await show.locator('.cabinet-action').count(),0);
  assert.ok(await show.locator('article.app-card').evaluateAll(cards=>cards.every(el=>!el.hasAttribute('href')&&!el.hasAttribute('tabindex')&&getComputedStyle(el).cursor!=='pointer')));
  await show.locator('article.app-card').first().hover();
  assert.equal(await show.locator('article.app-card').first().evaluate(el=>getComputedStyle(el).transform),'none');
  await show.locator('.app-gallery img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  assert.ok(await show.locator('.app-art').evaluateAll(items=>items.every(el=>el.clientHeight<=170)));
  await show.locator('.app-gallery').screenshot({path:`work/cabinet/gallery-${width}.png`});
  assert.equal(await show.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await show.locator('a.app-card').focus();await show.keyboard.press('Enter');await show.waitForURL('**/prilozheniya/digitalni-kabineti/');
  assert.equal(await show.locator('.application-card').count(),1);assert.equal(await show.locator('.cabinet-action').count(),2);
  await show.locator('.application-card').screenshot({path:`work/cabinet/category-${width}.png`});
  assert.equal(await show.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const slug of ['digitalni-daski','finansovi-instrumenti','lichni-organayzeri','fitnes-trakeri']){
   await show.goto(process.env.DIDO_BROWSER_URL+'/prilozheniya/'+slug+'/');assert.equal(await show.locator('.empty-state').count(),1);assert.equal(await show.locator('.cabinet-action').count(),0);
  }
  await show.goto(process.env.DIDO_BROWSER_URL+'/tehnologii/');assert.equal(await show.locator('.app-gallery,.cabinet-action').count(),0);assert.ok(await show.locator('.category-posts a').count()>0);
  await show.goto(process.env.DIDO_BROWSER_URL+'/prilozheniya/digitalni-kabineti/');
 }
 await show.locator('.cabinet-action.online').hover();
 assert.equal(await show.locator('.online .boot').evaluate(el=>getComputedStyle(el).animationName),'none');
 await show.emulateMedia({reducedMotion:'no-preference'});
 await show.locator('.cabinet-action.online').hover();
 assert.notEqual(await show.locator('.online .boot').evaluate(el=>getComputedStyle(el).animationName),'none');
 await show.locator('.cabinet-action.download').hover();
 assert.notEqual(await show.locator('.download .arrow').evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.ok(await show.locator('.cabinet-action').evaluateAll(links=>links.every(el=>el.getBoundingClientRect().height>=44)));
 const getting=show.waitForEvent('download');await show.locator('.cabinet-action.download').click();const downloaded=await getting;
 assert.equal(readFileSync(await downloaded.path(),'utf8'),readFileSync('public/downloads/digitalen-kabinet.html','utf8'));
 await show.locator('.cabinet-action.online').focus();await show.keyboard.press('Enter');await show.waitForURL('**/tehnologii/digitalen-kabinet/');
 await presentation.close();
 const context=await browser.newContext(),page=await context.newPage();await page.goto(process.env.DIDO_BROWSER_URL+'/tehnologii/digitalen-kabinet/');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("teacherHub.resources")||"[]").length),0);
 await page.evaluate(()=>localStorage.setItem('teacherHub.resources','broken original'));await page.reload();assert.equal(await page.evaluate(()=>localStorage.getItem('teacherHub.resources')),'broken original');await page.locator('#btnAddResource').click();await page.locator('#fName').fill('Must not overwrite');await page.locator('#mSave').click();assert.equal(await page.evaluate(()=>localStorage.getItem('teacherHub.resources')),'broken original');await context.close();
 }finally{await browser.close();}
});
