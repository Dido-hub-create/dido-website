import {num,duration,pace,date,table,findings} from './dom';
import {metricCards,splitTable} from './views';
import {kilometreBars,segmentBars,segmentReadout} from './analysis-charts';
import {adaptiveMetrics,lapPresentation} from '../../lib/running-lab/visual-summary.mjs';

export class AnalysisView {
 private analysis:any=null;private zone='Europe/Sofia';private selectedKm=0;
 constructor(private root:HTMLElement,private onSelect:(row:any)=>void){
  this.q('[data-lab-km-metric]').addEventListener('change',()=>this.renderKilometres());
  this.q('[data-lab-fraction-count]').addEventListener('change',()=>this.renderFractions());
  this.q('[data-lab-lap-view]').addEventListener('change',()=>this.renderLaps());
  this.q('[data-lab-lap-input-mode]').addEventListener('change',()=>this.lapMode());
 }
 private q<T extends HTMLElement=HTMLElement>(selector:string){return this.root.querySelector<T>(selector)!;}
 redraw(){if(this.analysis){this.renderKilometres();this.renderFractions();this.renderLaps();}}
 render(a:any,zone:string){
  if(this.analysis?.id!==a?.id)this.selectedKm=0;this.analysis=a;this.zone=zone;
  this.q('[data-lab-analysis-content]').hidden=!a;this.q('[data-lab-analysis-empty]').hidden=!!a;
  if(!a){for(const key of ['pace-summary','km-visual','fractions','fraction-table','laps','lap-table','splits','climbs','findings'])this.q(`[data-lab-${key}]`).replaceChildren();return;}
  const metrics=adaptiveMetrics(a),cards=metricCards(metrics.map(m=>[m.title,m.kind==='pace'?pace(m.value):m.kind==='time'?duration(m.value):m.kind==='distance'?num(m.value/1000)+' км':m.kind==='percent'?num(m.value,1)+'%':m.kind==='signed-percent'?(m.value>0?'+':'')+num(m.value,1)+'%':m.kind==='metres'?num(m.value)+' м':m.kind==='heart'?num(m.value)+' уд./мин':num(m.value),m.detail]));
  cards.classList.add('lab-compact-stats');Array.from(cards.children).forEach((card,i)=>(card as HTMLElement).dataset.metric=metrics[i].id);this.q('[data-lab-pace-summary]').replaceChildren(cards);
  this.q('[data-lab-splits]').replaceChildren(splitTable(a.splits,a.cadenceDisplay));
  this.q('[data-lab-findings]').replaceChildren(findings(a.findings||[]));
  this.q('[data-lab-climbs]').replaceChildren(table(['№','От–до км','Дължина м','Изкачване м','Среден наклон','Темпо','Пулс'],a.elevation.available?a.elevation.climbs.map((c:any,i:number)=>[i+1,`${num(c.startM/1000,2)}–${num(c.endM/1000,2)}`,num(c.lengthM),num(c.gainM),num(c.averageGrade*100,2)+'%',pace(c.pace),num(c.heartRate)]):[]));
  this.renderKilometres();this.renderFractions();this.renderLaps();
  const form=this.q<HTMLFormElement>('[data-lab-laps-form]'),mode=this.q<HTMLSelectElement>('[data-lab-lap-input-mode]');
  mode.value=a.settings.lapLengthM?'length':a.settings.lapBoundaries.length?'boundaries':'length';
  (form.elements.namedItem('length')as HTMLInputElement).value=a.settings.lapLengthM?String(a.settings.lapLengthM/1000):'';
  (form.elements.namedItem('boundaries')as HTMLInputElement).value=a.settings.lapBoundaries.map((d:number)=>d/1000).join(';');this.lapMode();
 }
 private renderKilometres(){
  const a=this.analysis;if(!a)return;const select=this.q<HTMLSelectElement>('[data-lab-km-metric]');
  for(const option of Array.from(select.options))option.disabled=option.value==='elevation'?!a.elevation.available:option.value==='hr'?!a.splits.some((r:any)=>Number.isFinite(r.hr)):option.value==='cad'?!a.splits.some((r:any)=>Number.isFinite(r.cad)):!a.splits.length;
  if(select.selectedOptions[0]?.disabled)select.value='pace';
  this.q('[data-lab-km-visual]').replaceChildren(kilometreBars(a,select.value,(row,index)=>{this.selectedKm=index;this.onSelect(row);},this.selectedKm));
 }
 private renderFractions(){
  const a=this.analysis;if(!a)return;const count=Number(this.q<HTMLSelectElement>('[data-lab-fraction-count]').value),rows=(a.fractions[count]||[]).filter(Boolean).map((row:any,i:number)=>({...row,label:count===2?`${i+1}. половина`:count===3?`${i+1}. третина`:`${i+1}. четвъртина`}));
  this.q('[data-lab-fractions]').replaceChildren(segmentBars(rows,a,row=>{this.q('[data-lab-fraction-readout]').textContent=segmentReadout(row,a);this.onSelect(row);}));
  this.q('[data-lab-fraction-table]').replaceChildren(splitTable(rows,a.cadenceDisplay));
  this.q('[data-lab-fraction-readout]').textContent=rows.length?'Избери част за точните стойности и открояване на маршрута.':'Нужни са надеждни времена и дистанция.';
 }
 private renderLaps(){
  const a=this.analysis;if(!a)return;const select=this.q<HTMLSelectElement>('[data-lab-lap-view]');
  select.options[0].disabled=!a.deviceLaps.length;select.options[1].disabled=!a.manualLaps.length;
  if(select.selectedOptions[0]?.disabled)select.value=a.deviceLaps.length?'device':'calculated';
  const rows=lapPresentation(a,select.value),source=select.value==='device'?'Отчетени обиколки: време на таймера и дистанция от устройството.':'Изчислени обиколки: изминало време по зададените дистанционни граници. Последният непълен остатък е отделен.';
  this.q('[data-lab-lap-description]').textContent=source+' Еднаква дължина не доказва едно и също географско трасе.';
  this.q('[data-lab-laps]').replaceChildren(...(rows.length?[segmentBars(rows,a,row=>{this.q('[data-lab-lap-readout]').textContent=segmentReadout(row,a);this.onSelect(row);})]:[]));
  select.parentElement!.hidden=!a.deviceLaps.length&&!a.manualLaps.length;
  this.q('[data-lab-lap-description]').hidden=!rows.length;
  this.q('[data-lab-lap-table]').closest('details')!.hidden=!rows.length;
  this.q('[data-lab-lap-table]').replaceChildren(select.value==='device'?table(['Лап','Начало','Край','Дистанция м','Таймер време','Темпо по таймер'],rows.map((row:any)=>[row.label,date(row.startTime,this.zone),date(row.endTime,this.zone),num(row.lengthM),duration(row.seconds),pace(row.pace)])):splitTable(rows,a.cadenceDisplay));
  this.q('[data-lab-lap-readout]').textContent=rows.length?'Избери лап за подробно разглеждане.':'Файлът няма такива обиколки. По желание задай дължина или собствени граници.';
 }
 private lapMode(){
  const length=this.q<HTMLSelectElement>('[data-lab-lap-input-mode]').value==='length';
  this.q('[data-lap-length-field]').hidden=!length;this.q<HTMLInputElement>('[name="length"]').disabled=!length;
  this.q('[data-lap-boundaries-field]').hidden=length;this.q<HTMLInputElement>('[name="boundaries"]').disabled=length;
  this.q('[data-lab-lap-mode-note]').textContent=length?'Въведи дължина на един лап. Следващите граници се изчисляват последователно; остатъкът се запазва отделно.':'Въведи точно желаните граници в километри, подредени и разделени с ;. Те може да са неравномерни. Дължина на лап не се използва.';
 }
}
