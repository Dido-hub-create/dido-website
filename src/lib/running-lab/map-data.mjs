import {distanceBetween} from '../geo.mjs';
import {visualScale} from './chart-scale.mjs';

export const MAX_PICK_METRES=150;
const MAP_FIELDS=['lat','lon','t','z','hr','cad','d','run'];
// A transferable, ephemeral payload for one explicitly opened map. It is not
// added to imported batches, IndexedDB models, metadata, exports or backups.
export function packMapPoints(points){
 const packed=new Float64Array(points.length*MAP_FIELDS.length);
 points.forEach((point,i)=>MAP_FIELDS.forEach((key,j)=>packed[i*8+j]=Number.isFinite(point[key])?point[key]:NaN));return packed;
}
export function unpackMapPoints(packed){
 if(!(packed instanceof Float64Array)||packed.length%8||packed.length>800000)throw new Error('Невалидни локални измервания за картата.');
 const points=[];for(let i=0;i<packed.length;i+=8){const point={};MAP_FIELDS.forEach((key,j)=>point[key]=Number.isFinite(packed[i+j])?packed[i+j]:null);points.push(point);}return points;
}
const CELL=.002,EARTH_DEGREE_M=111195.0802;
const wrap=lon=>((lon+540)%360)-180;
export const validMapPoint=p=>p&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180&&Number.isFinite(p.d);

// An index of measured normalized points, never interpolated positions. Built
// once per opened analysis; queries do not rescan a long activity in normal use.
export function measuredPointIndex(points){
 const cells=new Map(),entries=[];
 points.forEach((point,index)=>{
  if(!validMapPoint(point)||!([points[index-1],points[index+1]].some(p=>validMapPoint(p)&&p.run===point.run)))return;
  const entry={point,index},key=`${Math.floor(point.lat/CELL)}:${Math.floor(wrap(point.lon)/CELL)}`;
  if(!cells.has(key))cells.set(key,[]);cells.get(key).push(entry);entries.push(entry);
 });
 return {entries,query(position,radiusM){
  if(!Number.isFinite(position?.lat)||!Number.isFinite(position?.lon)||Math.abs(position.lat)>90||Math.abs(position.lon)>180||!Number.isFinite(radiusM)||radiusM<=0)return [];
  const radius=Math.min(MAX_PICK_METRES,radiusM),latDelta=radius/EARTH_DEGREE_M,cos=Math.max(.00001,Math.cos(Math.min(90,Math.abs(position.lat)+latDelta)*Math.PI/180));
  const lonDelta=Math.abs(position.lat)+latDelta>=90?180:Math.min(180,latDelta/cos),south=Math.floor(Math.max(-90,position.lat-latDelta)/CELL),north=Math.floor(Math.min(90,position.lat+latDelta)/CELL);
  const west=Math.floor((wrap(position.lon)-lonDelta)/CELL),east=Math.floor((wrap(position.lon)+lonDelta)/CELL);
  let candidates=[];
  if((north-south+1)*(east-west+1)>5000)candidates=entries;
  else for(let lat=south;lat<=north;lat++)for(let lon=west;lon<=east;lon++)for(const entry of cells.get(`${lat}:${((lon+90000)%180000+180000)%180000-90000}`)||[])candidates.push(entry);
  return candidates.map(entry=>({...entry,metres:distanceBetween(position,entry.point)})).filter(entry=>entry.metres<=radius);
 }};
}

// Nearby consecutive measurements form one visit. Returns separately the best
// measurement of every visit, plus indistinguishable ties (e.g. a late stop).
// The caller must ask the visitor when more than one candidate remains.
/** @param {null | ((point:any)=>number)} pixelDistance */
export function passageCandidates(index,position,radiusM,pixelDistance=null,pixelLimit=26){
 const matches=index.query(position,radiusM).filter(entry=>!pixelDistance||pixelDistance(entry.point)<=pixelLimit).sort((a,b)=>a.index-b.index),visits=[];
 for(const match of matches){
  const visit=visits.at(-1),last=visit?.at(-1);
  if(!last||last.point.run!==match.point.run||match.index-last.index>6||match.point.d-last.point.d>Math.max(50,Math.min(radiusM,MAX_PICK_METRES)*2))visits.push([match]);
  else visit.push(match);
 }
 return visits.flatMap((visit,i)=>{
  const best=visit.reduce((value,entry)=>Math.min(value,entry.metres),Infinity);
  return visit.filter(entry=>entry.metres<=best+.3).map(entry=>({...entry,visit:i+1,visitCount:visits.length}));
 });
}

