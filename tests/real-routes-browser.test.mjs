import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {mkdirSync} from "node:fs";
import {loadRoutes} from "../src/lib/running.mjs";
import {analyzeRoute,formatDuration} from "../src/lib/route-analysis.mjs";
import {topClimbs} from "../src/lib/profile-terrain.mjs";
const enabled=process.env.DIDO_BROWSER_MODULE&&process.env.DIDO_BROWSER_URL;

test("published real routes: maps, profiles, two/three comparisons and no disabled GPX downloads",{skip:!enabled,timeout:120000},async(t)=>{
 const all=loadRoutes();
 const routes=["pleven-half-2026","sofia-half-2026","kaylaka-21km-2026"].map(id=>all.find(r=>r.id===id)).filter(r=>r?.mapHref&&r.analysisHref&&r.includeInComparison&&r.includeInCalculator);
 if(routes.length<2){t.skip("At least two currently permitted real routes are needed.");return;}
 const {chromium}=createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE);
 const browser=await chromium.launch({executablePath:process.env.DIDO_CHROMIUM||"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
 const origin=process.env.DIDO_BROWSER_URL,folder=process.env.DIDO_ANALYSIS_SCREENSHOTS||"work/analysis-visuals";mkdirSync(folder,{recursive:true});
 const errors=[];
 async function create(width){const context=await browser.newContext({viewport:{width,height:960},hasTouch:true}),page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
  // The actual HTML, catalog, map and profile endpoints are served from dist.
  // Only external tile requests are aborted; no route/profile fixture interception.
  await page.route("**/*",r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const query=new URLSearchParams({route:routes[0].id,compare:routes[1].id});if(routes[2])query.set("compare3",routes[2].id);
  await page.goto(origin+"/byagane/analiz/?"+query);await page.locator("[data-pace-result]").waitFor({state:"visible"});return{context,page};
 }
 try{
  for(const width of [320,390,768,1440]){
   const {context,page}=await create(width),ready=()=>page.locator("[data-pace-result]").waitFor({state:"visible"});
   assert.equal(await page.locator("[data-profile-details]:visible").count(),routes.length);
   assert.equal(await page.locator("[data-smoothing]").inputValue(),"100");
   const slots=["primary","secondary","tertiary"];
   const domains=await page.locator("[data-profile-chart]:visible").evaluateAll(charts=>charts.map(c=>c.dataset.xMax));assert.equal(new Set(domains).size,1);
   for(let i=0;i<routes.length;i++){
    const r=routes[i],card=page.locator(`[data-profile="${slots[i]}"]`),expected=analyzeRoute(r.segments,{trusted:true,lapCount:r.lapCount,windowM:100});
    assert.equal(await card.locator("[data-profile-title]").textContent(),r.title);
    const metrics=await card.locator("[data-profile-stats] dd").allTextContents();assert.equal(metrics[4],`${Math.round(expected.ascentM)} м`);assert.equal(metrics[5],`${Math.round(expected.descentM)} м`);
    assert.equal(await card.locator("[data-climb-marker]").count(),topClimbs(expected).length);
    assert.equal(await card.locator("[data-climb-rank]").count(),topClimbs(expected).length);
    const kinds=await card.locator("[data-terrain]").evaluateAll(curves=>[...new Set(curves.map(c=>c.dataset.terrain))]);assert.ok(kinds.includes("up")&&kinds.includes("down")&&kinds.includes("flat"));
   }
   await page.locator("[data-overlay-mode]").selectOption("relative");await ready();assert.equal(await page.locator("[data-overlay-legend] li").count(),routes.length);
   if([390,1440].includes(width)){
    const capture=await create(width);
    for(let i=0;i<routes.length;i++){
     // Establish the normal scrolled viewport before Chromium captures a tall card.
     // This also avoids a screenshot-only stale composite of the offscreen skip link.
     await capture.page.locator(`[data-profile="${slots[i]}"] [data-profile-title]`).click();
     await capture.page.locator(`[data-profile="${slots[i]}"]`).screenshot({path:`${folder}/real-${routes[i].id}-${width}.png`});
    }
    await capture.page.locator("[data-overlay-mode]").selectOption("relative");await capture.page.locator("[data-pace-result]").waitFor({state:"visible"});
    await capture.page.locator("[data-overlay]").screenshot({path:`${folder}/real-overlay-${width}.png`});
    for(let i=0;i<routes.length;i++){
     const slot=capture.page.locator(`[data-analysis-slot="${slots[i]}"]`);await slot.locator("summary").click();await slot.locator("[data-load-map]").click();await slot.locator(".leaflet-container").waitFor({state:"visible"});
     assert.ok((await slot.locator(".leaflet-overlay-pane path").first().getAttribute("d")).length>30);
     await slot.locator("[data-route-map]").screenshot({path:`${folder}/real-map-${routes[i].id}-${width}.png`});
    }
    await capture.context.close();
   }
   const slot=page.locator('[data-analysis-slot="primary"]');await slot.locator("summary").click();await slot.locator("[data-load-map]").click();await slot.locator(".leaflet-container").waitFor({state:"visible"});
   const chart=slot.locator("[data-profile-chart]");await chart.scrollIntoViewIfNeeded();const box=await chart.boundingBox(),marker=slot.locator(".leaflet-overlay-pane path").last(),old=await marker.getAttribute("d");
   await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6);await page.waitForFunction(()=>Number(document.querySelector('[data-profile="primary"] [data-profile-chart]').dataset.selectedDistance)>1000);assert.notEqual(await marker.getAttribute("d"),old);
   await page.locator('[name="target"]').fill("02:00:01");await page.locator('[name="strategy"]').selectOption("effort");await page.locator("[data-pace-form] button").click();await ready();
   const times=await page.locator("[data-pace-rows] tr").evaluateAll(rows=>rows.map(r=>r.cells[2].textContent));assert.equal(times.reduce((n,s)=>n+s.split(":").reduce((v,k)=>v*60+Number(k),0),0),7201);
   assert.match(await page.locator("[data-pace-rows] tr").last().textContent(),new RegExp(formatDuration(7201)));
   if(routes[2]){await page.locator('[data-route-select="tertiary"]').selectOption("");await ready();assert.equal(await page.locator("[data-profile-details]:visible").count(),2);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   for(const r of routes){
    await page.goto(origin+r.href);await page.locator("[data-profile-details]").waitFor({state:"visible"});assert.equal(await page.locator("[data-route-map]").count(),1);
    if(!r.allowDownload){assert.equal(await page.locator('a[download],a[href$="trace.gpx"]').count(),0);assert.equal((await page.request.get(origin+r.href+"trace.gpx")).status(),404);}
    const map=await(await page.request.get(origin+r.mapHref)).json(),profile=await(await page.request.get(origin+r.analysisHref)).json();
    assert.deepEqual(Object.keys(map),["segments"]);assert.deepEqual(Object.keys(profile).sort(),["lapCount","segments"]);assert.equal(profile.lapCount,r.lapCount);
    assert.ok(map.segments.every(s=>s.every(p=>p.length===2)));assert.ok(profile.segments.every(s=>s.every(p=>Object.keys(p).every(k=>["lat","lon","ele"].includes(k)))));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   await context.close();
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
