import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {loopGpx} from './helpers/lab-map-fixtures.mjs';
import {importWorkout} from '../src/lib/running-lab/import.mjs';
import {analyzeActivity} from '../src/lib/running-lab/analyze.mjs';
const enabled=!!(process.env.DIDO_BROWSER_MODULE&&process.env.DIDO_BROWSER_URL),base=process.env.DIDO_BROWSER_URL;
const idle=page=>page.locator('[data-lab-job]').waitFor({state:'hidden',timeout:90000});
const action=async(page,name)=>{await page.locator(`[data-action="${name}"]`).first().click();await idle(page);};
const shots=process.env.DIDO_LAB_MAP_SCREENSHOTS||'work/lab-map-shots';
const fixture=options=>({name:'Синтетичен маршрут за карта.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(loopGpx(options))});
// All automated tests intercept tiles: no headless bot pans/zooms OSM servers.
// This deliberately labelled background tests real Leaflet rendering, not OSM's
// availability or the cartographic accuracy of these invented streets.
const tile='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e6e8df"/><path d="M0 0H93V103H0Z M153 153H256V256H153Z" fill="#c3d8b4"/><path d="M-10 30L266 230M33 -10L221 266M0 128H256" stroke="#bac1bf" stroke-width="16"/><path d="M-10 30L266 230M33 -10L221 266M0 128H256" stroke="#fff" stroke-width="11"/><text x="10" y="22" fill="#476154" font-family="sans-serif" font-size="11">ТЕСТОВ ФОН · НЕ OSM</text></svg>';
async function launch(options={}){
 const {chromium}=createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE),browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'reduce',...options}),page=await context.newPage();
 const traffic=[],tiles=[],errors=[],held=[];let mode='ok';page.on('pageerror',e=>errors.push(e.message));context.on('request',r=>traffic.push({url:r.url(),method:r.method(),body:r.postData(),headers:r.headers()}));
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin===base)return route.continue();
  if(url.hostname==='tile.openstreetmap.org'){tiles.push(route.request().url());if(mode==='blocked')return route.abort();if(mode==='slow'){held.push(route);return;}return route.fulfill({status:200,contentType:'image/svg+xml',body:tile,headers:{'cache-control':'public,max-age=604800'}});}
  return route.abort();
 });
 await page.goto(base+'/byagane/running-lab/');await page.locator('[data-lab-records] tbody tr').first().waitFor({state:'attached'});
 return {browser,context,page,traffic,tiles,errors,mode:value=>mode=value,release:async()=>{for(const route of held.splice(0))await route.abort().catch(()=>{});}};
}
async function upload(page,options){await page.locator('[data-tab="import"]').click();if(await page.locator('[data-lab-previews] article').count())page.once('dialog',dialog=>dialog.accept());await page.locator('[data-lab-files]').setInputFiles(fixture(options));await idle(page);await action(page,'open-preview');}
async function enableMap(page){await page.locator('[data-map-mode="street"]').click();await page.locator('[data-map-accept]').click();}
const mapNode=page=>page.locator('[data-street-map]');
async function readyMap(page){await page.locator('[data-street-map][data-map-ready="ready"]').waitFor();}
async function zoom(page){return Number(await mapNode(page).getAttribute('data-zoom'));}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
async function summary(page){const pending=page.waitForEvent('download');await action(page,'summary');return JSON.parse(readFileSync(await(await pending).path(),'utf8'));}
async function pointPosition(page,p){return page.locator('[data-street-map]').evaluate((node,p)=>{
 const z=Number(node.dataset.zoom),[lat,lon]=node.dataset.mapCenter.split(',').map(Number),size=256*2**z,world=(lat,lon)=>({x:(lon+180)/360*size,y:(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*size}),center=world(lat,lon),point=world(p.lat,p.lon),box=node.getBoundingClientRect();
 return {x:box.x+box.width/2+point.x-center.x,y:box.y+box.height/2+point.y-center.y};
},p);}
async function screenshot(page,width){
 await page.locator('.lab-map-card').evaluate(node=>{if(!node.querySelector('[data-test-background]')){const note=document.createElement('p');note.dataset.testBackground='';note.textContent='АВТОМАТИЧЕН ТЕСТ · СИНТЕТИЧНИ GPS ДАННИ И ТЕСТОВ ФОН, НЕ OSM';note.style.color='#ffd091';node.prepend(note);}});
 await page.evaluate(()=>document.activeElement?.blur());mkdirSync(shots,{recursive:true});await page.locator('.lab-map-card').screenshot({path:`${shots}/map-${width}-test-tiles.png`,style:'.skip-link:not(:focus){visibility:hidden!important}'});
}

test('Lab map: consent, measured local picks, lazy local Leaflet, desktop wheel/pan/zoom/fit and colour/range controls',{skip:!enabled,timeout:180000},async()=>{
 const t=await launch(),{page}=t;
 try{
  await upload(page,{laps:1,lapDistance:4000});assert.equal(t.tiles.length,0);assert.equal(t.traffic.filter(r=>/street-map\.[\w-]+\.js/.test(r.url)).length,0);
  await page.locator('[data-local-map]').scrollIntoViewIfNeeded();
  const localTarget=await page.locator('[data-route-colour="single"]').evaluate(path=>{const p=path.getPointAtLength(path.getTotalLength()*.333),s=p.matrixTransform(path.ownerSVGElement.getScreenCTM());return {x:s.x,y:s.y};});
  await page.mouse.click(localTarget.x,localTarget.y);await idle(page);await page.waitForFunction(()=>document.querySelector('[data-map-point]').textContent.includes('най-близка измерена'));assert.equal(t.tiles.length,0);
  await page.locator('[data-map-mode="street"]').click();assert.equal(await page.locator('[data-map-consent]').isVisible(),true);assert.equal(t.tiles.length,0);assert.equal(await page.locator('.leaflet-container').count(),0);
  await page.locator('[data-map-accept]').click();await readyMap(page);assert.ok(t.tiles.length>0);assert.equal(await page.locator('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]').isVisible(),true);
  const map=mapNode(page);await map.scrollIntoViewIfNeeded();let box=await map.boundingBox(),before=await zoom(page);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-120);await page.waitForTimeout(250);assert.equal(await zoom(page),before,'wheel must not hijack ordinary page scrolling');
  await page.locator('[data-map-wheel]').click();await map.scrollIntoViewIfNeeded();box=await map.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-160);await page.waitForFunction(previous=>Number(document.querySelector('[data-street-map]').dataset.zoom)>previous,before);assert.equal(await map.getAttribute('data-wheel'),'true');
  await page.mouse.move(0,0);assert.equal(await map.getAttribute('data-wheel'),'false');before=await zoom(page);await page.locator('.leaflet-control-zoom-in').click();assert.equal(await zoom(page),before+1);await page.locator('.leaflet-control-zoom-out').click();assert.equal(await zoom(page),before);
  await map.scrollIntoViewIfNeeded();box=await map.boundingBox();const oldCenter=await map.getAttribute('data-map-center');await page.mouse.move(box.x+box.width*.5,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.5+65,box.y+box.height*.6+25,{steps:8});await page.mouse.up();assert.notEqual(await map.getAttribute('data-map-center'),oldCenter);
  before=await zoom(page);await page.mouse.dblclick(box.x+box.width*.6,box.y+box.height*.5);await page.waitForFunction(previous=>Number(document.querySelector('[data-street-map]').dataset.zoom)>previous,before);assert.equal(await page.locator('[data-map-passages]').isVisible(),false);await page.locator('[data-map-fit]').click();await readyMap(page);
  const baseline=await summary(page),id=await map.evaluate(node=>node._leaflet_id),count=t.tiles.length;
  for(const mode of ['pace','grade','hr','single']){await page.locator('[data-map-colour]').selectOption(mode);await noOverflow(page);}
  await page.locator('[data-lab-axis]').selectOption('time');assert.equal(await map.evaluate(node=>node._leaflet_id),id);assert.equal(t.tiles.length,count,'graph controls do not recreate the map or refresh tiles');
  await page.locator('[data-lab-range-start]').fill('1');await page.locator('[data-lab-range-end]').fill('2');await action(page,'zoom');assert.ok((await page.locator('[data-route-selection]').getAttribute('d')).length>0);assert.deepEqual((await summary(page)).stats,baseline.stats);
  await page.locator('[data-map-mode="local"]').click();assert.equal(await page.locator('.leaflet-container').count(),0);const stopped=t.tiles.length;await page.waitForTimeout(150);assert.equal(t.tiles.length,stopped);assert.equal(await page.locator('[data-local-map]').isVisible(),true);
  assert.ok(t.tiles.every(url=>/^https:\/\/tile\.openstreetmap\.org\/(?:[2-9]|1\d)\/\d+\/\d+\.png$/.test(url)));
  const requests=t.traffic.filter(r=>new URL(r.url).hostname==='tile.openstreetmap.org');assert.ok(requests.every(r=>r.method==='GET'&&!r.body&&r.headers.referer===base+'/'));
  await page.reload();assert.equal(await page.locator('[data-map-mode="local"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.leaflet-container').count(),0);assert.deepEqual(t.errors,[]);
 }finally{await t.browser.close();}
});

