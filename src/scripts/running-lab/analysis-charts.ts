import {el,num,duration,pace,km} from './dom';
import {svgNode,svgLabel,localPointer,fontScale} from './svg';
import {visualScale,axisTicks} from '../../lib/running-lab/chart-scale.mjs';
import {isFullKm} from '../../lib/running-lab/visual-summary.mjs';

export function segmentReadout(row:any,a:any){
 const fields=[`${num(row.lengthM)} м`,duration(row.seconds),pace(row.pace)];
 if(Number.isFinite(row.hr))fields.push(`Пулс ${num(row.hr)} уд./мин`);
 if(Number.isFinite(row.cad))fields.push(`Каданс ${num(row.cad*(a.cadenceDisplay?.factor||1))} ${a.cadenceDisplay?.unit||'отчетени ед./мин'}`);
 if(Number.isFinite(row.ascentM))fields.push(`↑ ${num(row.ascentM)} / ↓ ${num(row.descentM)} м`);
 if(Number.isFinite(row.deltaElevationM))fields.push(`Нетна височина ${num(row.deltaElevationM)} м`);
 return fields.join(' · ');
}
export function kilometreBars(a:any,metric:string,onSelect:(row:any,index:number)=>void,initialIndex=0){
 const node=el('div'),rows=a.splits||[],full=rows.filter(isFullKm),factor=a.cadenceDisplay?.factor||1;
 const value=(row:any)=>metric==='hr'?row.hr:metric==='cad'?(row.cad===null?null:row.cad*factor):metric==='elevation'?(a.elevation.available?row.deltaElevationM:null):row.pace;
 const unit=metric==='hr'?'уд./мин':metric==='cad'?a.cadenceDisplay?.unit||'отчетени ед./мин':metric==='elevation'?'м':'мин/км';
 const format=(v:number)=>metric==='pace'?pace(v).replace(' /км',''):num(v,metric==='elevation'?1:0);
 const card=el('figure',undefined,'lab-chart-card lab-km-chart'),readout=el('p',undefined,'lab-selected-segment');readout.setAttribute('role','status');readout.setAttribute('aria-live','polite');
 const controls=el('div',undefined,'lab-segment-selector'),label=el('label','Избрана отсечка'),select=el('select'),previous=el('button','← Предишна'),next=el('button','Следваща →');previous.type=next.type='button';select.setAttribute('aria-label','Избери километрова отсечка');
 rows.forEach((row:any,i:number)=>select.append(new Option(isFullKm(row)?`Километър ${i+1}`:`Непълен остатък · ${num(row.lengthM)} м`,String(i))));label.append(select);controls.append(previous,label,next);
 let selected=Math.max(0,Math.min(rows.length-1,initialIndex)),bars:SVGRectElement[]=[];
 function choose(index:number,notify=true){
  if(!rows.length)return;selected=Math.max(0,Math.min(rows.length-1,index));select.value=String(selected);previous.disabled=selected===0;next.disabled=selected===rows.length-1;
  const row=rows[selected];readout.textContent=`${isFullKm(row)?`Километър ${selected+1}`:'Непълен остатък'} · ${segmentReadout(row,a)}`;
  bars.forEach((bar,i)=>bar.setAttribute('stroke',full[i]===row?'#ffe1ac':'transparent'));
  if(notify)onSelect(row,selected);
 }
 const valid=full.map((row:any)=>({x:row.startM/1000,y:value(row),run:0})).filter((p:any)=>Number.isFinite(p.y));
 if(valid.length){
  const font=fontScale(),width=Math.max(280,(document.querySelector<HTMLElement>('[data-running-lab]')?.clientWidth||innerWidth)-32),height=(innerWidth<=600?235:280)+(font-1)*45,left=Math.max(56,font*48),right=20,top=20,bottom=42*font;
  const s=visualScale(full.map((r:any)=>({x:r.startM/1000,y:value(r),run:0})),{metric:metric==='elevation'?'elevation':metric,mode:'all',includeZero:true})!;
  const min=Math.min(0,s.min),max=Math.max(0,s.max),plotW=width-left-right,plotH=height-top-bottom,xStep=plotW/full.length,y=(v:number)=>top+(max-v)/(max-min)*plotH;
  const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'group',tabindex:0,'aria-label':`Километрова графика в ${unit}. Стрелки наляво/надясно избират отсечка.`,'data-km-chart':''});svg.style.height=`${height}px`;svgLabel(svg,left,13*font,unit);
  for(const tick of axisTicks(min,max,4,metric)){svg.append(svgNode('line',{x1:left,x2:width-right,y1:y(tick),y2:y(tick),stroke:'#304962'}));svgLabel(svg,left-8,y(tick)+4,format(tick),'end');}
  const stride=Math.max(1,Math.ceil(full.length/(width<500?8:22)));
  full.forEach((row:any,i:number)=>{const v=value(row);if(Number.isFinite(v)){const yy=y(v),zero=y(0),bar=svgNode('rect',{x:left+i*xStep+xStep*.14,y:Math.min(yy,zero),width:Math.max(2,xStep*.72),height:Math.max(1,Math.abs(zero-yy)),rx:2,fill:metric==='elevation'&&v<0?'#4fd5a3':'#ff9d40','stroke-width':2,'data-km-bar':rows.indexOf(row)});const title=svgNode('title');title.textContent=`Километър ${i+1} · ${segmentReadout(row,a)}`;bar.append(title);svg.append(bar);bars.push(bar);}else bars.push(svgNode('rect'));if(i%stride===0||i===full.length-1)svgLabel(svg,left+(i+.5)*xStep,height-18*font,String(i+1),'middle');});
  svgLabel(svg,width-right,height-2,'километър','end');
  svg.addEventListener('pointermove',event=>{const index=Math.max(0,Math.min(full.length-1,Math.floor((localPointer(svg,event).x-left)/xStep)));if(rows.indexOf(full[index])!==selected)choose(rows.indexOf(full[index]));});
  svg.addEventListener('pointerdown',event=>{const index=Math.max(0,Math.min(full.length-1,Math.floor((localPointer(svg,event).x-left)/xStep)));choose(rows.indexOf(full[index]));});
  svg.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();choose(event.key==='Home'?0:event.key==='End'?rows.length-1:selected+(event.key==='ArrowRight'?1:-1));});
  card.append(svg,el('figcaption',metric==='pace'?'По-нисък стълб = по-бързо темпо. Само пълни километри; изминалото време включва паузите.':metric==='elevation'?'Положителна/отрицателна нетна промяна във височината по километри.':'Отчетени средни стойности за пълните километри.'));
 }else card.append(el('p','Няма пълни километри с надеждни данни за избрания показател.','lab-empty'));
 for(const row of rows.filter((r:any)=>!isFullKm(r))){const button=el('button',`Непълен остатък · ${segmentReadout(row,a)}`,'lab-remainder');button.type='button';button.dataset.partialSplit='';button.addEventListener('click',()=>choose(rows.indexOf(row)));node.append(button);}
 node.prepend(card);node.append(controls,readout);previous.addEventListener('click',()=>choose(selected-1));next.addEventListener('click',()=>choose(selected+1));select.addEventListener('change',()=>choose(Number(select.value)));
 if(rows.length)choose(selected,false);else{controls.hidden=true;readout.textContent='Нужни са надеждни времена и непрекъсната дистанция за километрови отсечки.';}
 return node;
}
export function segmentBars(rows:any[],_a:any,onSelect:(row:any,index:number)=>void){
 const list=el('ol',undefined,'lab-segment-bars');
 const max=Math.max(1,...rows.filter(row=>!row.partial&&Number.isFinite(row.pace)).map(row=>row.pace));
 rows.forEach((row,i)=>{const item=el('li'),button=el('button',undefined,row.partial?'lab-remainder':'lab-segment-button');button.type='button';button.setAttribute('aria-pressed','false');
  if(!row.partial&&Number.isFinite(row.pace)){const bar=el('span',undefined,'lab-segment-fill');bar.style.width=`${Math.max(0,Math.min(100,row.pace/max*100))}%`;bar.setAttribute('aria-hidden','true');button.append(bar);}
  const title=el('span',row.label||`Част ${i+1}`,'lab-segment-title'),value=el('strong',pace(row.pace)),details=el('span',`${duration(row.seconds)} · ${km(row.lengthM)} км${row.source?' · '+row.source:''}`,'lab-segment-meta');
  button.append(title,value,details);if(Number.isFinite(row.deltaElevationM))button.append(el('span',`Нетна височина ${num(row.deltaElevationM)} м`,'lab-segment-meta'));
  if(row.partial)button.dataset.lapRemainder='';
  button.addEventListener('click',()=>{list.querySelectorAll('button').forEach(node=>node.setAttribute('aria-pressed',String(node===button)));onSelect(row,i);});item.append(button);list.append(item);
 });
 if(!rows.length)list.append(el('li','Няма надеждни данни за тези части.','lab-muted'));
 return list;
}
