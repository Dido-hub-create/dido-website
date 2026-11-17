import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {loopGpx} from './helpers/lab-map-fixtures.mjs';
import {fit} from './helpers/lab-fixtures.mjs';
import {importWorkout} from '../src/lib/running-lab/import.mjs';
import {analyzeActivity} from '../src/lib/running-lab/analyze.mjs';

const enabled=!!(process.env.DIDO_BROWSER_MODULE&&process.env.DIDO_BROWSER_URL),base=process.env.DIDO_BROWSER_URL;
const idle=page=>page.locator('[data-lab-job]').waitFor({state:'hidden',timeout:90000});
const action=async(page,name)=>{await page.locator(`[data-action="${name}"]`).first().click();await idle(page);};
const frame=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function mapSettings(page,open=true){const button=page.locator('[data-map-settings]');if((await button.getAttribute('aria-expanded')==='true')!==open)await button.click();}
const shots=process.env.DIDO_LAB_WORKSPACE_SCREENSHOTS||'work/lab-workspace-shots';
const tile='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e5e8e1"/><path d="M0 80H256M80 0V256M0 256L256 0" stroke="#c5cdd0" stroke-width="20"/><path d="M0 80H256M80 0V256M0 256L256 0" stroke="#fff" stroke-width="12"/><text x="6" y="24" fill="#324f5a" font-family="sans-serif" font-size="11">ТЕСТОВ ФОН · НЕ OSM</text></svg>';
async function launch(options={}){
 const {chromium}=createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE),browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',...options}),page=await context.newPage(),errors=[],tiles=[];
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base)return route.continue();if(url.hostname==='tile.openstreetmap.org'){tiles.push(url.href);return route.fulfill({contentType:'image/svg+xml',body:tile});}return route.abort();});
 await page.goto(base+'/byagane/running-lab/');await page.locator('[data-lab-records] tbody tr').first().waitFor({state:'attached'});return {browser,context,page,errors,tiles};
}
async function upload(page,options){await page.locator('[data-tab="import"]').click();if(await page.locator('[data-lab-previews] article').count())page.once('dialog',d=>d.accept());await page.locator('[data-lab-files]').setInputFiles({name:'СИНТЕТИЧНА тестова тренировка.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(loopGpx(options))});await idle(page);await action(page,'open-preview');await page.locator('[data-combined-svg]').waitFor({state:'attached'});await frame(page);}
async function street(page){await page.locator('[data-map-mode="street"]').click();if(await page.locator('[data-map-accept]').isVisible())await page.locator('[data-map-accept]').click();await page.locator('[data-street-map][data-map-ready="ready"]').waitFor();}
async function fold(page,selector,open=true){const node=page.locator(selector);if((await node.getAttribute('open')!==null)!==open)await node.locator(':scope > summary').click();}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
async function screenshot(page,name,selector='[data-lab-workspace]'){
 mkdirSync(shots,{recursive:true});await page.evaluate(()=>document.activeElement?.blur());await page.locator(selector).screenshot({path:`${shots}/${name}.png`,style:'.skip-link:not(:focus){visibility:hidden!important}'});
}
async function position(page,p){return page.locator('[data-street-map]').evaluate((node,p)=>{const z=Number(node.dataset.zoom),[lat,lon]=node.dataset.mapCenter.split(',').map(Number),size=256*2**z,project=(lat,lon)=>({x:(lon+180)/360*size,y:(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*size}),center=project(lat,lon),point=project(p.lat,p.lon),box=node.getBoundingClientRect();return {x:box.x+box.width/2+point.x-center.x,y:box.y+box.height/2+point.y-center.y};},p);}

test('Lab workspace: 5/10/21 km, both layouts, all viewport widths, separate units, large text and keyboard controls',{skip:!enabled,timeout:180000},async()=>{
 const t=await launch(),{page}=t;
 try{
  for(const distance of [5000,10000,21000]){
   await upload(page,{laps:1,lapDistance:distance});assert.equal(await page.locator('[data-lab-detail-graphs]').getAttribute('open'),null);assert.equal(await page.locator('[data-lab-charts] svg').count(),0);
   assert.equal(await page.locator('[data-combined-lane="pace"]').count(),1);assert.equal(await page.locator('[data-combined-lane="hr"]').count(),0);
   for(const metric of ['hr','cad'])await page.locator(`[data-combined-metric="${metric}"]`).check();
   const units=await page.locator('[data-combined-lane]').evaluateAll(nodes=>nodes.map(n=>[n.dataset.combinedLane,n.dataset.unit]));assert.deepEqual(units,[['pace','мин/км'],['hr','уд./мин'],['cad','стъпки/мин']]);
   const ranges=await page.locator('[data-combined-lane]').evaluateAll(nodes=>nodes.map(n=>[Number(n.dataset.yMin),Number(n.dataset.yMax)]));assert.ok(ranges.every(([min,max])=>max>min));assert.notDeepEqual(ranges[0],ranges[1]);
   await page.locator('[data-combined-metric="cad"]').uncheck();assert.equal(await page.locator('[data-combined-lane="cad"]').count(),0);assert.equal(await page.locator('[data-combined-lane="hr"]').count(),1);
   for(const width of [320,390,768,1024,1440]){
    await page.setViewportSize({width,height:1000});await page.waitForTimeout(230);await noOverflow(page);
    assert.equal(await page.locator('[data-lab-workspace]').getAttribute('data-effective-layout'),width===1440?'columns':'stacked');
    if(width<1180){const y=await page.locator('[data-lab-workspace]').evaluate(node=>[...node.children].map(n=>n.getBoundingClientRect().top));assert.ok(y[0]<y[1]&&y[1]<y[2],'phone order is map, point, graph');}
   }
   await page.locator('[data-lab-layout]').selectOption('stacked');await frame(page);assert.equal(await page.locator('[data-lab-workspace]').getAttribute('data-effective-layout'),'stacked');
   if(distance===21000)await screenshot(page,'desktop-stacked-1440');
   await page.locator('[data-lab-layout]').selectOption('columns');await frame(page);
  }
  await street(page);const map=page.locator('[data-street-map]'),id=await map.evaluate(n=>n._leaflet_id);
  await page.setViewportSize({width:1440,height:900});await page.locator('[data-lab-workspace]').evaluate(n=>n.scrollIntoView({block:'start'}));await frame(page);
  const visible=await page.locator('[data-lab-workspace]').evaluate(node=>['[data-street-map]','[data-map-point]','[data-combined-svg]'].map(s=>{const r=node.querySelector(s).getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));assert.deepEqual(visible,[true,true,true],'map, readout and primary graph are visible in one 1440×900 viewport');
  const chart=page.locator('[data-combined-svg]');await chart.focus();await chart.press('End');await frame(page);assert.ok(Number(await map.getAttribute('data-cursor-distance'))>20900);await chart.press('Home');await frame(page);assert.equal(Number(await map.getAttribute('data-cursor-distance')),0);await chart.press('ArrowRight');await frame(page);assert.ok(Number(await map.getAttribute('data-cursor-distance'))>0);
  await screenshot(page,'desktop-columns-1440-pace-hr');
  await page.addStyleTag({content:'html{font-size:200%!important}'});await page.waitForFunction(()=>document.querySelector('[data-lab-workspace]').dataset.effectiveLayout==='stacked');await noOverflow(page);assert.equal(await map.evaluate(n=>n._leaflet_id),id,'large text does not recreate Leaflet');
  await page.setViewportSize({width:390,height:1000});await page.waitForTimeout(230);await noOverflow(page);await page.addStyleTag({content:'html{font-size:100%!important}'});await page.waitForTimeout(230);await screenshot(page,'mobile-390-pace-hr');
  await page.locator('[data-lab-layout]').selectOption('columns');await page.reload();assert.equal(await page.locator('[data-lab-layout]').inputValue(),'columns');assert.deepEqual(t.errors,[]);
 }finally{await t.browser.close();}
});

test('Lab workspace: measured overlap sync, ranges, sticky wheel, separate permission, no route repaint and explicit reset',{skip:!enabled,timeout:180000},async()=>{
 const t=await launch(),{page}=t,a=analyzeActivity((await importWorkout(new TextEncoder().encode(loopGpx()),'synthetic.gpx'))[0]);
 try{
  await upload(page,{});await street(page);const map=page.locator('[data-street-map]');await page.locator('[data-map-wheel]').click();assert.equal(await map.getAttribute('data-wheel'),'true');
  await page.locator('[data-combined-metric="hr"]').check();await page.locator('[data-combined-metric="cad"]').check();await page.locator('[data-lab-workspace]').evaluate(n=>n.scrollIntoView({block:'start'}));
  const id=await map.evaluate(n=>n._leaflet_id),center=await map.getAttribute('data-map-center'),svgHandle=await page.locator('[data-combined-svg]').elementHandle();
  await map.scrollIntoViewIfNeeded();const hit=await position(page,a.points[180]),old=await map.getAttribute('data-cursor-time');await page.mouse.click(hit.x,hit.y);await page.locator('[data-map-candidate]').first().waitFor();assert.equal(await map.getAttribute('data-cursor-time'),old);
  const indices=await page.locator('[data-map-candidate]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.mapCandidate))),chosen=indices.find(i=>i>720),expected=a.points[chosen];assert.ok(chosen>720);
  await page.locator(`[data-map-candidate="${chosen}"]`).click();await frame(page);assert.equal(Number(await map.getAttribute('data-cursor-time')),expected.t);assert.equal(Number(await map.getAttribute('data-cursor-distance')),expected.d);assert.equal(Number(await page.locator('[data-combined-svg]').getAttribute('data-cursor-x')),expected.d/1000);assert.match(await page.locator('[data-map-point]').textContent(),/Избрано преминаване 2/);assert.equal(await map.getAttribute('data-wheel'),'true');
  assert.equal(await map.getAttribute('data-map-center'),center,'choosing a point does not pan the map');
  await screenshot(page,'desktop-selected-visit-2');
  await mapSettings(page);await page.locator('[data-map-colour]').selectOption('hr');await mapSettings(page,false);await page.mouse.move(0,0);assert.equal(await map.getAttribute('data-wheel'),'true');
  await page.locator('[data-combined-svg]').focus();await page.keyboard.press('Home');await frame(page);assert.equal(Number(await map.getAttribute('data-cursor-distance')),0);assert.equal(await map.getAttribute('data-wheel'),'true');
  await fold(page,'.lab-range-details');await page.locator('[data-lab-range-start]').fill('5');await page.locator('[data-lab-range-end]').fill('10');await action(page,'zoom');assert.equal(await page.locator('[data-combined-svg]').getAttribute('data-x-min'),'5');assert.ok(Number(await page.locator('[data-combined-selection]').getAttribute('width'))>0);const zoomedDistance=Number(await map.getAttribute('data-cursor-distance'));assert.ok(zoomedDistance>=5000&&zoomedDistance<=10000,'zoom chooses an actual visible measurement instead of clamping an unrelated point');assert.equal(Number(await page.locator('[data-combined-svg]').getAttribute('data-cursor-x')),zoomedDistance/1000);assert.equal(await page.locator('[data-combined-cursor]').getAttribute('visibility'),'visible');assert.equal(await map.getAttribute('data-wheel'),'true');await action(page,'reset-zoom');await fold(page,'.lab-range-details',false);
  await page.locator('[data-combined-svg]').focus();await page.keyboard.press('ArrowRight');await frame(page);await fold(page,'.lab-finish-details');await page.locator('[data-map-finish]').click();await idle(page);assert.equal(await page.locator('[data-combined-finish]').count(),1);assert.equal(await page.locator('[data-street-marker="finish"]').count(),1);assert.equal(await map.getAttribute('data-wheel'),'true');await page.locator('[data-map-clear-finish]').click();await idle(page);await fold(page,'.lab-finish-details',false);
  await page.locator('[data-lab-layout]').selectOption('stacked');await frame(page);assert.equal(await map.getAttribute('data-wheel'),'true');await page.locator('[data-lab-layout]').selectOption('columns');await frame(page);assert.equal(await map.evaluate(n=>n._leaflet_id),id);
  await page.waitForTimeout(250);await page.evaluate(()=>{window.__labRouteStrokes=0;window.__originalStroke=CanvasRenderingContext2D.prototype.stroke;CanvasRenderingContext2D.prototype.stroke=function(...args){if(this.canvas.closest('[data-street-map]'))window.__labRouteStrokes++;return window.__originalStroke.apply(this,args);};});
  const chart=page.locator('[data-combined-svg]');await chart.scrollIntoViewIfNeeded();const box=await chart.boundingBox(),sameChart=await chart.elementHandle();
  for(let i=0;i<25;i++){await page.mouse.move(box.x+70+(box.width-100)*i/25,box.y+55);await frame(page);}
  assert.equal(await page.evaluate(()=>window.__labRouteStrokes),0,'moving the cursor never repaints the route canvas');assert.equal(await sameChart.evaluate(n=>n===document.querySelector('[data-combined-svg]')),true,'pointer movement does not rebuild the graph');assert.equal(await svgHandle.evaluate(n=>n.isConnected),false,'explicit range/finish/layout changes can rebuild graphs');assert.ok(await page.locator('[data-street-cursor]').isVisible());
  await page.evaluate(()=>{CanvasRenderingContext2D.prototype.stroke=window.__originalStroke;});
  const before=await map.getAttribute('data-zoom');await page.mouse.move(0,500);await page.mouse.wheel(0,250);await page.waitForTimeout(220);assert.equal(await map.getAttribute('data-zoom'),before);assert.equal(await map.getAttribute('data-wheel'),'true');
  await page.locator('[data-map-mode="local"]').click();assert.equal(await page.locator('[data-lab-map]').getAttribute('data-map-permission'),'true');await street(page);assert.equal(await map.getAttribute('data-wheel'),'true');assert.equal(await page.locator('[data-map-consent]').isVisible(),false);
  await mapSettings(page);await page.locator('[data-map-forget]').click();assert.equal(await page.locator('[data-lab-map]').getAttribute('data-map-permission'),'false');await street(page);assert.equal(await map.getAttribute('data-wheel'),'true','revoking background consent does not change the independent wheel preference');await mapSettings(page,false);
  await page.locator('[data-map-wheel]').click();assert.equal(await map.getAttribute('data-wheel'),'false');await page.locator('[data-combined-svg]').focus();await page.keyboard.press('ArrowRight');await frame(page);assert.equal(await map.getAttribute('data-wheel'),'false');
  await fold(page,'[data-lab-detail-graphs]');await page.locator('[data-lab-charts] svg').first().waitFor({state:'attached'});assert.equal(await page.locator('[data-lab-charts] svg').count(),5);await screenshot(page,'detailed-graphs-expanded','[data-lab-detail-graphs]');await fold(page,'[data-lab-detail-graphs]',false);
  await page.locator('[data-map-wheel]').click();await upload(page,{laps:1,lapDistance:5000});assert.equal(await page.locator('[data-lab-map]').getAttribute('data-map-permission'),'false');assert.equal(await page.locator('[data-map-wheel]').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('.leaflet-container').count(),0);assert.deepEqual(t.errors,[]);
 }finally{await t.browser.close();}
});

test('Lab workspace: missing measurements, disabled future GAP, no sensor fabrication and all indicators off',{skip:!enabled,timeout:120000},async()=>{
 const t=await launch({viewport:{width:390,height:1000},hasTouch:true}),{page}=t;
 try{
  await upload(page,{laps:1,lapDistance:5000,heart:false,heights:false});for(const key of ['hr','cad']){assert.equal(await page.locator(`[data-combined-metric="${key}"]`).isDisabled(),true);assert.equal(await page.locator(`[data-combined-lane="${key}"]`).count(),0);}
  for(const key of ['hr','cad','elevation','grade'])assert.equal(await page.locator(`[data-point-field="${key}"]`).textContent(),'Няма данни');
  assert.equal(await page.locator('[data-combined-gap]').isDisabled(),true);assert.equal(await page.locator('[data-combined-lane="gap"]').count(),0);
  await page.locator('[data-combined-metric="pace"]').uncheck();assert.match(await page.locator('[data-lab-combined-chart]').textContent(),/Включи наличен показател/);await page.locator('[data-combined-metric="pace"]').check();
  const chart=page.locator('[data-combined-svg]');await chart.scrollIntoViewIfNeeded();const box=await chart.boundingBox();await page.touchscreen.tap(box.x+box.width*.6,box.y+60);await frame(page);assert.ok(Number(await page.locator('[data-local-map] [data-lab-map-cursor]').getAttribute('cx'))>0);await noOverflow(page);
  assert.equal(t.tiles.length,0,'no background requests before explicit consent');assert.deepEqual(t.errors,[]);
 }finally{await t.browser.close();}
});

test('Lab workspace: 10,000-point binary FIT keeps its route and SVG intact during a throttled pointer burst',{skip:!enabled,timeout:120000},async()=>{
 const t=await launch(),{page}=t;
 try{
  await page.locator('[data-lab-files]').setInputFiles({name:'СИНТЕТИЧЕН FIT 10000.fit',mimeType:'application/octet-stream',buffer:Buffer.from(fit({recordCount:10000}))});await idle(page);await action(page,'open-preview');await street(page);
  const chart=page.locator('[data-combined-svg]');await chart.scrollIntoViewIfNeeded();await page.waitForTimeout(250);
  const result=await chart.evaluate(async svg=>{
   let strokes=0,cursorWrites=0;const original=CanvasRenderingContext2D.prototype.stroke,observer=new MutationObserver(rows=>cursorWrites+=rows.length);
   observer.observe(svg.querySelector('[data-combined-cursor]'),{attributes:true});CanvasRenderingContext2D.prototype.stroke=function(...args){if(this.canvas.closest('[data-street-map]'))strokes++;return original.apply(this,args);};
   const box=svg.getBoundingClientRect();for(let i=0;i<1000;i++)svg.dispatchEvent(new PointerEvent('pointermove',{clientX:box.x+70+(box.width-100)*i/1000,clientY:box.y+60,bubbles:true}));
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));observer.disconnect();CanvasRenderingContext2D.prototype.stroke=original;
   return {strokes,cursorWrites,sameSvg:svg===document.querySelector('[data-combined-svg]'),distance:Number(document.querySelector('[data-street-map]').dataset.cursorDistance),cursor:Number(svg.dataset.cursorX)};
  });
  assert.equal(result.strokes,0);assert.equal(result.sameSvg,true);assert.ok(result.cursorWrites>0&&result.cursorWrites<=3,'a thousand events coalesce into one cursor update');assert.ok(result.distance>28000);assert.equal(result.distance/1000,result.cursor);assert.deepEqual(t.errors,[]);
 }finally{await t.browser.close();}
});