test('Lab map: 21 km repeated visits, explicit passage choice, real touch pinch, manual finish, 5–10 km and offline fallback',{skip:!enabled,timeout:180000},async()=>{
 const t=await launch({viewport:{width:390,height:1000},hasTouch:true}),{page}=t,a=analyzeActivity((await importWorkout(new TextEncoder().encode(loopGpx()),'map.gpx'))[0]);
 try{
  await upload(page,{});const baseline=await summary(page);await enableMap(page);await readyMap(page);const map=mapNode(page);await map.scrollIntoViewIfNeeded();let box=await map.boundingBox();const cdp=await t.context.newCDPSession(page),before=await zoom(page),cx=box.x+box.width/2,cy=box.y+box.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-35,y:cy-10,id:1},{x:cx+35,y:cy+10,id:2}]});
  for(const delta of [45,60,80])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-delta,y:cy-20,id:1},{x:cx+delta,y:cy+20,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(previous=>Number(document.querySelector('[data-street-map]').dataset.zoom)>previous,before);await page.locator('[data-map-fit]').click();
  await map.scrollIntoViewIfNeeded();const position=await pointPosition(page,a.points[180]),old=await map.getAttribute('data-cursor-time');await page.touchscreen.tap(position.x,position.y);await page.locator('[data-map-candidate]').first().waitFor();assert.equal(await map.getAttribute('data-cursor-time'),old,'overlaps do not silently select an arbitrary visit');
  const indices=await page.locator('[data-map-candidate]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.mapCandidate)));assert.ok(indices.some(i=>i<720)&&indices.some(i=>i>720));const chosen=indices.find(i=>i>720),expected=a.points[chosen];await page.locator(`[data-map-candidate="${chosen}"]`).click();assert.equal(Number(await map.getAttribute('data-cursor-time')),expected.t);assert.equal(Number(await map.getAttribute('data-cursor-distance')),expected.d);assert.match(await page.locator('[data-map-point]').textContent(),/Избрано преминаване 2/);
  const cursors=await page.locator('[data-lab-charts] .lab-cursor-line').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('x1')));assert.equal(new Set(cursors).size,1);
  await page.locator('[data-map-finish]').click();await idle(page);assert.equal(await page.locator('[data-street-marker="finish"]').count(),1);assert.equal(await page.locator('[data-route-finish]').count(),1);assert.deepEqual((await summary(page)).stats,baseline.stats);assert.deepEqual((await summary(page)).records,baseline.records);
  await page.locator('[data-lab-range-start]').fill('5');await page.locator('[data-lab-range-end]').fill('10');await action(page,'zoom');assert.ok((await page.locator('[data-route-selection]').getAttribute('d')).length>0);await page.locator('[data-map-colour]').selectOption('grade');assert.match(await page.locator('.lab-route-colour-legend').textContent(),/Спускане.*Равно.*Изкачване/);await noOverflow(page);await screenshot(page,390);
  await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(250);await noOverflow(page);await screenshot(page,1440);
  await page.addStyleTag({content:'html{font-size:200%!important}'});await page.setViewportSize({width:390,height:1000});await page.waitForTimeout(250);await noOverflow(page);await page.addStyleTag({content:'html{font-size:100%!important}'});
  await action(page,'reset-zoom');await page.locator('[data-map-clear-finish]').click();await idle(page);assert.equal(await page.locator('[data-street-marker="finish"]').count(),0);assert.equal(await page.locator('[data-street-marker="end"]').count(),1);
  await t.context.setOffline(true);await page.locator('[data-local-map]').waitFor({state:'visible'});assert.equal(await page.locator('.leaflet-container').count(),0);assert.match(await page.locator('[data-map-status]').textContent(),/Няма интернет/);await page.locator('[data-chart-key="pace"] svg').focus();await page.keyboard.press('End');assert.match(await page.locator('[data-map-point]').textContent(),/км/);assert.deepEqual(t.errors,[]);
 }finally{await t.browser.close();}
});

