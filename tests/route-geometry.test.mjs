import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync,mkdtempSync,writeFileSync,rmSync,symlinkSync } from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {parseRouteGeometry} from "../src/lib/route-geometry.mjs";
import {loadRoutes,resolveGeometrySource,allowedGpxFiles} from "../src/lib/running.mjs";
const segments=[[{lat:0,lon:0,ele:100},{lat:0,lon:.001,ele:105},{lat:0,lon:.002,ele:110}]];

test("stored approved geometry accepts only coordinate/elevation data and retains segment breaks",()=>{
 const source={segments:[...segments,...segments]};assert.deepEqual(parseRouteGeometry(JSON.stringify(source)),source.segments);
 for(const extra of [{name:"PRIVATE"},{metadata:{}},{time:"2099-01-01"}])assert.throws(()=>parseRouteGeometry(JSON.stringify({...source,...extra})));
 for(const extra of [{time:"2099-01-01"},{hr:180},{name:"PRIVATE"},{extensions:{}}])assert.throws(()=>parseRouteGeometry(JSON.stringify({segments:[[...segments[0].slice(0,1),{...segments[0][1],...extra}]]})));
 for(const value of ["{",JSON.stringify({segments:[]}),JSON.stringify({segments:[[{lat:91,lon:0},{lat:0,lon:0}]]}),JSON.stringify({segments:[[{lat:0,lon:0,ele:null},segments[0][1]]]}),JSON.stringify({segments:[Array(50001).fill(segments[0][0])]})])assert.throws(()=>parseRouteGeometry(value));
 assert.deepEqual(parseRouteGeometry(JSON.stringify({segments:segments.map(s=>s.map(({lat,lon})=>({lat,lon})))})),segments.map(s=>s.map(({lat,lon})=>({lat,lon}))));
});

test("geometry source is confined to its own directory; two simultaneous sources fail closed",()=>{
 const root=mkdtempSync(join(tmpdir(),"dido-geometry-"));
 try{
  mkdirSync(join(root,"src/data/route-geometry"),{recursive:true});mkdirSync(join(root,"src/content/routes"),{recursive:true});
  const file=join(root,"src/data/route-geometry/approved.json");writeFileSync(file,JSON.stringify({segments}));
  assert.equal(resolveGeometrySource(root,"/route-geometry/approved.json"),file);
  for(const path of ["/route-geometry/../approved.json","/route-geometry/%2e%2e%2fapproved.json","/route-geometry/%00.json","/route-geometry/approved.gpx","/images/approved.json","https://example.org/source.json"])assert.throws(()=>resolveGeometrySource(root,path));
  symlinkSync(file,join(root,"src/data/route-geometry/link.json"));assert.throws(()=>resolveGeometrySource(root,"/route-geometry/link.json"));
  const record={title:"Синтетичен одобрен маршрут",status:"published",publicApproved:true,publishMap:true,allowDownload:false,allowElevationAnalysis:true,elevationTrusted:true,lapCount:1,geometry:"/route-geometry/approved.json"};
  const save=values=>writeFileSync(join(root,"src/content/routes/approved.json"),JSON.stringify({...record,...values}));
  save({});let route=loadRoutes(root)[0];assert.equal(route.analysisStatus,"ready");assert.ok(route.mapHref&&route.analysisHref);assert.equal(route.gpxHref,undefined);assert.equal(allowedGpxFiles(root).size,0);
  save({gpx:"/gpx-source/original.gpx"});route=loadRoutes(root)[0];assert.match(route.error,/само един източник/);assert.equal(route.mapHref,undefined);assert.equal(route.analysisHref,undefined);
  save({publicApproved:false});assert.equal(loadRoutes(root).length,0);
  save({status:"draft"});assert.equal(loadRoutes(root).length,0);
 }finally{rmSync(root,{recursive:true,force:true});}
});
