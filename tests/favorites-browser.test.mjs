import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FAVORITES_KEY} from '../src/lib/favorites.mjs';
const enabled=process.env.DIDO_BROWSER_MODULE && process.env.DIDO_BROWSER_URL,base=process.env.DIDO_BROWSER_URL;
const options={executablePath:'/usr/bin/chromium',args:['--no-sandbox']};
const playwright=()=>createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE);
const post='/posts/2026-11-06-moyata-purva-probna-publikaciya/';
const route='/byagane/marshruti/pleven-half-2026/';
const race='/byagane/sastezaniya/kaylakamarathon2026/';
const app='/tehnologii/digitalen-kabinet/';
const snapshot='work/favorites-preview';
const bookmark=(page,url)=>page.locator(`button[data-favorite-url="${url}"]`).first();
async function readyList(page,count){await page.waitForFunction(count=>document.querySelectorAll('#favorite-list .favorite-open').length===count,count);}

test('favorites: real materials, keyboard/touch, category filter, current index sharing, cross-tab updates and responsive views',{skip:!enabled,timeout:120000},async()=>{
 const browser=await playwright().chromium.launch(options);mkdirSync(snapshot,{recursive:true});
 try{
  for(const width of [320,390,768,961,1440]){
   const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<600,isMobile:width<600}),page=await context.newPage();
   let requests=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/search-index.json')requests++;});
   await page.goto(base+'/');assert.equal(requests,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(width>960){
    const rects=await page.evaluate(()=>({brand:document.querySelector('.site-header .brand').getBoundingClientRect().toJSON(),nav:document.querySelector('.navigation').getBoundingClientRect().toJSON()}));assert.ok(rects.brand.right<=rects.nav.left);assert.ok(rects.nav.right<=width);
    if(width===1440)await page.locator('.site-header').screenshot({path:`${snapshot}/header-1440.png`});
   }
   if(![390,1440].includes(width)){await page.goto(base+'/lyubimi/');await page.locator('[data-favorites-empty]').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await context.close();continue;}
   await page.goto(base+post);const button=bookmark(page,post);await button.waitFor({state:'visible'});assert.equal(await button.getAttribute('aria-pressed'),'false');
   await button.focus();await page.keyboard.press('Space');assert.equal(await button.getAttribute('aria-pressed'),'true');assert.match(await button.getAttribute('aria-label'),/Премахни от любими.*Моята първа/);
   // Dynamically archived cards must inherit the same saved state.
   await button.evaluate(button=>{const clone=button.cloneNode(true);clone.hidden=true;clone.dataset.favoriteClone='yes';clone.setAttribute('aria-pressed','false');button.after(clone);});
   await page.locator('[data-favorite-clone]').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('[data-favorite-clone]').getAttribute('aria-pressed')==='true');
   await page.locator('[data-favorite-clone]').click();assert.equal(await button.getAttribute('aria-pressed'),'false');await button.click();
   await page.reload();assert.equal(await bookmark(page,post).getAttribute('aria-pressed'),'true');await page.locator('.article-header').screenshot({path:`${snapshot}/bookmark-${width}.png`});
   for(const [path,url] of [[route,route],[race,race],['/prilozheniya/digitalni-kabineti/',app]]){await page.goto(base+path);await bookmark(page,url).click();assert.equal(await bookmark(page,url).getAttribute('aria-pressed'),'true');}
   assert.equal(requests,0,'saving materials does not eagerly download the search index');
   assert.equal(await page.locator('.cabinet-action.online').getAttribute('href'),app);assert.equal(await page.locator('.cabinet-action.download').getAttribute('href'),'/downloads/digitalen-kabinet.html');
   if(width<961)await page.locator('.menu-toggle').tap();await page.locator('.favorite-nav').click();await page.waitForURL('**/lyubimi/');await readyList(page,4);
   assert.equal(requests,1);assert.equal(await page.locator('#favorite-list h2').count(),4);assert.ok(await page.locator('[data-favorites-filter]').isVisible());
   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),FAVORITES_KEY);assert.deepEqual(Object.keys(saved),['version','urls']);assert.equal(saved.urls.length,4);assert.ok(!JSON.stringify(saved).includes('Маратон'));
   await page.locator('[data-favorites-filter]').selectOption('Маршрут');assert.equal(await page.locator('#favorite-list h2').count(),1);assert.match(await page.locator('#favorite-list h2').textContent(),/Плевенски полумаратон/);
   await page.locator('[data-favorites-filter]').selectOption('all');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:`${snapshot}/favorites-${width}.png`,fullPage:true});
   await page.keyboard.press('Control+k');await page.locator('#search-query').fill('Кайлъка');await page.waitForSelector('#search-results a');assert.equal(requests,1,'search reuses the same loaded public index');await page.keyboard.press('Escape');
   await page.locator(`#favorite-list a[href="${route}"]`).click();await page.waitForURL('**'+route);assert.match(await page.locator('h1').textContent(),/Плевенски/);
   await page.goto(base+'/lyubimi/');await readyList(page,4);const remove=page.locator(`[data-favorite-remove="${route}"]`);await remove.focus();await page.keyboard.press('Enter');await readyList(page,3);
   assert.equal(await page.locator('[data-favorites-filter-wrap]').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-favorite-remove')),true);
   const second=await context.newPage();await second.goto(base+'/lyubimi/');await readyList(second,3);
   await second.locator(`[data-favorite-remove="${post}"]`).focus();
   await page.locator(`[data-favorite-remove="${app}"]`).click();await readyList(second,2);assert.equal(await second.evaluate(()=>document.activeElement.dataset.favoriteRemove),post);await second.close();
   while(await page.locator('[data-favorite-remove]').count())await page.locator('[data-favorite-remove]').first().click();
   await page.locator('[data-favorites-empty]').waitFor({state:'visible'});assert.equal(await page.locator('#favorite-list a').count(),0);
   await page.screenshot({path:`${snapshot}/empty-${width}.png`,fullPage:true});await context.close();
  }
 }finally{await browser.close();}
});

