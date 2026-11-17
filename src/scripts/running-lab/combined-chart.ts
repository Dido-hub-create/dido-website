import {el,num,pace} from './dom';
import {svgNode,svgLabel,localPointer,chartId,fontScale} from './svg';
import {chartValues,nearest,nearestTime} from './chart-data';
import {visualScale,axisTicks} from '../../lib/running-lab/chart-scale.mjs';
import {reliefValues,reliefAt} from '../../lib/running-lab/relief-view.mjs';
import {pointData} from '../../lib/running-lab/point-data.mjs';

export interface CombinedOptions {
 analysis:any;metrics:string[];mode:'overlay'|'lanes';axis:'time'|'distance';domain:[number,number];width:number;heightBudget?:number;allValues:boolean;
 onCursor:(x:number)=>void;onRange:(start:number,end:number)=>void;
 markers?:{x:number;label:string;finish?:boolean}[];
}
const COLORS:Record<string,string>={pace:'#ff9d40',hr:'#f284a6',cad:'#b5a2ff',elevation:'#b0cfba'};
export function combinedChart(options:CombinedOptions){
 const {analysis:a,domain:[minX,maxX]}=options,node=el('figure',undefined,'lab-chart-card lab-combined-chart'),id=chartId();node.dataset.combinedChart='';node.dataset.chartMode=options.mode;
 const font=fontScale(),width=Math.max(230,options.width),overlay=options.mode==='overlay',n=options.metrics.length,slot=50*font;
 const left=overlay?Math.ceil(n/2)*slot+8:Math.max(56,font*49),right=overlay?Math.floor(n/2)*slot+8:16,bottom=35*font,multiline=width<420||font>1.5;
 const top=overlay?42*font:8*font,preferred=Math.max((multiline?104:88)*font,n===1?168:n===2?104:88);
 const laneHeight=options.heightBudget?Math.max((multiline?104:76)*font,Math.min(preferred,(options.heightBudget-top-bottom)/Math.max(1,n))):preferred;
 const height=overlay?Math.max(top+140*font+bottom,options.heightBudget||290*font):top+laneHeight*n+bottom;
 let updateCursor=(_x:number,_point?:any)=>{},updateSelection=(_range:[number,number]|null)=>{};
 if(!n||!(maxX>minX)){
  node.append(el('p','Включи наличен показател, за да разгледаш графиката.','lab-empty'));
  return {card:node,update:updateCursor,setSelection:updateSelection};
 }
 const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'group',tabindex:0,'aria-label':`${overlay?'Обща графика':'Отделни графики'} с отделна физическа скала за всеки показател. Стрелки и Home/End избират измерване; плъзгане избира диапазон.`,'aria-describedby':'lab-point-readout','data-combined-svg':''});svg.style.height=`${height}px`;
 svg.dataset.xMin=String(minX);svg.dataset.xMax=String(maxX);svg.dataset.plotLeft=String(left);svg.dataset.plotRight=String(right);
 const plotWidth=Math.max(30,width-left-right),x=(v:number)=>left+(v-minX)/(maxX-minX)*plotWidth,defs=svgNode('defs');svg.append(defs);let clipped=0;
 if(overlay)for(let i=0;i<=4;i++){const yy=top+(height-bottom-top)*i/4;svg.append(svgNode('line',{x1:left,x2:width-right,y1:yy,y2:yy,stroke:'#35506b','stroke-width':1}));}
 // Paint the checked relief first, underneath every sensor line.
 const order=options.metrics.map((metric,index)=>({metric,index})).sort((p,q)=>Number(q.metric==='elevation')-Number(p.metric==='elevation'));
 for(const {metric,index}of order){
  const terrain=metric==='elevation',unit=terrain?'м':metric==='pace'?'мин/км':metric==='hr'?'уд./мин':a.cadenceDisplay?.unit||'отчетени ед./мин';
  const title=terrain?'Релеф':metric==='pace'?'Темпо':metric==='hr'?'Пулс':'Каданс';
  const points=(terrain?reliefValues(a,options.axis):chartValues(a,metric,options.axis)).filter((p:any)=>p.x>=minX&&p.x<=maxX);
  const scale=visualScale(points,{mode:options.allValues?'all':'typical',metric});
  const lane=svgNode('g',{'data-combined-lane':metric,'data-unit':unit,'data-shared-area':String(overlay)}),laneTop=overlay?top:top+index*laneHeight,plotTop=overlay?top:laneTop+(multiline?35:22)*font,plotBottom=overlay?height-bottom:laneTop+laneHeight-8*font;
  if(!overlay){const label=svgLabel(lane,8,laneTop+13*font,multiline?title:`${title} · ${unit}`);label.style.fill=COLORS[metric];if(multiline)svgLabel(lane,8,laneTop+27*font,unit==='отчетени ед./мин'?'отч. ед./мин':unit);}
  const isLeft=index%2===0,offset=Math.floor(index/2)*slot,axisX=isLeft?left-offset:width-right+offset,labelX=axisX+(isLeft?-7:7)*font,anchor=isLeft?'end':'start';
  if(overlay){const xx=axisX+(isLeft?-slot/2:slot/2);for(const [yy,text]of [[14*font,title],[29*font,metric==='cad'?(unit==='стъпки/мин'?'ст./мин':'отч./мин'):unit]]as const){const label=svgLabel(lane,xx,yy,text,'middle');label.style.fill=COLORS[metric];if(yy===29*font)label.style.fontSize='.6875rem';}lane.append(svgNode('line',{x1:axisX,x2:axisX,y1:plotTop,y2:plotBottom,stroke:COLORS[metric],'stroke-width':1}));}
  if(!scale){svgLabel(lane,left,plotTop+20,'Няма данни');svg.append(lane);continue;}
  lane.dataset.yMin=String(scale.min);lane.dataset.yMax=String(scale.max);lane.dataset.plotTop=String(plotTop);lane.dataset.plotBottom=String(plotBottom);
  const y=(value:number)=>plotTop+(metric==='pace'?(value-scale.min):(scale.max-value))/(scale.max-scale.min)*(plotBottom-plotTop);
  for(const tick of axisTicks(scale.min,scale.max,overlay?3:2,metric)){
   const yy=y(tick);
   lane.append(overlay?svgNode('line',{x1:axisX-3,x2:axisX+3,y1:yy,y2:yy,stroke:COLORS[metric]}):svgNode('line',{x1:left,x2:width-right,y1:yy,y2:yy,stroke:'#35506b','stroke-width':1}));
   const label=svgLabel(lane,overlay?labelX:left-8,yy+4*font,metric==='pace'?pace(tick).replace(' /км',''):num(tick,0),overlay?anchor:'end');if(overlay)label.style.fill=COLORS[metric];
  }
  const clip=svgNode('clipPath',{id:`${id}-${metric}`});clip.append(svgNode('rect',{x:left,y:plotTop,width:plotWidth,height:plotBottom-plotTop}));defs.append(clip);
  let path='',area='',previous:any=null,startX=0,lastX=0;
  const closeArea=()=>{if(previous)area+=`L${lastX} ${plotBottom}L${startX} ${plotBottom}Z`;};
  for(const p of points){
   if(p.y===null||!Number.isFinite(p.y)||!Number.isFinite(p.x)){closeArea();previous=null;continue;}
   const xx=x(p.x).toFixed(2),yy=y(p.y).toFixed(2),connected=previous&&previous.run===p.run;
   if(!connected){closeArea();startX=Number(xx);area+=`M${xx} ${plotBottom}L${xx} ${yy}`;}else area+=`L${xx} ${yy}`;
   path+=(connected?'L':'M')+xx+' '+yy;lastX=Number(xx);previous=p;
  }closeArea();
  if(terrain)lane.append(svgNode('path',{d:area,fill:COLORS.elevation,'fill-opacity':.24,stroke:'none','clip-path':`url(#${id}-${metric})`,'data-combined-relief':''}));
  lane.append(svgNode('path',{d:path,fill:'none',stroke:COLORS[metric],'stroke-width':terrain?1.2:2.1,'stroke-opacity':terrain?.6:1,'stroke-linejoin':'round','clip-path':`url(#${id}-${metric})`,'data-combined-line':metric}));
  for(const p of points){if(p.y===null||!Number.isFinite(p.y)||p.y>=scale.min&&p.y<=scale.max)continue;clipped++;const xx=x(p.x),yy=y(p.y)<plotTop?plotTop:plotBottom,up=yy===plotTop;lane.append(svgNode('path',{d:`M${xx-3} ${yy+(up?5:-5)}L${xx} ${yy}L${xx+3} ${yy+(up?5:-5)}Z`,fill:COLORS[metric],'data-combined-outlier':''}));}
  svg.append(lane);
 }
 const count=Math.max(1,Math.min(4,Math.floor(plotWidth/(75*font))));
 for(let i=0;i<=count;i++){const value=minX+(maxX-minX)*i/count;svgLabel(svg,x(value),height-17*font,num(value,1),i===0?'start':i===count?'end':'middle');}
 svgLabel(svg,width-right,height-2,options.axis==='time'?'изминало време · мин':'дистанция · км','end');
 for(const marker of options.markers||[]){if(marker.x<minX||marker.x>maxX)continue;const line=svgNode('line',{x1:x(marker.x),x2:x(marker.x),y1:top,y2:height-bottom,stroke:'#ffe09c','stroke-width':2,'stroke-dasharray':'6 3','data-combined-finish':''}),label=svgNode('title');label.textContent=marker.label;line.append(label);svg.append(line);}
 const selected=svgNode('rect',{x:left,y:top,width:0,height:height-top-bottom,fill:'#ff9d4022','pointer-events':'none','data-combined-selection':''}),cursor=svgNode('line',{x1:left,x2:left,y1:top,y2:height-bottom,class:'lab-cursor-line','data-combined-cursor':''});svg.append(selected,cursor);node.append(svg);
 const relief=options.metrics.includes('elevation'),readout=el('output',undefined,'lab-relief-readout');readout.dataset.combinedReadout='';
 if(relief){readout.setAttribute('aria-label','Показатели в избраната GPS точка');node.append(readout);}
 node.append(el('figcaption',`${overlay?'Независими скали; пресичане на линии ≠ равни стойности.':'Отделна скала за всяка величина.'} Темпо: по-бързо ↑.${relief?` Релеф: дистанционно изглаждане ${a.elevation.windowM} м; оценка, не промяна на оригинала.`:''}${clipped?` ${clipped} измервания извън скалата са означени с триъгълници.`:''}`));
 const coordinate=(event:PointerEvent)=>Math.max(minX,Math.min(maxX,minX+(localPointer(svg,event).x-left)/plotWidth*(maxX-minX)));
 let start:number|null=null,last=minX,selectionValue:[number,number]|null=null;
 updateCursor=(value,measured)=>{
  last=Math.max(minX,Math.min(maxX,value));cursor.setAttribute('visibility',Number.isFinite(value)&&value>=minX&&value<=maxX?'visible':'hidden');cursor.setAttribute('x1',String(x(last)));cursor.setAttribute('x2',String(x(last)));svg.dataset.cursorX=String(value);
  if(relief){const p=measured||(options.axis==='time'?nearestTime(a.samples,a.stats.start+value*60000):nearest(a.samples,value*1000));if(p){const d=pointData(a,p),z=reliefAt(a,p),text=`${num(p.d/1000,2)} км · ${d.pace===null?'Няма темпо':pace(d.pace)} · ${d.heart===null?'Няма пулс':num(d.heart)+' уд./мин'} · ${d.cadence===null?'Няма каданс':num(d.cadence)+' '+d.cadenceUnit} · Релеф: ${z===null?'Няма данни':num(z,1)+' м'} (изгладен)`;if(readout.textContent!==text)readout.textContent=text;readout.dataset.distance=String(p.d);readout.dataset.elevation=String(z??'');}}
 };
 updateSelection=range=>{const first=range?Math.max(minX,Math.min(maxX,range[0])):minX,end=range?Math.max(minX,Math.min(maxX,range[1])):minX;selected.setAttribute('x',String(x(first)));selected.setAttribute('width',String(Math.max(0,x(end)-x(first))));};
 svg.addEventListener('pointerdown',event=>{start=coordinate(event);last=start;svg.setPointerCapture(event.pointerId);options.onCursor(last);});
 svg.addEventListener('pointermove',event=>{last=coordinate(event);options.onCursor(last);if(start!==null)updateSelection([Math.min(start,last),Math.max(start,last)]);});
 svg.addEventListener('pointerup',()=>{if(start!==null&&Math.abs(last-start)>(maxX-minX)*.01)options.onRange(Math.min(start,last),Math.max(start,last));start=null;});
 svg.addEventListener('pointercancel',()=>{start=null;updateSelection(selectionValue);});
 svg.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();last=event.key==='Home'?minX:event.key==='End'?maxX:Math.max(minX,Math.min(maxX,last+(event.key==='ArrowRight'?1:-1)*(maxX-minX)/100));options.onCursor(last);});
 return {card:node,update:updateCursor,setSelection:(range:[number,number]|null)=>{selectionValue=range;updateSelection(range);}};
}
