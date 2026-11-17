import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {el} from './dom';
import {closestSample,routeLines,validMapPoint} from '../../lib/running-lab/map-data.mjs';
import {kilometreMarkerSize,spacedKilometres} from '../../lib/running-lab/kilometre-markers.mjs';
import {followPanOffset,FOLLOW_INTERVAL_MS} from '../../lib/running-lab/map-follow.mjs';

export const OSM_TILE_URL='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
interface Hooks {
 onPick:(position:{lat:number;lon:number},radiusM:number,pixels:(point:any)=>number,pixelLimit:number)=>void;
 onPoint:(point:any)=>void;onUnavailable:(message:string)=>void;onStatus:(message:string)=>void;onFollowOff:()=>void;
}
export function createStreetMap(container:HTMLElement,initial:any,initialColouring:any,hooks:Hooks){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const map=L.map(container,{preferCanvas:true,scrollWheelZoom:false,zoomControl:false,minZoom:2,maxZoom:19,touchZoom:true,keyboard:true,wheelDebounceTime:160,zoomAnimation:!reduced,fadeAnimation:!reduced,markerZoomAnimation:!reduced,inertia:!reduced,maxBounds:[[-85.05112878,-180],[85.05112878,180]],maxBoundsViscosity:.8});
 container.setAttribute('role','region');container.setAttribute('aria-label','Интерактивна карта. Стрелки за местене, плюс и минус за приближаване.');container.dataset.streetMap='';
 L.control.zoom({zoomInTitle:'Приближи картата',zoomOutTitle:'Отдалечи картата',zoomInText:'+',zoomOutText:'−'}).addTo(map);
 map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
 const route=L.layerGroup().addTo(map),selected=L.layerGroup().addTo(map),markers=L.layerGroup().addTo(map),kilometres=L.layerGroup().addTo(map);
 const kmLayers=new Map<number,{marker:L.Marker;content:HTMLElement}>();
 let analysis=initial,colouring=initialColouring,range:[number,number]|null=null,cursorPoint:any=null,disposed=false,clickTimer:ReturnType<typeof setTimeout>|undefined,timeout:ReturnType<typeof setTimeout>|undefined;
 let loaded=0,failed=0;
 let following=false,zooming=false,followFrame=0,followTimer:ReturnType<typeof setTimeout>|undefined,lastFollowAt=-Infinity;
 function cancelFollow(){cancelAnimationFrame(followFrame);followFrame=0;clearTimeout(followTimer);followTimer=undefined;}
 function queueFollow(){
  if(!following||disposed||zooming||followFrame||!validMapPoint(cursorPoint))return;
  followFrame=requestAnimationFrame(()=>{
   followFrame=0;if(!following||disposed||zooming||!validMapPoint(cursorPoint))return;
   const position=map.latLngToContainerPoint([cursorPoint.lat,cursorPoint.lon]),size=map.getSize(),offset=followPanOffset(position,{width:size.x,height:size.y});
   if(!offset)return;
   const remaining=FOLLOW_INTERVAL_MS-(performance.now()-lastFollowAt);
   if(remaining>0){if(followTimer===undefined)followTimer=setTimeout(()=>{followTimer=undefined;queueFollow();},remaining);return;}
   clearTimeout(followTimer);followTimer=undefined;lastFollowAt=performance.now();
   // Leaflet redraws the viewport on this occasional pan. Route layers remain
   // intact; regular cursor movement still updates only the DOM marker.
   map.panBy([offset.x,offset.y],{animate:false});
  });
 }
 function follow(enabled:boolean){following=enabled;container.dataset.follow=String(enabled);cancelFollow();if(enabled){lastFollowAt=-Infinity;queueFollow();}}
 function manualPan(){if(following){follow(false);hooks.onFollowOff();}}
 const manualKey=(event:KeyboardEvent)=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))manualPan();};
 map.on('dragstart',manualPan);container.addEventListener('keydown',manualKey);
 map.on('zoomstart',()=>{zooming=true;cancelFollow();});
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
 function pickPosition(position:L.LatLng,pixelLimit:number){
  const pixel=map.latLngToContainerPoint(position),edge=map.containerPointToLatLng(pixel.add([pixelLimit,0]));
  hooks.onPick({lat:position.lat,lon:position.lng},Math.min(150,map.distance(position,edge)),p=>map.latLngToContainerPoint(latlng(p)).distanceTo(pixel),pixelLimit);
 }
 function drawKilometres(){
  const zoom=map.getZoom(),size=kilometreMarkerSize(zoom),candidates=[];
  for(let km=1,count=Math.floor((analysis.stats.distanceM||0)/1000);km<=count;km++){
   const point=closestSample(analysis.points,km*1000);if(!validMapPoint(point))continue;
   const xy=map.latLngToLayerPoint(latlng(point));candidates.push({km,x:xy.x,y:xy.y,point});
  }
  const visible=spacedKilometres(candidates,zoom),keys=new Set(visible.map((p:any)=>p.km));
  for(const [km,row]of kmLayers)if(!keys.has(km)){kilometres.removeLayer(row.marker);kmLayers.delete(km);}
  for(const {km,point}of visible){
   let row=kmLayers.get(km);
   if(!row){const content=el('span',String(km)),label=`Километър ${km} · измерена точка`;content.dataset.streetKm=String(km);
    const marker=L.marker(latlng(point),{icon:L.divIcon({html:content,className:'lab-street-km',iconSize:[28,28],iconAnchor:[14,14]}),title:label,alt:label,keyboard:true}).bindTooltip(el('span',label)).on('click',(event:L.LeafletMouseEvent)=>{const original=event.originalEvent;pickPosition(original instanceof MouseEvent?map.mouseEventToLatLng(original):L.latLng(latlng(point)),matchMedia('(pointer:coarse)').matches?26:18);}).addTo(kilometres);row={marker,content};kmLayers.set(km,row);
   }
   row.content.style.setProperty('--km-size',size+'px');row.content.style.setProperty('--km-font',Math.max(9,Math.min(11,size*.56))+'px');
  }
  container.dataset.kmSize=String(size);container.dataset.kmCount=String(visible.length);
 }
 function drawMarkers(){
  markers.clearLayers();kilometres.clearLayers();kmLayers.clear();const points=analysis.points.filter(validMapPoint);if(!points.length)return;
  drawKilometres();
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
  container.dataset.cursorDistance=String(point.d);container.dataset.cursorTime=String(point.t??'');queueFollow();
 }
 function wheel(enabled:boolean){if(enabled)map.scrollWheelZoom.enable();else map.scrollWheelZoom.disable();container.dataset.wheel=String(enabled);}
 // Leaflet listens for wheel events on this container only. Keeping the user's
 // choice on pointerleave/focus changes cannot hijack scrolling outside it.
 map.on('click',(event:L.LeafletMouseEvent)=>{
  clearTimeout(clickTimer);clickTimer=setTimeout(()=>{
   // Following may pan during click debouncing. Reproject the clicked location
   // in the current viewport so visit picking still uses that same location.
   if(disposed)return;const position={lat:event.latlng.lat,lon:event.latlng.lng},point=map.latLngToContainerPoint(event.latlng),pixelLimit=event.originalEvent instanceof PointerEvent&&event.originalEvent.pointerType==='touch'?26:18;
   const edge=map.containerPointToLatLng(point.add([pixelLimit,0])),radius=Math.min(150,map.distance(event.latlng,edge));
   hooks.onPick(position,radius,p=>map.latLngToContainerPoint(latlng(p)).distanceTo(point),pixelLimit);
  },250);
 });
 map.on('dblclick',()=>clearTimeout(clickTimer));
 map.on('zoomend',()=>{container.dataset.zoom=String(map.getZoom());drawKilometres();zooming=false;queueFollow();});
 map.on('moveend',()=>{const center=map.getCenter();container.dataset.mapCenter=`${center.lat},${center.lng}`;});
 fullRoute();draw();tiles.addTo(map);armTimeout();container.dataset.zoom=String(map.getZoom());container.dataset.wheel='false';container.dataset.follow='false';
 return {
  update,setRange(value:[number,number]|null){range=value;drawRange();},
  setAnalysis(value:any,style:any){analysis=value;colouring=style;draw();if(cursorPoint)update(cursorPoint);},
  fullRoute,resize(){if(container.clientWidth&&container.clientHeight){map.invalidateSize({pan:true,animate:false,debounceMoveend:true});queueFollow();}},wheel,follow,
  showPoint(){if(validMapPoint(cursorPoint))map.panTo(latlng(cursorPoint),{animate:!reduced});},
  destroy(){disposed=true;cancelFollow();clearTimeout(timeout);clearTimeout(clickTimer);container.removeEventListener('keydown',manualKey);map.remove();container.replaceChildren();container.className='lab-street-map';for(const key of ['streetMap','mapReady','zoom','mapCenter','cursorTime','cursorDistance','wheel','follow','kmSize','kmCount'])delete container.dataset[key];},
 };
}