test('favorites: blocked storage and quota failures remain usable and clearly temporary',{skip:!enabled,timeout:60000},async()=>{
 const browser=await playwright().chromium.launch(options);
 try{
  const page=await browser.newPage({viewport:{width:390,height:900}});
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}}));
  await page.goto(base+post);await bookmark(page,post).click();assert.equal(await bookmark(page,post).getAttribute('aria-pressed'),'true');assert.match(await page.locator('#favorite-feedback').textContent(),/временни до презареждане/);
  await bookmark(page,post).click();assert.equal(await bookmark(page,post).getAttribute('aria-pressed'),'false');
  await page.goto(base+'/lyubimi/');await page.locator('[data-favorites-storage]').waitFor({state:'visible'});assert.match(await page.locator('[data-favorites-storage]').textContent(),/не позволява постоянен запис/);assert.ok(await page.locator('[data-favorites-empty]').isVisible());await page.close();
  const quota=await browser.newPage();await quota.addInitScript(key=>{
   localStorage.setItem('cabinet-existing-data','KEEP');const original=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('Full','QuotaExceededError');return original.call(this,name,value);};
  },FAVORITES_KEY);
  await quota.goto(base+post);await bookmark(quota,post).click();assert.equal(await bookmark(quota,post).getAttribute('aria-pressed'),'true');await bookmark(quota,post).click();assert.equal(await bookmark(quota,post).getAttribute('aria-pressed'),'false');
  assert.equal(await quota.evaluate(()=>localStorage.getItem('cabinet-existing-data')),'KEEP');assert.match(await quota.locator('#favorite-feedback').textContent(),/временни/);await quota.close();
 }finally{await browser.close();}
});

test('favorites: untrusted local data, renamed/hidden materials and catalog failure never create unsafe links',{skip:!enabled,timeout:60000},async()=>{
 const browser=await playwright().chromium.launch(options);
 try{
  const page=await browser.newPage();await page.goto(base+'/');
  await page.evaluate(({key,post})=>localStorage.setItem(key,JSON.stringify({version:1,urls:[post,'/posts/private-draft/','javascript:alert(1)','//evil.test/'],title:'<img src=x onerror="window.favoriteXss=1">',description:'PRIVATE_STALE_TITLE'})),{key:FAVORITES_KEY,post});
  await page.goto(base+'/lyubimi/');await readyList(page,1);assert.equal(await page.locator('#favorite-list h2').count(),2);assert.match(await page.locator('#favorite-list').textContent(),/Материалът вече не е наличен/);assert.doesNotMatch(await page.locator('#favorite-list').textContent(),/PRIVATE_STALE_TITLE|onerror/);assert.equal(await page.locator('#favorite-list img, #favorite-list script').count(),0);assert.equal(await page.evaluate(()=>window.favoriteXss),undefined);
  const response=await page.request.get(base+'/search-index.json'),payload=await response.json();let mode='renamed';
  await page.route('**/search-index.json',async request=>{
   if(mode==='failure')return request.fulfill({status:503,body:'Unavailable'});
   const documents=payload.documents.flatMap(doc=>doc.url===post?(mode==='hidden'?[]:[{...doc,title:'Актуално заглавие след CMS'}]):[doc]);return request.fulfill({json:{...payload,documents}});
  });
  await page.reload();await readyList(page,1);assert.match(await page.locator('#favorite-list h2').first().textContent(),/Актуално заглавие след CMS/);
  mode='hidden';await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#favorite-list h2').length===2 && document.querySelector('#favorite-list h2').textContent.includes('вече не е наличен'));assert.equal(await page.locator('#favorite-list a').count(),0);
  mode='failure';await page.reload();await page.locator('[data-favorites-retry]').waitFor({state:'visible'});assert.equal(await page.locator('#favorite-list a').count(),0);assert.match(await page.locator('#favorite-list h2').first().textContent(),/Запазен материал/);
  mode='renamed';await page.locator('[data-favorites-retry]').click();await readyList(page,1);assert.match(await page.locator('#favorite-list h2').first().textContent(),/Актуално заглавие/);await page.close();
 }finally{await browser.close();}
});

test('favorites survive closing and reopening Chromium with the same browser profile',{skip:!enabled,timeout:60000},async()=>{
 const folder=mkdtempSync(join(tmpdir(),'dido-favorite-profile-'));let context;
 try{
  context=await playwright().chromium.launchPersistentContext(folder,options);let page=await context.newPage();await page.goto(base+post);await bookmark(page,post).click();await context.close();context=undefined;
  context=await playwright().chromium.launchPersistentContext(folder,options);page=await context.newPage();await page.goto(base+'/lyubimi/');await readyList(page,1);assert.match(await page.locator('#favorite-list h2').textContent(),/Моята първа пробна публикация/);await page.locator('[data-favorite-remove]').click();assert.ok(await page.locator('[data-favorites-empty]').isVisible());
 }finally{await context?.close();rmSync(folder,{recursive:true,force:true});}
});
