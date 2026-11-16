import {el,num} from './dom';
const NS='http://www.w3.org/2000/svg';
function svgNode(tag:string,attributes:Record<string,string|number>={}){const node=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));return node;}
function label(svg:Element,x:number,y:number,text:string,anchor='start'){const node=svgNode('text',{x,y,'text-anchor':anchor});node.textContent=text;svg.append(node);}
interface GraphOptions {title:string;unit:string;points:{x:number;y:number|null;run?:number}[];color:string;inverse?:boolean;format?:(value:number)=>string;axis:string;domain?:[number,number];markers?:{x:number;label:string;lap?:boolean}[];onCursor?:(x:number)=>void;onRange?:(a:number,b:number)=>void}
export function lineChart(options:GraphOptions){
 const card=el('div',undefined,'lab-chart-card');card.append(el('h3',options.title));const valid=options.points.filter(p=>p.y!==null&&Number.isFinite(p.y));
 if(valid.length<2||options.points.at(-1)?.x===options.points[0]?.x){card.append(el('p','Няма достатъчно отчетени данни или измерима хоризонтална ос.'));return {card,update:()=>{}};}
 const width=Math.max(300,(document.querySelector<HTMLElement>('[data-running-lab]')?.clientWidth||innerWidth)-32),height=innerWidth<=600?190:210,left=55,right=18,top=16,bottom=38,plotW=width-left-right,plotH=height-top-bottom;
 const minX=options.domain?.[0]??options.points[0].x,maxX=options.domain?.[1]??options.points.at(-1)!.x;
 let minY=valid.reduce((n,p)=>Math.min(n,p.y!),Infinity),maxY=valid.reduce((n,p)=>Math.max(n,p.y!),-Infinity);const padding=Math.max((maxY-minY)*.08,options.inverse?5:options.unit.includes('bpm')?3:2.5);minY=Math.max(options.inverse?0:-Infinity,minY-padding);maxY+=padding;
 const x=(value:number)=>left+(value-minX)/(maxX-minX||1)*plotW,y=(value:number)=>top+(options.inverse?(value-minY):(maxY-value))/(maxY-minY||1)*plotH;
 const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`${options.title}: ${options.unit}; ${options.axis}`,tabindex:0});
 const ticks=5;for(let i=0;i<=ticks;i++){const value=minY+(maxY-minY)*i/ticks,yy=y(value);svg.append(svgNode('line',{x1:left,x2:width-right,y1:yy,y2:yy,stroke:'#2c425b','stroke-width':1}));label(svg,left-8,yy+4,options.format?options.format(value):num(value,0),'end');}
 for(let i=0;i<=5;i++){const value=minX+(maxX-minX)*i/5;label(svg,x(value),height-16,num(value,1),i===0?'start':i===5?'end':'middle');}label(svg,width-right,height-1,options.axis,'end');
 const markers=(options.markers||[]).filter(marker=>marker.x>=minX&&marker.x<=maxX);const stride=Math.max(1,Math.ceil(markers.length/30));
 markers.filter((marker,i)=>marker.lap||i%stride===0).slice(0,80).forEach(marker=>{svg.append(svgNode('line',{x1:x(marker.x),x2:x(marker.x),y1:top,y2:height-bottom,stroke:marker.lap?'#ffab58':'#7794b1','stroke-width':marker.lap?1.2:.7,'stroke-dasharray':marker.lap?'5 3':'2 4',opacity:.5}));if(marker.lap)label(svg,x(marker.x)+3,top+12,marker.label);});
 let path='',previous:any;for(const p of options.points){if(p.y===null||!Number.isFinite(p.y)){previous=null;continue;}path+=(previous&&previous.run===p.run?'L':'M')+x(p.x).toFixed(2)+' '+y(p.y).toFixed(2);previous=p;}
 svg.append(svgNode('path',{d:path,fill:'none',stroke:options.color,'stroke-width':2.1,'stroke-linejoin':'round'}));
 const selection=svgNode('rect',{x:left,y:top,width:0,height:plotH,fill:'#ff851025'}),cursor=svgNode('line',{x1:left,x2:left,y1:top,y2:height-bottom,class:'lab-cursor-line'});svg.append(selection,cursor);card.append(svg,el('p',`${options.unit} · собствена вертикална скала · ${options.inverse?'по-бързо ↑':'стойностите не започват непременно от 0'}`));
 const coordinate=(event:PointerEvent)=>{const box=svg.getBoundingClientRect();return Math.max(minX,Math.min(maxX,minX+((event.clientX-box.left)/box.width*width-left)/plotW*(maxX-minX)));};
 let start:number|null=null,last=minX;
 svg.addEventListener('pointerdown',event=>{const e=event as PointerEvent;start=coordinate(e);last=start;svg.setPointerCapture(e.pointerId);options.onCursor?.(last);});
 svg.addEventListener('pointermove',event=>{const e=event as PointerEvent;last=coordinate(e);options.onCursor?.(last);if(start!==null){selection.setAttribute('x',String(x(Math.min(start,last))));selection.setAttribute('width',String(Math.abs(x(last)-x(start))));}});
 svg.addEventListener('pointerup',()=>{if(start!==null&&Math.abs(last-start)>(maxX-minX)*.01)options.onRange?.(Math.min(start,last),Math.max(start,last));start=null;});
 svg.addEventListener('pointercancel',()=>{start=null;});svg.addEventListener('keydown',event=>{const e=event as KeyboardEvent;if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();last=e.key==='Home'?minX:e.key==='End'?maxX:Math.max(minX,Math.min(maxX,last+(e.key==='ArrowRight'?1:-1)*(maxX-minX)/100));options.onCursor?.(last);});
 return {card,update:(value:number)=>{const xx=x(Math.max(minX,Math.min(maxX,value)));cursor.setAttribute('x1',String(xx));cursor.setAttribute('x2',String(xx));}};
}
export function routeMap(samples:any[]){
 const points=samples.filter(p=>p.lat!==null&&p.lon!==null);if(points.length<2)return {node:el('p','Файлът няма GPS геометрия. Времевият и сензорният анализ остават достъпни.'),update:(_point:any)=>{}};
 const base=points[0],project=(p:any)=>({x:(((p.lon-base.lon+540)%360)-180)*Math.max(.01,Math.cos(base.lat*Math.PI/180)),y:-p.lat});
 const mapped=points.map(project),minX=Math.min(...mapped.map(p=>p.x)),maxX=Math.max(...mapped.map(p=>p.x)),minY=Math.min(...mapped.map(p=>p.y)),maxY=Math.max(...mapped.map(p=>p.y));
 const width=Math.max(300,(document.querySelector<HTMLElement>('[data-running-lab]')?.clientWidth||innerWidth)-40),height=innerWidth<=600?260:320;
 const scale=Math.min((width-40)/(maxX-minX||.00001),(height-40)/(maxY-minY||.00001));const xy=(p:any)=>{const q=project(p);return {x:width/2+(q.x-(minX+maxX)/2)*scale,y:height/2+(q.y-(minY+maxY)/2)*scale};};
 const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':'Локално начертана GPS геометрия, север нагоре; без външна фонова карта'});let d='',previous:any;
 for(const p of samples){if(p.lat===null||p.lon===null){previous=null;continue;}const q=xy(p);d+=(previous&&previous.run===p.run?'L':'M')+q.x.toFixed(2)+' '+q.y.toFixed(2);previous=p;}svg.append(svgNode('path',{d,stroke:'#5ab6df','stroke-width':2.5,fill:'none'}));
 const marker=svgNode('circle',{r:5,cx:xy(base).x,cy:xy(base).y,'data-lab-map-cursor':''});svg.append(marker);label(svg,25,24,'N ↑');
 const metres=1000,scaleWidth=metres/111195.08*scale;if(scaleWidth<width-60){svg.append(svgNode('line',{x1:25,x2:25+scaleWidth,y1:height-24,y2:height-24,stroke:'#c2d8ef','stroke-width':2}));label(svg,25,height-33,'1 km');}
 return {node:svg,update:(p:any)=>{if(p?.lat===null||p?.lon===null)return;const q=xy(p);marker.setAttribute('cx',String(q.x));marker.setAttribute('cy',String(q.y));}};
}
export function chartValues(analysis:any,key:string,axis:string){
 const samples=key==='elevation'?analysis.elevation.samples.map((p:any)=>({...p,z:p.ele,t:nearest(analysis.samples,p.d)?.t})):analysis.samples;
 return samples.map((p:any)=>({x:axis==='time'?(p.t-analysis.stats.start)/60000:p.d/1000,y:key==='elevation'?p.z:p[key],run:p.run}));
}
export function nearest(samples:any[],distance:number){let lo=0,hi=samples.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(samples[mid].d<=distance)lo=mid;else hi=mid;}return Math.abs(samples[lo].d-distance)<=Math.abs(samples[hi].d-distance)?samples[lo]:samples[hi];}
