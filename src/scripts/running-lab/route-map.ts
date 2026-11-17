import {el} from './dom';
import {svgNode,svgLabel,localPointer} from './svg';
import {nearest,nearestTime} from './chart-data';
import {routeLines} from '../../lib/running-lab/map-data.mjs';
interface MapOptions {range?:[number,number]|null;finishTime?:number|null;onCursor?:(point:any)=>void;colouring?:any;onPick?:(position:{lat:number;lon:number},radiusM:number,pixels:(point:any)=>number,pixelLimit:number)=>void}
export function routeMap(samples:any[],options:MapOptions={}){
 const points=samples.filter(p=>p.lat!==null&&p.lon!==null);
 if(points.length<2)return {node:el('p','Файлът няма GPS геометрия. Времевият и сензорният анализ остават достъпни.'),update:(_point:any)=>{},setRange:(_range:[number,number]|null)=>{}};
 const base=points[0],project=(p:any)=>({x:(((p.lon-base.lon+540)%360)-180)*Math.max(.01,Math.cos(base.lat*Math.PI/180)),y:-p.lat});
 const mapped=points.map(project),minX=Math.min(...mapped.map(p=>p.x)),maxX=Math.max(...mapped.map(p=>p.x)),minY=Math.min(...mapped.map(p=>p.y)),maxY=Math.max(...mapped.map(p=>p.y));
 const width=Math.max(280,(document.querySelector<HTMLElement>('[data-running-lab]')?.clientWidth||innerWidth)-40),height=innerWidth<=600?300:350,padding=35;
 const scale=Math.min((width-padding*2)/(maxX-minX||.00001),(height-padding*2)/(maxY-minY||.00001));
 const xy=(p:any)=>{const q=project(p);return {x:width/2+(q.x-(minX+maxX)/2)*scale,y:height/2+(q.y-(minY+maxY)/2)*scale};};
 const wrapper=el('div'),svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':'Локална GPS схема с начало, край, километри и избран участък. Щракни близо до трасето за измерена точка. Север нагоре; без външна карта.','data-local-map':''});
 function path(range:[number,number]|null=null){let data='',previous:any;for(const p of samples){if(p.lat===null||p.lon===null||range&&(p.d<range[0]||p.d>range[1])){previous=null;continue;}const q=xy(p);data+=(previous&&previous.run===p.run?'L':'M')+q.x.toFixed(2)+' '+q.y.toFixed(2);previous=p;}return data;}
 if(options.colouring)for(const line of routeLines(samples,options.colouring)){const data=line.points.map((p:any,i:number)=>{const q=xy(p);return `${i?'L':'M'}${q.x.toFixed(2)} ${q.y.toFixed(2)}`;}).join('');svg.append(svgNode('path',{d:data,stroke:line.style.color,'stroke-width':3.2,fill:'none','data-route-colour':line.style.key,...(line.style.dashed?{'stroke-dasharray':'6 4'}:{})}));}
 else svg.append(svgNode('path',{d:path(),stroke:'#64b8df','stroke-width':2.8,fill:'none'}));
 const selected=svgNode('path',{d:'',stroke:'#ffb35c','stroke-width':5,fill:'none','data-route-selection':''});svg.append(selected);
 const occupied=new Set<string>(),count=Math.floor(samples.at(-1).d/1000),stride=Math.max(1,Math.ceil(count/18));
 for(let km=1;km<=count;km+=stride){const p=nearest(samples,km*1000);if(!p||p.lat===null||p.lon===null)continue;const q=xy(p),group=svgNode('g',{role:'button',tabindex:0,'aria-label':`Покажи километър ${km}`,'data-route-km':km});
  group.append(svgNode('circle',{cx:q.x,cy:q.y,r:13,fill:'transparent',stroke:'none'}),svgNode('circle',{cx:q.x,cy:q.y,r:4,fill:'#132940',stroke:'#c2e5f8','stroke-width':1.5}));
  const cell=`${Math.round(q.x/30)}:${Math.round(q.y/25)}`;if(!occupied.has(cell)){occupied.add(cell);svgLabel(group,q.x+7,q.y-7,String(km));}
  const title=svgNode('title');title.textContent=`Километър ${km}; приблизителна позиция от графичната серия`;group.append(title);
  group.addEventListener('click',event=>{event.stopPropagation();options.onCursor?.(p);});group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();options.onCursor?.(p);}});svg.append(group);
 }
 const start=xy(points[0]),end=xy(points.at(-1));
 svg.append(svgNode('circle',{cx:start.x,cy:start.y,r:9,fill:'#132b27',stroke:'#63e4ad','stroke-width':3,'data-route-start':''}),svgNode('rect',{x:end.x-5,y:end.y-5,width:10,height:10,fill:'#ffad63',stroke:'#132940','stroke-width':1.5,'data-route-end':''}));
 svgLabel(svg,start.x+13,start.y+5,'С');if(Math.hypot(end.x-start.x,end.y-start.y)>24)svgLabel(svg,end.x+10,end.y+5,'Ф');
 if(options.finishTime){const point=nearestTime(samples,options.finishTime);if(point&&point.lat!==null&&point.lon!==null){const p=xy(point);svg.append(svgNode('path',{d:`M${p.x} ${p.y-9}l9 9l-9 9l-9-9Z`,fill:'#ffe09c',stroke:'#101f30','stroke-width':2,'data-route-finish':''}));svgLabel(svg,p.x+12,p.y-11,'Ръчен финал');}}
 const cursor=svgNode('circle',{r:5,cx:start.x,cy:start.y,fill:'#ffad5c',stroke:'#fff','stroke-width':2,'data-lab-map-cursor':''});svg.append(cursor);svgLabel(svg,18,22,'Север ↑');
 const scaleWidth=1000/111195.08*scale;if(scaleWidth<width-60){svg.append(svgNode('line',{x1:18,x2:18+scaleWidth,y1:height-20,y2:height-20,stroke:'#c2d8ef','stroke-width':2}));svgLabel(svg,18,height-29,'1 км');}
 const legend=el('p','С · начало (зелено), Ф · край на целия запис (оранжево). Дебела оранжева линия · избран диапазон. При застъпване част от км надписите са разредени.','lab-map-legend');wrapper.append(svg,legend);
 if(options.onPick){svg.style.cursor='crosshair';svg.addEventListener('click',event=>{
  const q=localPointer(svg,event),projectionX=(q.x-width/2)/scale+(minX+maxX)/2,projectionY=(q.y-height/2)/scale+(minY+maxY)/2;
  const position={lat:-projectionY,lon:((base.lon+projectionX/Math.max(.01,Math.cos(base.lat*Math.PI/180))+540)%360)-180},pixelLimit=event instanceof PointerEvent&&event.pointerType==='touch'?26:18;
  const screenScale=svg.getScreenCTM()?.a||1;
  options.onPick!(position,Math.min(150,pixelLimit/screenScale/scale*111195.0802),point=>{const p=xy(point);return Math.hypot(p.x-q.x,p.y-q.y)*screenScale;},pixelLimit);
 });}
 const setRange=(range:[number,number]|null)=>selected.setAttribute('d',range?path(range):'');setRange(options.range||null);
 return {node:wrapper,setRange,update:(p:any)=>{if(!p||p.lat===null||p.lon===null)return;const q=xy(p);cursor.setAttribute('cx',String(q.x));cursor.setAttribute('cy',String(q.y));}};
}
