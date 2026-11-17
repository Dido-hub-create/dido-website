import {el,num} from './dom';
import {svgNode,svgLabel,localPointer,chartId,fontScale} from './svg';
import {visualScale,axisTicks} from '../../lib/running-lab/chart-scale.mjs';
export interface PlotPoint {x:number;y:number|null;run?:number}
export interface ChartState {expanded:boolean;scale:'typical'|'all'}
interface PlotSeries {title:string;unit:string;points:PlotPoint[];color:string;metric?:string;inverse?:boolean;format?:(value:number)=>string}
export interface GraphOptions extends PlotSeries {
 key?:string;primaryTitle?:string;axis:string;domain?:[number,number];state?:ChartState;secondary?:PlotSeries;zeroLine?:boolean;
 markers?:{x:number;label:string;lap?:boolean;finish?:boolean}[];
 onCursor?:(x:number)=>void;onRange?:(a:number,b:number)=>void;
}
export function lineChart(options:GraphOptions){
 const state=options.state||{expanded:false,scale:'typical'},id=chartId(),card=el('figure',undefined,'lab-chart-card');
 card.dataset.chartKey=options.key||options.metric||'generic';
 const head=el('div',undefined,'lab-chart-heading'),title=el('h3',options.title),controls=el('div',undefined,'lab-chart-tools');
 const expand=el('button'),all=el('button');expand.type=all.type='button';expand.dataset.chartExpand='';all.dataset.chartScale='';
 expand.setAttribute('aria-controls',id);expand.setAttribute('aria-label',`Разгъни графиката „${options.title}“`);controls.append(all,expand);head.append(title,controls);
 const plot=el('div',undefined,'lab-chart-plot'),caption=el('figcaption'),legend=el('p',undefined,'lab-chart-legend');
 if(options.secondary){legend.textContent=`Лява скала: ${options.primaryTitle||options.title} (${options.unit}), плътна линия. Дясна скала: ${options.secondary.title} (${options.secondary.unit}), прекъсната линия.`;}
 card.append(head,legend,plot,caption);legend.hidden=!options.secondary;
 let cursorValue:number|undefined,selectionValue:[number,number]|null=null,updateCursor=(_x:number)=>{},updateSelection=(_range:[number,number]|null)=>{};
 function draw(){
  plot.replaceChildren();caption.replaceChildren();
  expand.textContent=state.expanded?'Свий':'Разгъни';expand.setAttribute('aria-expanded',String(state.expanded));expand.setAttribute('aria-label',`${state.expanded?'Свий':'Разгъни'} графиката „${options.title}“`);
  all.textContent=state.scale==='all'?'Автоматичен диапазон':'Покажи всички стойности';all.setAttribute('aria-pressed',String(state.scale==='all'));
  const valid=options.points.filter(p=>Number.isFinite(p.x)&&p.y!==null&&Number.isFinite(p.y)),first=options.points[0],lastPoint=options.points.at(-1);
  const minX=options.domain?.[0]??first?.x??NaN,maxX=options.domain?.[1]??lastPoint?.x??NaN;
  if(valid.length<2||!Number.isFinite(minX)||!Number.isFinite(maxX)||maxX<=minX){
   plot.append(el('p','Няма достатъчно надеждни измервания за тази графика.','lab-muted'));expand.disabled=all.disabled=true;updateCursor=()=>{};updateSelection=()=>{};return;
  }
  expand.disabled=all.disabled=false;
  const scale=fontScale(),width=Math.max(280,(document.querySelector<HTMLElement>('[data-running-lab]')?.clientWidth||innerWidth)-32);
  const height=(state.expanded?(innerWidth<=600?340:390):(innerWidth<=600?225:270))+Math.round((scale-1)*45);
  const left=Math.max(56,scale*48),right=options.secondary?Math.max(56,scale*48):Math.max(20,scale*14),top=25*scale,bottom=42*scale,plotW=width-left-right,plotH=height-top-bottom;
  const primary=visualScale(options.points,{mode:state.scale,metric:options.metric,includeZero:options.zeroLine})!;
  const second=options.secondary?visualScale(options.secondary.points,{mode:state.scale,metric:options.secondary.metric}):null;
  const x=(value:number)=>left+(value-minX)/Math.max(1e-9,maxX-minX)*plotW;
  const makeY=(s:any,inverse=false)=>(value:number)=>top+(inverse?(value-s.min):(s.max-value))/(s.max-s.min)*plotH;
  const y=makeY(primary,options.inverse),svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img',id,tabindex:0,'aria-label':`${options.title}: ${options.unit}; ${options.axis}${options.secondary?`; дясна скала ${options.secondary.title}: ${options.secondary.unit}`:''}`});
  svg.style.height=`${height}px`;svg.dataset.yMin=String(primary.min);svg.dataset.yMax=String(primary.max);svg.dataset.xMin=String(minX);svg.dataset.xMax=String(maxX);
  const defs=svgNode('defs'),clip=svgNode('clipPath',{id:id+'-clip'});clip.append(svgNode('rect',{x:left,y:top,width:plotW,height:plotH}));defs.append(clip);svg.append(defs);
  for(const value of axisTicks(primary.min,primary.max,scale>1.5?4:5,options.metric)){
   const yy=y(value);svg.append(svgNode('line',{x1:left,x2:width-right,y1:yy,y2:yy,stroke:'#304962','stroke-width':1}));
   svgLabel(svg,left-9,yy+4*scale,options.format?options.format(value):num(value,options.metric==='grade'?1:0),'end');
  }
  if(options.zeroLine&&primary.min<=0&&primary.max>=0)svg.append(svgNode('line',{x1:left,x2:width-right,y1:y(0),y2:y(0),stroke:'#e6effb','stroke-width':1.4,'stroke-dasharray':'6 4','data-zero-line':''}));
  const xTicks=Math.max(1,Math.min(width<500||scale>1.5?3:5,Math.floor(plotW/(70*scale))));
  for(let i=0;i<=xTicks;i++){const value=minX+(maxX-minX)*i/xTicks;svgLabel(svg,x(value),height-19*scale,num(value,1),i===0?'start':i===xTicks?'end':'middle');}
  svgLabel(svg,width-right,height-2,options.axis,'end');
  const markers=(options.markers||[]).filter(marker=>Number.isFinite(marker.x)&&marker.x>=minX&&marker.x<=maxX).sort((a,b)=>a.x-b.x),stride=Math.max(1,Math.ceil(markers.length/30));let lastLabel=-Infinity;
  markers.filter((marker,i)=>marker.finish||marker.lap||i%stride===0).slice(0,80).forEach(marker=>{
   svg.append(svgNode('line',{x1:x(marker.x),x2:x(marker.x),y1:top,y2:height-bottom,stroke:marker.finish?'#ffe09c':marker.lap?'#ffad63':'#809ab8','stroke-width':marker.finish?2:1,'stroke-dasharray':marker.finish?'8 3':marker.lap?'5 3':'2 5',opacity:marker.finish?1:.5}));
   if(marker.finish||marker.lap&&x(marker.x)-lastLabel>65*scale){svgLabel(svg,Math.max(left,Math.min(width-right-60*scale,x(marker.x)+4)),marker.finish?top+13*scale:top-7,marker.label);lastLabel=x(marker.x);}
  });
  const selection=svgNode('rect',{x:left,y:top,width:0,height:plotH,fill:'#ff9d4022','pointer-events':'none'});svg.append(selection);
  function series(points:PlotPoint[],color:string,yy:(value:number)=>number,s:any,dashed=false){
   const group=svgNode('g',{'clip-path':`url(#${id}-clip)`});let path='',previous:PlotPoint|null=null;
   for(const p of points){if(p.y===null||!Number.isFinite(p.y)||!Number.isFinite(p.x)){previous=null;continue;}path+=(previous&&previous.run===p.run?'L':'M')+x(p.x).toFixed(2)+' '+yy(p.y).toFixed(2);previous=p;}
   group.append(svgNode('path',{d:path,fill:'none',stroke:color,'stroke-width':2.2,'stroke-linejoin':'round',...(dashed?{'stroke-dasharray':'7 4'}:{})}));svg.append(group);
   for(const p of points){if(p.y===null||!Number.isFinite(p.y)||!Number.isFinite(p.x)||p.y>=s.min&&p.y<=s.max)continue;const xx=x(p.x);if(xx<left||xx>width-right)continue;
    const pos=yy(p.y)<top?top:height-bottom,up=pos===top,triangle=svgNode('path',{d:`M${xx-4} ${pos+(up?6:-6)}L${xx} ${pos}L${xx+4} ${pos+(up?6:-6)}Z`,fill:color,'data-chart-outlier':''});
    const hint=svgNode('title');hint.textContent=`Извън видимата скала: ${num(p.y,2)}`;triangle.append(hint);svg.append(triangle);
   }
  }
  series(options.points,options.color,y,primary);
  if(options.secondary&&second){const secondary=options.secondary,yy=makeY(second,secondary.inverse);for(const value of axisTicks(second.min,second.max,scale>1.5?4:5,secondary.metric))svgLabel(svg,width-right+9,yy(value)+4*scale,secondary.format?secondary.format(value):num(value,0));series(secondary.points,secondary.color,yy,second,true);}
  const cursor=svgNode('line',{x1:left,x2:left,y1:top,y2:height-bottom,class:'lab-cursor-line'});svg.append(cursor);plot.append(svg);
  const clipped=primary.above+primary.below+(second?second.above+second.below:0);
  svg.dataset.clipped=String(clipped);
  caption.append(el('p',`${options.unit} · ${options.inverse?'по-бързо ↑ · ':''}собствена вертикална скала${options.secondary?' за всяка величина':''}.`));
  if(options.metric==='grade')caption.append(el('p','Наклонът е централна дистанционна разлика върху изгладения височинен профил. Положителен = нагоре; отрицателен = надолу. Бялата прекъсната линия е 0%.'));
  if(clipped)caption.append(el('p',`${clipped} измервания са извън видимата скала и са означени с триъгълници. Реалните стойности остават в курсора, таблиците и анализа. „Покажи всички стойности“ възстановява пълния диапазон.`,'lab-scale-note'));
  const coordinate=(event:PointerEvent)=>Math.max(minX,Math.min(maxX,minX+(localPointer(svg,event).x-left)/plotW*(maxX-minX)));
  let start:number|null=null,last=cursorValue??minX;
  svg.addEventListener('pointerdown',event=>{start=coordinate(event);last=start;svg.setPointerCapture(event.pointerId);options.onCursor?.(last);});
  svg.addEventListener('pointermove',event=>{last=coordinate(event);options.onCursor?.(last);if(start!==null)updateSelection([Math.min(start,last),Math.max(start,last)]);});
  svg.addEventListener('pointerup',()=>{if(start!==null&&Math.abs(last-start)>(maxX-minX)*.01)options.onRange?.(Math.min(start,last),Math.max(start,last));start=null;});
  svg.addEventListener('pointercancel',()=>{start=null;updateSelection(selectionValue);});
  svg.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();last=event.key==='Home'?minX:event.key==='End'?maxX:Math.max(minX,Math.min(maxX,last+(event.key==='ArrowRight'?1:-1)*(maxX-minX)/100));options.onCursor?.(last);});
  updateCursor=value=>{const xx=x(Math.max(minX,Math.min(maxX,value)));cursor.setAttribute('x1',String(xx));cursor.setAttribute('x2',String(xx));};
  updateSelection=range=>{const a=range?Math.max(minX,Math.min(maxX,range[0])):minX,b=range?Math.max(minX,Math.min(maxX,range[1])):minX;selection.setAttribute('x',String(x(a)));selection.setAttribute('width',String(Math.max(0,x(b)-x(a))));};
  if(cursorValue!==undefined)updateCursor(cursorValue);updateSelection(selectionValue);
 }
 expand.addEventListener('click',()=>{state.expanded=!state.expanded;draw();});all.addEventListener('click',()=>{state.scale=state.scale==='all'?'typical':'all';draw();});draw();
 return {card,update:(x:number)=>{cursorValue=x;updateCursor(x);},setSelection:(range:[number,number]|null)=>{selectionValue=range;updateSelection(range);}};
}
