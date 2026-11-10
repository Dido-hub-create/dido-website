import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const enabled=process.env.DIDO_BROWSER_MODULE && process.env.DIDO_BROWSER_URL;
const base=process.env.DIDO_BROWSER_URL;
const screenshotRoot='work/search-preview';
async function launch(){
 const {chromium}=createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE);
 return chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
}
async function waitResults(page){await page.waitForFunction(()=>document.querySelectorAll('#search-results a').length>0);}

test('search loads lazily, works with Cyrillic/Latin, keyboard and touch, and keeps responsive header intact',{skip:!enabled,timeout:120000},async()=>{
 const browser=await launch();mkdirSync(screenshotRoot,{recursive:true});
 try{
  for(const width of [320,390,768,961,1440]){
   const page=await browser.newPage({viewport:{width,height:960},isMobile:width<600,hasTouch:width<600});
   let indexRequests=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/search-index.json')indexRequests++;});
   await page.goto(base+'/');await page.locator('[data-search-open]').waitFor({state:'attached'});
   assert.equal(indexRequests,0,'no index request on ordinary page load');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(width>960){
    const boxes=await page.evaluate(()=>({brand:document.querySelector('.site-header .brand').getBoundingClientRect().toJSON(),nav:document.querySelector('#main-navigation').getBoundingClientRect().toJSON()}));
    assert.ok(boxes.brand.right<=boxes.nav.left);assert.ok(boxes.nav.right<=width,`${width}: header overflow`);
    if(width===1440)await page.locator('.site-header').screenshot({path:`${screenshotRoot}/header-${width}.png`});
    await page.locator('[data-search-open]').click();
   }else{
    if(width<600){await page.locator('.menu-toggle').tap();await page.locator('[data-search-open]').tap();}
    else{await page.locator('.menu-toggle').click();await page.locator('[data-search-open]').click();}
    assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
   }
   assert.ok(await page.locator('#site-search').isVisible());assert.equal(await page.locator('#search-query').evaluate(el=>el===document.activeElement),true);
   await page.waitForFunction(()=>document.querySelector('#search-status').textContent.includes('Напиши'));
   assert.equal(indexRequests,1);assert.equal(await page.locator('#search-results a').count(),0);
   await page.locator('#search-query').fill('Кайлъка');await waitResults(page);
   const cyrillic=await page.locator('#search-results a').evaluateAll(links=>links.map(a=>a.getAttribute('href')));
   assert.ok(cyrillic.includes('/byagane/marshruti/kaylaka-21km-2026/'));
   await page.locator('#search-query').fill('Kaylaka');assert.deepEqual(await page.locator('#search-results a').evaluateAll(links=>links.map(a=>a.getAttribute('href'))),cyrillic);
   await page.locator('#search-query').fill('  ! ');assert.equal(await page.locator('#search-results a').count(),0);
   await page.locator('#search-query').fill('Несъществуващожираф');assert.match(await page.locator('#search-status').textContent(),/Няма резултати/);
   await page.locator('#search-query').fill('Кайлъка');await waitResults(page);
   const box=await page.locator('#site-search').boundingBox();assert.ok(box.x>=0 && box.x+box.width<=width && box.y>=0 && box.y+box.height<=960,`${width}: modal outside viewport`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if([390,1440].includes(width))await page.screenshot({path:`${screenshotRoot}/search-${width}.png`});
   await page.keyboard.press('Escape');assert.equal(await page.locator('#site-search').isVisible(),false);
   await page.waitForFunction(()=>document.activeElement===document.querySelector(innerWidth<=960?'.menu-toggle':'[data-search-open]'));
   await page.keyboard.press('Control+k');assert.ok(await page.locator('#site-search').isVisible());assert.equal(indexRequests,1,'reuse index on reopening');
   await page.locator('#search-query').fill('кабинет');await waitResults(page);
   if([390,1440].includes(width))await page.screenshot({path:`${screenshotRoot}/applications-${width}.png`});
   // Tab stays within the modal, including after the last result link.
   for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('#site-search').contains(document.activeElement)),true);}
   await page.locator('#search-query').focus();await page.locator('#search-query').fill('Кайлъка');
   await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#search-results a').first().evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#search-results a').nth(1).evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#search-results a').first().evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press('Enter');await page.waitForURL('**/byagane/sastezaniya/kaylakamarathon2026/');
   assert.match(await page.locator('h1').textContent(),/Кайлъка/);
   // Enter in the field selects a real app, while direct touch uses the normal anchor.
   await page.keyboard.press('Control+k');await page.locator('#search-query').fill('Дигитален кабинет за учителя');await waitResults(page);
   const app=page.locator('#search-results a[href="/tehnologii/digitalen-kabinet/"]');assert.equal(await app.count(),1);
   if(width===390){await app.tap();await page.waitForURL('**/tehnologii/digitalen-kabinet/');assert.ok(await page.locator('body').textContent());}
   if(width===1440){await page.locator('#search-query').fill('GPX анализатор');await page.keyboard.press('Enter');await page.waitForURL('**/byagane/analiz/');assert.ok(await page.locator('[data-route-analysis]').isVisible());}
   await page.close();
  }
 }finally{await browser.close();}
});

test('search handles fetch failure/retry and treats injected result strings as text',{skip:!enabled,timeout:60000},async()=>{
 const browser=await launch();
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  let attempts=0;
  await page.route('**/search-index.json',route=>{
   if(++attempts===1)return route.fulfill({status:503,body:'Unavailable'});
   return route.fulfill({json:{version:1,documents:[
    {url:'javascript:alert(1)',title:'Injection',type:'Unsafe',description:'Injection',body:''},
    {url:'/za-men/',title:'Injection <img src=x onerror="window.searchXss=1">',type:'<script>Injection</script>',description:'<svg onload="window.searchXss=1">',body:''}
   ]}});
  });
  await page.goto(base+'/');await page.keyboard.press('Control+k');await page.locator('[data-search-retry]').waitFor({state:'visible'});
  assert.match(await page.locator('#search-status').textContent(),/не се зареди/);await page.locator('[data-search-retry]').click();
  await page.locator('#search-query').fill('Injection');await waitResults(page);
  assert.equal(await page.locator('#search-results a').count(),1);assert.match(await page.locator('#search-results').textContent(),/<img/);
  assert.equal(await page.locator('#search-results img, #search-results script, #search-results svg').count(),0);
  assert.equal(await page.evaluate(()=>window.searchXss),undefined);
  await page.keyboard.press('Escape');await page.keyboard.press('Meta+k');assert.ok(await page.locator('#site-search').isVisible());assert.equal(attempts,2);
  await page.close();
  const noJs=await browser.newPage({javaScriptEnabled:false});await noJs.goto(base+'/');assert.equal(await noJs.locator('[data-search-open]').isVisible(),false);await noJs.close();
 }finally{await browser.close();}
});
