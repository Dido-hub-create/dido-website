import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const enabled = process.env.DIDO_BROWSER_MODULE && process.env.DIDO_BROWSER_URL;
test('lightbox zoom, keyboard, wheel, drag, pinch, reset and video thumbnail controls', {skip:!enabled,timeout:90000}, async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE);
 const browser=await chromium.launch({executablePath:process.env.DIDO_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({hasTouch:true});const page=await context.newPage();
 const origin=process.env.DIDO_BROWSER_URL;mkdirSync('work/final-visuals',{recursive:true});
 await page.route('**/*youtube*/**',route=>route.fulfill({body:'Test player',contentType:'text/html'}));
 const level=()=>page.locator('[data-zoom-level]').textContent();
 try {
 await page.goto(origin+'/galeria/');const album=await page.locator('.album-card').first().getAttribute('href');assert.ok(album);
 for(const width of [320,390,768,1440]){
 await page.setViewportSize({width,height:960});await page.goto(origin+album);
 await page.locator('[data-gallery-photo]').first().click();await page.locator('.lightbox-photo').evaluate(img=>img.decode());
 await page.locator('[data-zoom-in]').click();assert.equal(await level(),'1.5×');
 await page.keyboard.press('+');assert.equal(await level(),'2.0×');
 await page.keyboard.press('-');assert.equal(await level(),'1.5×');
 await page.locator('[data-zoom-out]').click();assert.equal(await level(),'1.0×');
 await page.locator('[data-fit]').click();assert.equal(await level(),'1.0×');
 const box=await page.locator('.lightbox-stage').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.wheel(0,-400);await page.waitForTimeout(80);assert.ok(parseFloat(await level())>1);
 await page.locator('[data-fit]').click();await page.mouse.dblclick(x,y);assert.equal(await level(),'2.0×');
 const before=await page.locator('.lightbox-photo').getAttribute('style');
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+50,y+50,{steps:5});await page.mouse.up();
 assert.notEqual(await page.locator('.lightbox-photo').getAttribute('style'),before);
 await page.screenshot({path:`work/final-visuals/lightbox-${width}.png`});
 await page.keyboard.press('ArrowRight');assert.equal(await level(),'1.0×');assert.match(await page.locator('[data-counter]').textContent(),/^2 \/ /);
 await page.keyboard.press('ArrowLeft');assert.match(await page.locator('[data-counter]').textContent(),/^1 \/ /);
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').isVisible(),false);
 assert.equal(await page.locator('[data-gallery-photo]').first().evaluate(el=>el===document.activeElement),true);
 await page.goto(origin+'/byagane/');await page.locator('.records').scrollIntoViewIfNeeded();await page.locator('.records').screenshot({path:`work/final-visuals/records-${width}.png`});
 const video=page.locator('[data-video-card]').first();const title=video.locator('h3 a');assert.match(await title.getAttribute('href'),/^https:\/\/www.youtube.com\/watch\?v=/);
 assert.equal(await video.locator('.video-play').innerText(),'');await video.scrollIntoViewIfNeeded();await video.screenshot({path:`work/final-visuals/video-${width}.png`});
 await video.locator('.video-screen').click({position:{x:10,y:10}});assert.match(await video.locator('iframe').getAttribute('src'),/youtube-nocookie.com\/embed\//);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.goto(origin+'/');await page.screenshot({path:`work/final-visuals/home-${width}.png`});
 assert.equal(await page.locator('.skip-link').evaluate(el=>el.getBoundingClientRect().bottom<0),true);
 await page.keyboard.press('Tab');assert.equal(await page.locator('.skip-link').evaluate(el=>el===document.activeElement),true);
 }
 await page.setViewportSize({width:390,height:900});await page.goto(origin+album);await page.locator('[data-gallery-photo]').first().tap();await page.locator('.lightbox-photo').evaluate(img=>img.decode());
 const box=await page.locator('.lightbox-stage').boundingBox(),x=195,y=box.y+box.height/2;
 const cdp=await context.newCDPSession(page);
 const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y}))});
 await touch('touchStart',[[0,x-30,y],[1,x+30,y]]);await touch('touchMove',[[0,x-90,y],[1,x+90,y]]);await touch('touchEnd',[]);await page.waitForTimeout(150);assert.ok(parseFloat(await level())>=2);
 const touchBefore=await page.locator('.lightbox-photo').getAttribute('style');
 await touch('touchStart',[[0,195,y]]);await touch('touchMove',[[0,215,y+30]]);await touch('touchEnd',[]);await page.waitForTimeout(150);assert.notEqual(await page.locator('.lightbox-photo').getAttribute('style'),touchBefore);
 await page.locator('[data-fit]').tap();await page.waitForFunction(()=>document.querySelector('[data-zoom-level]').textContent==='1.0×');
 await touch('touchStart',[[0,280,y]]);await touch('touchMove',[[0,80,y]]);await touch('touchEnd',[]);await page.waitForTimeout(150);assert.match(await page.locator('[data-counter]').textContent(),/^2 \/ /);
 await page.locator('[data-close]').tap();await page.locator('dialog').waitFor({state:'hidden'});
 }finally{await browser.close();}
});
