import {el,num,km,pace,duration,date,parseDuration} from './dom';
import {overviewStats,metricCards} from './views';
import {lineChart,chartValues,nearest,nearestTime} from './charts';
import type {ChartState} from './line-chart';
import {AnalysisView} from './analysis-view';
import {WorkoutMap} from './workout-map';
import {ControlHelp} from './control-help';
import {combinedChart} from './combined-chart';
import {fontScale} from './svg';
import {validateDistance} from '../../lib/running-lab/history.mjs';
import type {LabWorkout,LabSettings} from '../../lib/running-lab/types';
interface Entry {model:LabWorkout;analysis:any;saved?:boolean;dirty?:boolean}
interface Hooks {run:(job:()=>Promise<void>)=>Promise<void>;status:(message:string)=>void;isBusy:()=>boolean;changeSettings:(settings:Partial<LabSettings>)=>Promise<void>;range:(start:number,end:number)=>Promise<any>;loadMapPoints:()=>Promise<Float64Array>}
interface DistanceRange {startM:number;endM:number}
interface SeriesDefinition {key:string;title:string;unit:string;color:string;inverse?:boolean}

export class WorkoutView {
 private entry:Entry|null=null;private cursor:any=null;
 private zoomRange:DistanceRange|null=null;private selection:DistanceRange|null=null;
 private charts:{update:(x:number)=>void;setSelection:(range:[number,number]|null)=>void}[]=[];
 private primaryChart:{update:(x:number)=>void;setSelection:(range:[number,number]|null)=>void}|null=null;
 private detailedCharts:{update:(x:number)=>void;setSelection:(range:[number,number]|null)=>void}[]=[];
 private metrics=new Set(['pace']);private primaryAll=false;private zone='Europe/Sofia';
 private cursorFrame=0;private pendingPoint:any=null;
 private map:WorkoutMap;private help:ControlHelp;
 private states=new Map<string,ChartState>();private details:AnalysisView;
 constructor(private root:HTMLElement,private hooks:Hooks){
  this.help=new ControlHelp(root);this.map=new WorkoutMap(this.q('[data-lab-map]'),{onPoint:point=>this.selectMapPoint(point),loadPoints:()=>hooks.loadMapPoints()},this.q('[data-lab-point-info]'),this.q('.lab-finish-details'),this.help);
  for(const [selector,key]of [['[data-combined-scale]','scale'],['[data-action="reset-zoom"]','reset']] as const)this.help.attach(this.q<HTMLButtonElement>(selector),key);
  const chartHelp=this.q<HTMLButtonElement>('[data-lab-chart-help]');this.help.prepare(chartHelp);chartHelp.addEventListener('click',()=>this.help.open(chartHelp));
  window.addEventListener('beforeunload',()=>{this.map.destroy();this.help.destroy();});
  this.details=new AnalysisView(root,row=>this.selectSegment(row));
  this.q('[data-lab-axis]').addEventListener('change',()=>this.renderCharts());
  this.q('[data-lab-pair]').addEventListener('change',()=>{this.renderDetailed();this.syncCurrent();});
  this.q('[data-lab-layout]').addEventListener('change',()=>this.redraw());
  this.root.querySelectorAll<HTMLInputElement>('[data-combined-metric]').forEach(input=>input.addEventListener('change',()=>{const key=input.dataset.combinedMetric!;if(input.checked)this.metrics.add(key);else this.metrics.delete(key);this.renderPrimary();this.syncCurrent();}));
  this.q('[data-combined-scale]').addEventListener('click',()=>{this.primaryAll=!this.primaryAll;this.renderPrimary();this.syncCurrent();});
  this.q<HTMLDetailsElement>('[data-lab-detail-graphs]').addEventListener('toggle',()=>{this.renderDetailed();this.syncCurrent();});
  if(typeof ResizeObserver!=='undefined'){
   let previous=0,frame=0;const observer=new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width>0&&Math.abs(width-previous)>1){previous=width;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>this.redraw());}else if(!width)previous=0;});
   observer.observe(this.q('[data-lab-workspace]'));window.addEventListener('beforeunload',()=>{observer.disconnect();cancelAnimationFrame(frame);cancelAnimationFrame(this.cursorFrame);});
  }
  this.updateLayout();
  for(const selector of ['[data-lab-smoothing]','[data-lab-altitude]'])this.q(selector).addEventListener('change',()=>{
   if(!this.entry)return;if(hooks.isBusy()){this.q<HTMLSelectElement>('[data-lab-smoothing]').value=String(this.entry.model.settings.smoothingM);this.q<HTMLSelectElement>('[data-lab-altitude]').value=this.entry.model.settings.altitudeSource;hooks.status('Изчакай текущата операция или я прекрати.');return;}
   void hooks.run(()=>hooks.changeSettings({smoothingM:Number(this.q<HTMLSelectElement>('[data-lab-smoothing]').value)as 25|50|100|200,altitudeSource:this.q<HTMLSelectElement>('[data-lab-altitude]').value as 'unknown'|'gps'|'barometer'}));
  });
  for(const selector of ['[data-lab-range-start]','[data-lab-range-end]'])this.q(selector).addEventListener('change',()=>{try{this.selection=this.readRange();this.paintSelection();}catch{/* Partial numeric input is validated when submitted. */}});
  this.q<HTMLFormElement>('[data-lab-laps-form]').addEventListener('submit',event=>{event.preventDefault();void hooks.run(async()=>{
   const entry=this.requireEntry(),data=new FormData(event.target as HTMLFormElement),length=String(data.get('length')||''),input=String(data.get('boundaries')||''),mode=this.q<HTMLSelectElement>('[data-lab-lap-input-mode]').value;
   if(mode==='length'){if(!length)throw new Error('Въведи дължина на един лап.');await hooks.changeSettings({lapLengthM:validateDistance(Number(length)*1000),lapBoundaries:[]});}
   else{const boundaries=input?input.split(';').map(v=>Number(v.trim().replace(',','.'))*1000):[];
    if(boundaries.length>1000||boundaries.some((n,i)=>!Number.isFinite(n)||n<=0||n>=entry.analysis.stats.distanceM||i>0&&n<=boundaries[i-1]))throw new Error('Границите трябва да са подредени, уникални и вътре в тренировката.');
    await hooks.changeSettings({lapLengthM:null,lapBoundaries:boundaries});}
  });});
  this.q<HTMLFormElement>('[data-lab-finish-form]').addEventListener('submit',event=>{event.preventDefault();void hooks.run(async()=>{const data=new FormData(event.target as HTMLFormElement),seconds=parseDuration(String(data.get('finishElapsed')));this.validateFinish(seconds);await hooks.changeSettings({manualFinishElapsedS:seconds});});});
  let printed:{node:HTMLDetailsElement;open:boolean}[]=[];
  window.addEventListener('beforeprint',()=>{const panel=root.querySelector<HTMLElement>('[data-panel]:not([hidden])');printed=Array.from(panel?.querySelectorAll('details')||[]).map(node=>({node,open:node.open}));printed.forEach(row=>row.node.open=true);});
  window.addEventListener('afterprint',()=>{printed.forEach(row=>row.node.open=row.open);printed=[];});
 }
 private q<T extends HTMLElement=HTMLElement>(selector:string){return this.root.querySelector<T>(selector)!;}
 private requireEntry(){if(!this.entry)throw new Error('Първо отвори тренировка.');return this.entry;}
 resetView(){this.help.close();this.zoomRange=null;this.selection=null;this.cursor=null;this.metrics=new Set(['pace']);this.primaryAll=false;cancelAnimationFrame(this.cursorFrame);this.cursorFrame=0;this.pendingPoint=null;this.q<HTMLInputElement>('[data-lab-range-start]').value='0';this.q<HTMLInputElement>('[data-lab-range-end]').value='';}
 render(entry:Entry|null,zone:string){
  if(entry?.model.id!==this.entry?.model.id)this.resetView();this.entry=entry;this.zone=zone;
  this.q('[data-lab-overview]').hidden=!entry;this.q('[data-lab-empty-overview]').hidden=!!entry;this.details.render(entry?.analysis||null,zone);
  if(!entry){for(const key of ['stats','charts','paired-chart','combined-chart','quality','finish-report','range-result'])this.q(`[data-lab-${key}]`).replaceChildren();this.map.setAnalysis(null,zone);this.charts=[];this.primaryChart=null;this.detailedCharts=[];return;}
  const a=entry.analysis;
  this.q('[data-lab-workout-name]').textContent=entry.model.name;
  this.q('[data-lab-source]').textContent=`${entry.model.source.format.toUpperCase()} · ${date(a.stats.start,zone)} · ${entry.saved?'записана тренировка':'временен анализ'}${entry.dirty?' · незаписани настройки':''} · GPS ${num(a.quality.geometryCoverage*100,0)}% · спорт: ${entry.model.reported.sport||'не е отчетен във файла'}`;
  this.q('[data-lab-stats]').replaceChildren(...Array.from(overviewStats(a,zone).children));
  const quality=el('div');for(const message of [...a.quality.messages,...entry.model.warnings])quality.append(el('p',message,'lab-notice'));if(!a.elevation.available)quality.append(el('p',a.elevation.reason,'lab-muted'));this.q('[data-lab-quality]').replaceChildren(quality);
  this.q('[data-lab-cadence-note]').textContent=a.cadenceDisplay?.reason||'Единицата на каданса не е потвърдена. Показваме оригиналните стойности.';
  this.q<HTMLSelectElement>('[data-lab-smoothing]').value=String(entry.model.settings.smoothingM);this.q<HTMLSelectElement>('[data-lab-altitude]').value=entry.model.settings.altitudeSource;
  const axis=this.q<HTMLSelectElement>('[data-lab-axis]');axis.options[0].disabled=a.stats.distanceM===null;axis.options[1].disabled=!a.quality.clockReliable;
  if(axis.selectedOptions[0].disabled)axis.value=a.quality.clockReliable?'time':'distance';
  const end=this.q<HTMLInputElement>('[data-lab-range-end]');if(!end.value||Number(end.value)*1000>a.stats.distanceM)end.value=a.stats.distanceM===null?'':(a.stats.distanceM/1000).toFixed(3);
  this.q<HTMLButtonElement>('[data-action="zoom"]').disabled=!(a.stats.distanceM>0);this.q<HTMLButtonElement>('[data-action="range"]').disabled=!(a.stats.distanceM>0&&a.quality.complete&&a.quality.clockReliable);
  this.renderFinish();this.renderCharts();
 }
 redraw(){this.updateLayout();if(this.entry){this.renderCharts();this.details.redraw();}}
 private updateLayout(){const workspace=this.q('[data-lab-workspace]'),preferred=this.q<HTMLSelectElement>('[data-lab-layout]').value,narrow=innerWidth<1180||fontScale()>1.5||(workspace.clientWidth>0&&workspace.clientWidth<1000);workspace.dataset.effectiveLayout=preferred==='columns'&&!narrow?'columns':'stacked';const hint=this.q('[data-lab-layout-hint]');hint.textContent=narrow&&preferred==='columns'?'За четимост на този екран картата е над графиката. Изборът не се записва между устройства.':'';hint.hidden=!hint.textContent;}
 private state(key:string){if(!this.states.has(key))this.states.set(key,{expanded:false,scale:'typical'});return this.states.get(key)!;}
 private timeAxis(){return this.q<HTMLSelectElement>('[data-lab-axis]').value==='time';}
 private toX(distance:number){const a=this.requireEntry().analysis,p=nearest(a.samples,distance);return this.timeAxis()&&p?(p.t-a.stats.start)/60000:distance/1000;}
 private domain():[number,number]{const a=this.requireEntry().analysis;return this.zoomRange?[this.toX(this.zoomRange.startM),this.toX(this.zoomRange.endM)]:[0,this.timeAxis()?a.stats.elapsedSeconds/60:(a.stats.distanceM||0)/1000];}
 private syncCharts(){this.charts=[...(this.primaryChart?[this.primaryChart]:[]),...this.detailedCharts];}
 private syncCurrent(){
  if(!this.entry)return;const a=this.entry.analysis,domain=this.domain(),time=this.timeAxis(),at=(p:any)=>time?(p.t-a.stats.start)/60000:p.d/1000;
  let point=this.pendingPoint||this.cursor||a.samples[0];cancelAnimationFrame(this.cursorFrame);this.cursorFrame=0;this.pendingPoint=null;
  if(point&&(at(point)<domain[0]||at(point)>domain[1])){
   const visible=a.samples.filter((p:any)=>at(p)>=domain[0]&&at(p)<=domain[1]),target=Math.max(domain[0],Math.min(domain[1],at(point)));
   point=(time?nearestTime(visible,a.stats.start+target*60000):nearest(visible,target*1000))||point;
  }
  this.setPoint(point);this.paintSelection();
 }
 private common(){
  const a=this.requireEntry().analysis,domain=this.domain(),samples=a.samples.filter((p:any)=>{const x=this.timeAxis()?(p.t-a.stats.start)/60000:p.d/1000;return x>=domain[0]&&x<=domain[1];});
  return {axis:this.timeAxis()?'изминало време · мин':'дистанция · км',domain,
   onCursor:(x:number)=>this.queuePoint(this.timeAxis()?nearestTime(samples,a.stats.start+x*60000):nearest(samples,x*1000)),
   onRange:(left:number,right:number)=>{
    const first=this.timeAxis()?nearestTime(a.samples,a.stats.start+left*60000)?.d:left*1000,last=this.timeAxis()?nearestTime(a.samples,a.stats.start+right*60000)?.d:right*1000;
    if(!(last>first)){this.hooks.status('Избраният времеви участък няма положителна измерена дистанция. Ръчен финал може да се избере отделно по време.');this.paintSelection();return;}
    this.selection={startM:first,endM:last};this.writeRange();this.paintSelection();void this.hooks.run(()=>this.calculateRange());
   }};
 }
 private renderPrimary(){
  if(!this.entry)return;const a=this.entry.analysis,host=this.q('[data-lab-combined-chart]');
  this.root.querySelectorAll<HTMLInputElement>('[data-combined-metric]').forEach(input=>{const key=input.dataset.combinedMetric!,available=(key!=='pace'||a.quality.clockReliable)&&a.samples.filter((p:any)=>Number.isFinite(p[key])).length>=2;input.disabled=!available;if(!available)this.metrics.delete(key);input.checked=this.metrics.has(key);input.title=available?'':'Няма достатъчно измервания за този показател.';});
  const common=this.common(),workspace=this.q('[data-lab-workspace]'),width=host.clientWidth||(workspace.dataset.effectiveLayout==='columns'?this.root.clientWidth/2-36:this.root.clientWidth-32);
  const heightBudget=workspace.dataset.effectiveLayout==='columns'?Math.max(264,Math.min(322,innerHeight*.34)):undefined;
  const chart=combinedChart({analysis:a,heightBudget,metrics:['pace','hr','cad'].filter(key=>this.metrics.has(key)),axis:this.timeAxis()?'time':'distance',domain:common.domain,width:Math.max(230,width),allValues:this.primaryAll,onCursor:common.onCursor,onRange:common.onRange,
   markers:a.manualFinish?.available?[{x:this.timeAxis()?(a.manualFinish.time-a.stats.start)/60000:a.manualFinish.distanceM/1000,label:'Ръчен финал',finish:true}]:[]});
  host.replaceChildren(chart.card);this.primaryChart=chart;this.syncCharts();const button=this.q('[data-combined-scale]');button.setAttribute('aria-pressed',String(this.primaryAll));button.textContent=this.primaryAll?'Автоматична скала':'Всички стойности';
 }
 private renderDetailed(){
  if(!this.entry)return;const a=this.entry.analysis,stack=this.q('[data-lab-charts]');stack.replaceChildren();this.q('[data-lab-paired-chart]').replaceChildren();this.detailedCharts=[];
  if(!this.q<HTMLDetailsElement>('[data-lab-detail-graphs]').open){this.syncCharts();return;}
  const axis=this.timeAxis()?'time':'distance',common=this.common(),domain=common.domain,width=Math.max(240,(stack.clientWidth||this.root.clientWidth)-32);
  const definitions:SeriesDefinition[]=[{key:'pace',title:'Темпо',unit:'мин/км',color:'#ff9d40',inverse:true},{key:'hr',title:'Пулс',unit:'уд./мин',color:'#f284a6'},{key:'elevation',title:'Височина',unit:'м',color:'#55c4e1'},{key:'cad',title:'Каданс',unit:a.cadenceDisplay?.unit||'отчетени ед./мин',color:'#b5a2ff'}];
  if(a.gradient?.available)definitions.splice(3,0,{key:'grade',title:`Наклон · прозорец ${a.gradient.windowM} м`,unit:'%',color:'#64d3b1'});
  const markers:{x:number;label:string;lap?:boolean;finish?:boolean}[]=a.splits.filter((row:any)=>row.lengthM>=999.999).map((row:any,i:number)=>({x:this.toX(row.endM),label:String(i+1)}));
  a.manualLaps.forEach((row:any,i:number)=>markers.push({x:this.toX(row.endM),label:a.settings.lapLengthM&&row.lengthM<a.settings.lapLengthM-.001?'Остатък':`Лап ${i+1}`,lap:true}));
  a.deviceLaps.forEach((row:any,i:number)=>{if(a.quality.clockReliable&&typeof row.end==='number'){const p=nearestTime(a.samples,row.end);if(p)markers.push({x:this.timeAxis()?(row.end-a.stats.start)/60000:p.d/1000,label:`Устр. ${i+1}`,lap:true});}});
  if(a.manualFinish?.available)markers.push({x:this.timeAxis()?(a.manualFinish.time-a.stats.start)/60000:a.manualFinish.distanceM/1000,label:'Ръчен финал',finish:true});
  const points=(key:string)=>(key==='elevation'&&!a.elevation.available?[]:chartValues(a,key,axis)).filter((p:any)=>p.x>=domain[0]&&p.x<=domain[1]);
  const options=(d:SeriesDefinition)=>({...d,metric:d.key,width,points:points(d.key),format:d.key==='pace'?(v:number)=>pace(v).replace(' /км',''):undefined});
  const pair=this.q<HTMLSelectElement>('[data-lab-pair]');
  for(const option of Array.from(pair.options))option.disabled=option.value!=='none'&&(!a.elevation.available||option.value==='grade-pace'&&!a.gradient?.available||option.value==='elevation-hr'&&a.stats.heart.mean===null||option.value.endsWith('pace')&&!a.quality.clockReliable);
  if(pair.selectedOptions[0].disabled)pair.value='none';
  if(pair.value!=='none'){const [first,second]=pair.value.split('-'),d=definitions.find(d=>d.key===first)!,secondary=definitions.find(d=>d.key===second)!;const chart=lineChart({...options(d),...common,markers,title:`${d.title} + ${secondary.title}`,primaryTitle:d.title,secondary:options(secondary),key:'pair-'+pair.value,state:this.state('pair-'+pair.value),zeroLine:first==='grade'});this.q('[data-lab-paired-chart]').append(chart.card);this.detailedCharts.push(chart);}
  for(const d of definitions){const chart=lineChart({...options(d),...common,markers,key:d.key,state:this.state(d.key),zeroLine:d.key==='grade'});stack.append(chart.card);this.detailedCharts.push(chart);}this.syncCharts();
 }
 private renderCharts(){
  if(!this.entry)return;this.updateLayout();this.renderPrimary();this.renderDetailed();this.map.setAnalysis(this.entry.analysis,this.zone);this.syncCurrent();this.renderRangeLabel();
 }
 private queuePoint(point:any){if(!point)return;this.pendingPoint=point;if(!this.cursorFrame)this.cursorFrame=requestAnimationFrame(()=>{this.cursorFrame=0;const p=this.pendingPoint;this.pendingPoint=null;if(p)this.setPoint(p);});}
 private selectMapPoint(point:any){
  cancelAnimationFrame(this.cursorFrame);this.cursorFrame=0;this.pendingPoint=null;
  if(this.zoomRange&&(point.d<this.zoomRange.startM||point.d>this.zoomRange.endM)){this.zoomRange=null;this.renderPrimary();this.renderDetailed();this.renderRangeLabel();this.paintSelection();}
  this.setPoint(point);
 }
 private setPoint(p:any){
  if(!this.entry||!p)return;this.cursor=p;const a=this.entry.analysis,x=this.timeAxis()?(p.t-a.stats.start)/60000:p.d/1000;this.charts.forEach(chart=>chart.update(x));this.map.update(p);
 }
 private readRange():DistanceRange {const a=this.requireEntry().analysis,startM=Number(this.q<HTMLInputElement>('[data-lab-range-start]').value)*1000,endM=Number(this.q<HTMLInputElement>('[data-lab-range-end]').value)*1000;if(!(startM>=0&&endM>startM&&endM<=a.stats.distanceM+1))throw new Error('Избери валиден диапазон вътре в тренировката.');return {startM,endM:Math.min(endM,a.stats.distanceM)};}
 private writeRange(){if(this.selection){this.q<HTMLInputElement>('[data-lab-range-start]').value=(this.selection.startM/1000).toFixed(3);this.q<HTMLInputElement>('[data-lab-range-end]').value=(this.selection.endM/1000).toFixed(3);}}
 private paintSelection(){const range=this.selection?[this.toX(this.selection.startM),this.toX(this.selection.endM)] as [number,number]:null;this.charts.forEach(chart=>chart.setSelection(range));this.map.setRange(this.selection?[this.selection.startM,this.selection.endM]:null);}
 private renderRangeLabel(){const a=this.requireEntry().analysis,start=this.zoomRange?.startM||0,end=this.zoomRange?.endM??a.stats.distanceM;this.q('[data-lab-visible-range]').textContent=a.stats.distanceM===null?'Показана е цялата времева линия.':this.zoomRange?`Показан участък: ${km(start)}–${km(end)} км от общо ${km(a.stats.distanceM)} км`:`Цялата тренировка · ${km(a.stats.distanceM)} км`;}
 zoom(){this.selection=this.readRange();this.zoomRange={...this.selection};this.renderCharts();this.hooks.status('Приближен е само изгледът на графиките. Оригиналният запис не е променен.');}
 resetZoom(){this.zoomRange=null;this.selection=null;const a=this.requireEntry().analysis;this.q<HTMLInputElement>('[data-lab-range-start]').value='0';this.q<HTMLInputElement>('[data-lab-range-end]').value=a.stats.distanceM===null?'':(a.stats.distanceM/1000).toFixed(3);this.q('[data-lab-range-result]').textContent='';this.renderCharts();}
 async calculateRange(){const range=this.readRange();this.selection=range;this.paintSelection();const row=await this.hooks.range(range.startM,range.endM);this.q('[data-lab-range-result]').textContent=row?`Статистика за избрания участък: ${num(row.lengthM)} м · ${duration(row.seconds)} · ${pace(row.pace)} · пулс ${num(row.heart)} уд./мин`:'Недостатъчно надеждни данни за този участък.';}
 private selectSegment(row:any){
  if(!this.entry)return;const a=this.entry.analysis;let start=row.startM,end=row.endM;
  if(!Number.isFinite(start)&&a.quality.clockReliable&&Number.isFinite(row.startTime)&&Number.isFinite(row.endTime)){start=nearestTime(a.samples,row.startTime)?.d;end=nearestTime(a.samples,row.endTime)?.d;}
  if(Number.isFinite(start)&&end>start){this.selection={startM:start,endM:end};this.writeRange();if(this.zoomRange&&(start<this.zoomRange.startM||end>this.zoomRange.endM)){this.zoomRange=null;this.renderCharts();}this.paintSelection();this.setPoint(nearest(a.samples,(start+end)/2));}
 }
 private validateFinish(seconds:number){const a=this.requireEntry().analysis;if(!a.quality.clockReliable||!a.quality.complete||a.quality.distanceSource!=='gps')throw new Error('Ръчният финал изисква надеждни последователни времена и непрекъснат GPS запис.');if(!(seconds>0&&seconds<a.stats.elapsedSeconds&&seconds<=604800))throw new Error('Избери момент след началото и преди края на целия запис.');}
 async markFinish(){const a=this.requireEntry().analysis;if(!Number.isFinite(this.cursor?.t))throw new Error('Посочи точка с надеждно време.');const seconds=(this.cursor.t-a.stats.start)/1000;this.validateFinish(seconds);await this.hooks.changeSettings({manualFinishElapsedS:seconds});}
 async clearFinish(){await this.hooks.changeSettings({manualFinishElapsedS:null});}
 private renderFinish(){
  const a=this.requireEntry().analysis,report=a.manualFinish,container=this.q('[data-lab-finish-report]');container.replaceChildren();
  const can=a.quality.clockReliable&&a.quality.complete&&a.quality.distanceSource==='gps';this.q<HTMLButtonElement>('[data-action="mark-finish"]').disabled=!can;this.q<HTMLButtonElement>('[data-action="clear-finish"]').disabled=!this.entry!.model.settings.manualFinishElapsedS;this.q<HTMLButtonElement>('[data-lab-finish-form] button').disabled=!can;
  if(!report){container.append(el('p',can?'Финал не е маркиран. Нищо не се изрязва автоматично.':'Недостатъчно надеждни GPS/времеви данни за ръчен финал.','lab-muted'));return;}
  if(!report.available){container.append(el('p',report.reason,'lab-notice'));return;}
  this.q<HTMLInputElement>('[name="finishElapsed"]').value=duration(report.stats.elapsedSeconds);
  container.append(el('h4','Отделен анализ до ръчния финал'),el('p',report.note,'lab-notice'),metricCards([['До измерената точка',duration(report.stats.elapsedSeconds),'Изминало време; не е Chip Time'],['GPS дистанция',km(report.distanceM)+' км'],['Темпо до ръчния финал',pace(report.stats.pace)],['Останало в оригинала',duration(report.afterSeconds),'Не е изтрито или добавено към официален резултат']]));
 }
}
