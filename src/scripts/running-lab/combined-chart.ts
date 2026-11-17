import {el,num,pace} from './dom';
import {svgNode,svgLabel,localPointer,chartId,fontScale} from './svg';
import {chartValues} from './chart-data';
import {visualScale,axisTicks} from '../../lib/running-lab/chart-scale.mjs';

export interface CombinedOptions {
 analysis:any;metrics:string[];axis:'time'|'distance';domain:[number,number];width:number;heightBudget?:number;allValues:boolean;
 onCursor:(x:number)=>void;onRange:(start:number,end:number)=>void;
 markers?:{x:number;label:string;finish?:boolean}[];
}
const COLORS:Record<string,string>={pace:'#ff9d40',hr:'#f284a6',cad:'#b5a2ff'};
export function combinedChart(options:CombinedOptions){
 const {analysis:a,domain:[minX,maxX]}=options,node=el('figure',undefined,'lab-chart-card lab-combined-chart'),id=chartId();node.dataset.combinedChart='';
 const font=fontScale(),width=Math.max(230,options.width),left=Math.max(56,font*49),right=16,bottom=35*font;
 const multiline=width<420||font>1.5;
 const top=8*font,preferred=Math.max((multiline?104:88)*font,options.metrics.length===1?168:options.metrics.length===2?104:88);
 const laneHeight=options.heightBudget?Math.max((multiline?104:76)*font,Math.min(preferred,(options.heightBudget-top-bottom)/Math.max(1,options.metrics.length))):preferred,height=top+laneHeight*options.metrics.length+bottom;
 let updateCursor=(_x:number)=>{},updateSelection=(_range:[number,number]|null)=>{};
 if(!options.metrics.length||!(maxX>minX)){
  node.append(el('p','Включи наличен показател, за да разгледаш графиката.','lab-empty'));
  return {card:node,update:updateCursor,setSelection:updateSelection};
 }
 const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'group',tabindex:0,'aria-label':'Комбинирана графика с отделна скала за всеки показател. Стрелки и Home/End избират измерване; плъзгане избира диапазон.','aria-describedby':'lab-point-readout','data-combined-svg':''});svg.style.height=`${height}px`;
 svg.dataset.xMin=String(minX);svg.dataset.xMax=String(maxX);
 const plotWidth=Math.max(30,width-left-right),x=(v:number)=>left+(v-minX)/(maxX-minX)*plotWidth;
 const defs=svgNode('defs');svg.append(defs);let clipped=0;
 for(const [index,metric]of options.metrics.entries()){
  const unit=metric==='pace'?'мин/км':metric==='hr'?'уд./мин':a.cadenceDisplay?.unit||'отчетени ед./мин';
  const title=metric==='pace'?'Темпо':metric==='hr'?'Пулс':'Каданс',points=chartValues(a,metric,options.axis).filter((p:any)=>p.x>=minX&&p.x<=maxX);
  const scale=visualScale(points,{mode:options.allValues?'all':'typical',metric});
  const lane=svgNode('g',{'data-combined-lane':metric,'data-unit':unit}),laneTop=top+index*laneHeight,plotTop=laneTop+(multiline?35:22)*font,plotBottom=laneTop+laneHeight-8*font;
  const titleNode=svgLabel(lane,8,laneTop+13*font,multiline?title:`${title} · ${unit}`);titleNode.style.fill=COLORS[metric];
  if(multiline)svgLabel(lane,8,laneTop+27*font,unit==='отчетени ед./мин'?'отч. ед./мин':unit);
  if(!scale){svgLabel(lane,left,plotTop+20,'Няма данни');svg.append(lane);continue;}
  lane.dataset.yMin=String(scale.min);lane.dataset.yMax=String(scale.max);
  const y=(value:number)=>plotTop+(metric==='pace'?(value-scale.min):(scale.max-value))/(scale.max-scale.min)*(plotBottom-plotTop);
  const ticks=axisTicks(scale.min,scale.max,2,metric);
  for(const tick of ticks){const yy=y(tick);lane.append(svgNode('line',{x1:left,x2:width-right,y1:yy,y2:yy,stroke:'#35506b','stroke-width':1}));svgLabel(lane,left-8,yy+4*font,metric==='pace'?pace(tick).replace(' /км',''):num(tick,0),'end');}
  const clip=svgNode('clipPath',{id:`${id}-${metric}`});clip.append(svgNode('rect',{x:left,y:plotTop,width:plotWidth,height:plotBottom-plotTop}));defs.append(clip);
  let path='',previous:any=null;
  for(const p of points){if(p.y===null||!Number.isFinite(p.y)){previous=null;continue;}path+=(previous&&previous.run===p.run?'L':'M')+x(p.x).toFixed(2)+' '+y(p.y).toFixed(2);previous=p;}
  lane.append(svgNode('path',{d:path,fill:'none',stroke:COLORS[metric],'stroke-width':2.1,'stroke-linejoin':'round','clip-path':`url(#${id}-${metric})`}));
  for(const p of points){if(p.y===null||!Number.isFinite(p.y)||p.y>=scale.min&&p.y<=scale.max)continue;clipped++;const xx=x(p.x),yy=y(p.y)<plotTop?plotTop:plotBottom,up=yy===plotTop;lane.append(svgNode('path',{d:`M${xx-3} ${yy+(up?5:-5)}L${xx} ${yy}L${xx+3} ${yy+(up?5:-5)}Z`,fill:COLORS[metric],'data-combined-outlier':''}));}
  svg.append(lane);
 }
 const count=Math.max(1,Math.min(4,Math.floor(plotWidth/(75*font))));
 for(let i=0;i<=count;i++){const value=minX+(maxX-minX)*i/count;svgLabel(svg,x(value),height-17*font,num(value,1),i===0?'start':i===count?'end':'middle');}
 svgLabel(svg,width-right,height-2,options.axis==='time'?'изминало време · мин':'дистанция · км','end');
 for(const marker of options.markers||[]){if(marker.x<minX||marker.x>maxX)continue;const line=svgNode('line',{x1:x(marker.x),x2:x(marker.x),y1:top,y2:height-bottom,stroke:'#ffe09c','stroke-width':2,'stroke-dasharray':'6 3','data-combined-finish':''}),label=svgNode('title');label.textContent=marker.label;line.append(label);svg.append(line);}
 const selected=svgNode('rect',{x:left,y:top,width:0,height:height-top-bottom,fill:'#ff9d4022','pointer-events':'none','data-combined-selection':''}),cursor=svgNode('line',{x1:left,x2:left,y1:top,y2:height-bottom,class:'lab-cursor-line','data-combined-cursor':''});svg.append(selected,cursor);node.append(svg);
 const caption=el('figcaption',`Отделна скала за всяка величина. Темпо: по-бързо ↑.${clipped?` ${clipped} графични измервания са извън скалата и са означени с триъгълници.`:''}`);node.append(caption);
 const coordinate=(event:PointerEvent)=>Math.max(minX,Math.min(maxX,minX+(localPointer(svg,event).x-left)/plotWidth*(maxX-minX)));
 let start:number|null=null,last=minX,selectionValue:[number,number]|null=null;
 updateCursor=value=>{last=Math.max(minX,Math.min(maxX,value));cursor.setAttribute('visibility',Number.isFinite(value)&&value>=minX&&value<=maxX?'visible':'hidden');cursor.setAttribute('x1',String(x(last)));cursor.setAttribute('x2',String(x(last)));svg.dataset.cursorX=String(value);};
 updateSelection=range=>{const first=range?Math.max(minX,Math.min(maxX,range[0])):minX,end=range?Math.max(minX,Math.min(maxX,range[1])):minX;selected.setAttribute('x',String(x(first)));selected.setAttribute('width',String(Math.max(0,x(end)-x(first))));};
 svg.addEventListener('pointerdown',event=>{start=coordinate(event);last=start;svg.setPointerCapture(event.pointerId);options.onCursor(last);});
 svg.addEventListener('pointermove',event=>{last=coordinate(event);options.onCursor(last);if(start!==null)updateSelection([Math.min(start,last),Math.max(start,last)]);});
 svg.addEventListener('pointerup',()=>{if(start!==null&&Math.abs(last-start)>(maxX-minX)*.01)options.onRange(Math.min(start,last),Math.max(start,last));start=null;});
 svg.addEventListener('pointercancel',()=>{start=null;updateSelection(selectionValue);});
 svg.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();last=event.key==='Home'?minX:event.key==='End'?maxX:Math.max(minX,Math.min(maxX,last+(event.key==='ArrowRight'?1:-1)*(maxX-minX)/100));options.onCursor(last);});
 return {card:node,update:updateCursor,setSelection:(range:[number,number]|null)=>{selectionValue=range;updateSelection(range);}};
}