test('Lab map: blocked and slow tiles, cancelled consent, missing sensors and no external requests on a new activity',{skip:!enabled,timeout:180000},async()=>{
 const t=await launch(),{page}=t;
 try{
  await upload(page,{laps:1,lapDistance:3000,heights:false,heart:false,times:false});for(const mode of ['pace','hr','grade'])assert.equal(await page.locator(`[data-map-colour] option[value="${mode}"]`).evaluate(n=>n.disabled),true);
  assert.equal(await page.locator('[data-map-finish]').isDisabled(),true);await page.locator('[data-map-mode="street"]').click();await page.locator('[data-map-mode="local"]').click();assert.equal(t.tiles.length,0);
  t.mode('blocked');await enableMap(page);await page.waitForFunction(()=>document.querySelector('[data-map-status]').textContent.includes('блокирана'));assert.equal(await page.locator('[data-local-map]').isVisible(),true);assert.equal(await page.locator('.leaflet-container').count(),0);const failed=t.tiles.length;await page.waitForTimeout(200);assert.equal(t.tiles.length,failed,'there is no automatic retry or other provider');
  await page.clock.install();t.mode('slow');await enableMap(page);await page.locator('[data-street-map][data-map-ready="loading"]').waitFor();await page.clock.fastForward(13000);await page.locator('[data-local-map]').waitFor({state:'visible'});assert.match(await page.locator('[data-map-status]').textContent(),/забави|недостъпен/);await t.release();await page.clock.resume();
  t.mode('ok');await enableMap(page);await readyMap(page);const count=t.tiles.length;
  await upload(page,{laps:1,lapDistance:4000});assert.equal(await page.locator('.leaflet-container').count(),0);assert.equal(await page.locator('[data-map-mode="local"]').getAttribute('aria-pressed'),'true');await page.waitForTimeout(150);assert.equal(t.tiles.length,count,'new GPS regions need a new explicit choice');
  assert.ok(t.traffic.filter(r=>new URL(r.url).origin!==base).every(r=>new URL(r.url).hostname==='tile.openstreetmap.org'||/cloudflareinsights\.com/.test(r.url)));assert.ok(t.traffic.every(r=>r.method==='GET'&&!r.body));assert.deepEqual(t.errors,[]);
 }finally{await t.browser.close();}
});
