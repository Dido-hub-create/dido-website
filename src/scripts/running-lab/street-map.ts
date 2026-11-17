import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {el} from './dom';
import {closestSample,routeLines,validMapPoint} from '../../lib/running-lab/map-data.mjs';

export const OSM_TILE_URL='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
interface Hooks {
 onPick:(position:{lat:number;lon:number},radiusM:number,pixels:(point:any)=>number,pixelLimit:number)=>void;
 onPoint:(point:any)=>void;onUnavailable:(message:string)=>void;onStatus:(message:string)=>void;
}
export function createStreetMap(container:HTMLElement,initial:any,initialColouring:any,hooks:Hooks){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const map=L.map(container,{preferCanvas:true,scrollWheelZoom:false,zoomControl:false,minZoom:2,maxZoom:19,touchZoom:true,keyboard:true,wheelDebounceTime:160,zoomAnimation:!reduced,fadeAnimation:!reduced,markerZoomAnimation:!reduced,inertia:!reduced,maxBounds:[[-85.05112878,-180],[85.05112878,180]],maxBoundsViscosity:.8});
 container.setAttribute('role','region');container.setAttribute('aria-label','Интерактивна карта. Стрелки за местене, плюс и минус за приближаване.');container.dataset.streetMap='';
 L.control.zoom({zoomInTitle:'Приближи картата',zoomOutTitle:'Отдалечи картата',zoomInText:'+',zoomOutText:'−'}).addTo(map);
 map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
 const route=L.layerGroup().addTo(map),selected=L.layerGroup().addTo(map),markers=L.layerGroup().addTo(map);
 let analysis=initial,colouring=initialColouring,range:[number,number]|null=null,cursorPoint:any=null,disposed=false,clickTimer:ReturnType<typeof setTimeout>|undefined,timeout:ReturnType<typeof setTimeout>|undefined;
 let loaded=0,failed=0;
 // Leaflet still uses its map after firing GridLayer's load event. Leave that
 // event stack before removing the map, including when every tile is blocked.
 const unavailable=(message:string)=>queueMicrotask(()=>{if(!disposed)hooks.onUnavailable(message);});
 const tiles=L.tileLayer(OSM_TILE_URL,{minZoom:2,maxZoom:19,maxNativeZoom:19,noWrap:true,detectRetina:false,keepBuffer:0,updateWhenIdle:true,updateWhenZooming:false,referrerPolicy:'strict-origin-when-cross-origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors · ODbL</a>'});
 const armTimeout=()=>{clearTimeout(timeout);timeout=setTimeout(()=>{if(!disposed)hooks.onUnavailable('Картографският фон се забави или е недостъпен. Върнахме локалната GPS схема; можеш да опиташ отново.');},12000);};
 tiles.on('loading',()=>{if(disposed)return;loaded=failed=0;container.dataset.mapReady='loading';armTimeout();});
 tiles.on('tileload',()=>{loaded++;});
 tiles.on('tileerror',()=>{failed++;});
 tiles.on('load',()=>{
  clearTimeout(timeout);if(disposed)return;
  if(failed&&!loaded){unavailable('Фоновата карта е блокирана или недостъпна. Локалната GPS схема остава достъпна. Няма автоматичен повторен опит или друг доставчик.');return;}
  container.dataset.mapReady='ready';hooks.onStatus(failed?'Част от фона не се зареди. Можеш да преминеш към локалната схема.':'OpenStreetMap е включен. Плочките показват само заявената видима област.');
 });
 const latlng=(p:any):L.LatLngTuple=>[p.lat,p.lon];
 const cursorContent=el('span');cursorContent.dataset.streetCursor='';cursorContent.setAttribute('aria-hidden','true');
 // A DOM marker moves without repainting the Canvas containing a long route.
 const cursor=L.marker([0,0],{icon:L.divIcon({html:cursorContent,className:'lab-street-cursor',iconSize:[16,16],iconAnchor:[8,8]}),keyboard:false,interactive:false,zIndexOffset:1000});
 function fullRoute(){
  const points=analysis.points.filter(validMapPoint);
  if(points.length)map.fitBounds(L.latLngBounds(points.map(latlng)),{padding:[32,32],maxZoom:16,animate:false});
 }
 function marker(point:any,label:string,kind:string,text:string,anchor:L.PointTuple){
  if(!point)return;
  const content=el('span');content.append(el('b',text));content.dataset.streetMarker=kind;
  const icon=L.divIcon({html:content,className:'lab-street-marker lab-street-marker-'+kind,iconSize:[27,27],iconAnchor:anchor});
  L.marker(latlng(point),{icon,title:label,alt:label,keyboard:true,zIndexOffset:kind==='finish'?300:100}).bindTooltip(el('span',label)).on('click',()=>hooks.onPoint(point)).addTo(markers);
 }
 function drawMarkers(){
  markers.clearLayers();const points=analysis.points.filter(validMapPoint);if(!points.length)return;
  const count=Math.floor((analysis.stats.distanceM||0)/1000),stride=Math.max(1,Math.ceil(count/16)),occupied=new Set<string>();
  for(let km=1;km<=count;km+=stride){const p=closestSample(analysis.points,km*1000);if(!validMapPoint(p))continue;
   const xy=map.latLngToContainerPoint(latlng(p)),cell=`${Math.round(xy.x/30)}:${Math.round(xy.y/28)}`;
   if(occupied.has(cell))continue;occupied.add(cell);
   const content=el('span',String(km)),label=`Километър ${km} · измерена точка`;
   L.marker(latlng(p),{icon:L.divIcon({html:content,className:'lab-street-km',iconSize:[24,24],iconAnchor:[12,12]}),title:label,alt:label,keyboard:true}).bindTooltip(el('span',label)).on('click',()=>hooks.onPoint(p)).addTo(markers);
  }
  marker(points[0],'Начало на оригиналния запис','start','С',[31,31]);
  marker(points.at(-1),'Край на оригиналния запис','end','Ф',[-4,31]);
  if(analysis.manualFinish?.available)marker(closestSample(analysis.points,analysis.manualFinish.time,'t'),'Ръчно посочен финал · отделен от края на оригинала','finish','Р',[13,-4]);
 }
 function drawRange(){
  selected.clearLayers();if(!range)return;
  const lines=routeLines(analysis.points,colouring,range).map((line:any)=>line.points.map(latlng));
  L.polyline(lines,{color:'#fff',weight:9,opacity:.9,interactive:false}).addTo(selected);
  L.polyline(lines,{color:'#ff8a16',weight:5,opacity:1,interactive:false}).addTo(selected);
 }
 function draw(){
  route.clearLayers();
  for(const line of routeLines(analysis.points,colouring))L.polyline(line.points.map(latlng),{color:line.style.color,weight:4.5,opacity:1,dashArray:line.style.dashed?'6 5':undefined,interactive:false,smoothFactor:.7}).addTo(route);
  drawRange();drawMarkers();
 }
 function update(point:any){
  cursorPoint=point;if(!validMapPoint(point)){if(map.hasLayer(cursor))map.removeLayer(cursor);return;}
  cursor.setLatLng(latlng(point));if(!map.hasLayer(cursor))cursor.addTo(map);
  container.dataset.cursorDistance=String(point.d);container.dataset.cursorTime=String(point.t??'');
 }
 function wheel(enabled:boolean){if(enabled)map.scrollWheelZoom.enable();else map.scrollWheelZoom.disable();container.dataset.wheel=String(enabled);}
 // Leaflet listens for wheel events on this container only. Keeping the user's
 // choice on pointerleave/focus changes cannot hijack scrolling outside it.
 map.on('click',(event:L.LeafletMouseEvent)=>{
  clearTimeout(clickTimer);clickTimer=setTimeout(()=>{
   if(disposed)return;const position={lat:event.latlng.lat,lon:event.latlng.lng},point=event.containerPoint,pixelLimit=event.originalEvent instanceof PointerEvent&&event.originalEvent.pointerType==='touch'?26:18;
   const edge=map.containerPointToLatLng(point.add([pixelLimit,0])),radius=Math.min(150,map.distance(event.latlng,edge));
   hooks.onPick(position,radius,p=>map.latLngToContainerPoint(latlng(p)).distanceTo(point),pixelLimit);
  },250);
 });
 map.on('dblclick',()=>clearTimeout(clickTimer));
 map.on('zoomend',()=>{container.dataset.zoom=String(map.getZoom());drawMarkers();});
 map.on('moveend',()=>{const center=map.getCenter();container.dataset.mapCenter=`${center.lat},${center.lng}`;});
 fullRoute();draw();tiles.addTo(map);armTimeout();container.dataset.zoom=String(map.getZoom());container.dataset.wheel='false';
 return {
  update,setRange(value:[number,number]|null){range=value;drawRange();},
  setAnalysis(value:any,style:any){analysis=value;colouring=style;draw();if(cursorPoint)update(cursorPoint);},
  fullRoute,resize(){if(container.clientWidth&&container.clientHeight)map.invalidateSize({pan:true,animate:false,debounceMoveend:true});},wheel,
  showPoint(){if(validMapPoint(cursorPoint))map.panTo(latlng(cursorPoint),{animate:!reduced});},
  destroy(){disposed=true;clearTimeout(timeout);clearTimeout(clickTimer);map.remove();container.replaceChildren();container.className='lab-street-map';for(const key of ['streetMap','mapReady','zoom','mapCenter','cursorTime','cursorDistance','wheel'])delete container.dataset[key];},
 };
}