export function closestSample(series,value,key='d',run=undefined){
 if(!series?.length)return null;
 let lo=0,hi=series.length-1;
 while(lo+1<hi){const mid=(lo+hi)>>1;if(series[mid][key]<=value)lo=mid;else hi=mid;}
 const a=series[lo],b=series[hi],point=Math.abs(a[key]-value)<=Math.abs(b[key]-value)?a:b;
 return run===undefined||point.run===run?point:null;
}

const MISSING={key:'missing',color:'#909cae',label:'Няма надеждни данни',dashed:true};
export function routeColouring(analysis,requested='single'){
 const a=analysis,available={single:true,pace:!!(a.quality.clockReliable&&a.quality.complete&&Number.isFinite(a.stats.pace)),grade:!!(a.elevation.available&&a.gradient?.available),hr:!!(a.quality.clockReliable&&a.stats.heart.coverage>=.8&&Number.isFinite(a.stats.heart.mean))};
 const mode=available[requested]?requested:'single';
 if(mode==='single')return {mode,available,unit:'',limits:[],legend:[{key:'single',color:'#368cdb',label:'GPS маршрут'}],at:()=>({key:'single',color:'#368cdb'})};
 const gradientRuns=new Map();
 if(mode==='grade')for(const p of a.gradient.samples){if(!gradientRuns.has(p.run))gradientRuns.set(p.run,[]);gradientRuns.get(p.run).push(p);}
 const unit=mode==='pace'?'мин/км':mode==='hr'?'уд./мин':'%',metric=mode==='hr'?'hr':'pace';
 const scale=mode==='grade'?null:visualScale(a.samples.map(p=>({x:p.d/1000,y:p[mode],run:p.run})),{metric});
 const limits=mode==='grade'?[-.5,.5]:scale?[scale.min+(scale.max-scale.min)/3,scale.min+(scale.max-scale.min)*2/3]:[];
 const legend=mode==='grade'?[{key:'down',color:'#15976c',label:'Спускане под −0,5%'},{key:'flat',color:'#718198',label:'Равно: −0,5% до +0,5%'},{key:'up',color:'#ef623f',label:'Изкачване над +0,5%'}]:
  [{key:'low',color:mode==='pace'?'#177eb7':'#c99b21',label:mode==='pace'?'По-бързо':'По-нисък отчетен пулс'},{key:'middle',color:'#9b59cd',label:'Среден диапазон'},{key:'high',color:'#e75c3b',label:mode==='pace'?'По-бавно':'По-висок отчетен пулс'}];
 function at(point){
  let value=null;
  if(mode==='grade')value=closestSample(gradientRuns.get(point.run),point.d)?.grade??null;
  else{const sample=closestSample(a.samples,a.quality.clockReliable?point.t:point.d,a.quality.clockReliable?'t':'d',point.run);value=sample?.[mode]??null;}
  if(!Number.isFinite(value)||mode!=='grade'&&value<=0)return MISSING;
  if(mode==='grade')value*=100;
  return value<limits[0]?legend[0]:value>limits[1]?legend[2]:legend[1];
 }
 return {mode,available,unit,limits,legend:[...legend,MISSING],at};
}

// Full measured geometry for Leaflet; the local SVG may pass the existing
// bounded graphical series. Colour values reuse the analytic graphical series.
/** @param {[number,number] | null} range */
export function routeLines(points,colouring,range=null){
 const lines=[];let current=null,previous=null;
 for(const point of points){
  if(!validMapPoint(point)||range&&(point.d<range[0]||point.d>range[1])){current=null;previous=null;continue;}
  const style=colouring.at(point);
  if(!previous||previous.run!==point.run){current={points:[point],style};lines.push(current);}
  else if(current.style.key!==style.key){current={points:[previous,point],style};lines.push(current);}
  else current.points.push(point);
  previous=point;
 }
 return lines.filter(line=>line.points.length>=2);
}

export function streetMapPossible(points){
 const valid=points.filter(validMapPoint);
 if(valid.length<2)return 'Файлът няма достатъчно GPS геометрия. Анализът остава достъпен.';
 if(valid.some(p=>Math.abs(p.lat)>85.05112878))return 'Трасето е извън покритието на тази картографска проекция. Използвай локалната схема.';
 const min=valid.reduce((value,p)=>Math.min(value,p.lon),Infinity),max=valid.reduce((value,p)=>Math.max(value,p.lon),-Infinity);
 if(max-min>180)return 'За трасе през 180-ия меридиан използвай локалната схема.';
 return null;
}
