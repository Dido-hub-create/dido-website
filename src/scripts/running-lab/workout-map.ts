import {el,num,km,pace,duration} from './dom';
import {routeMap} from './route-map';
import {PointPanel} from './point-panel';
import {measuredPointIndex,passageCandidates,routeColouring,streetMapPossible,validMapPoint,unpackMapPoints} from '../../lib/running-lab/map-data.mjs';
type StreetController=ReturnType<typeof import('./street-map').createStreetMap>;
interface Hooks {onPoint:(point:any)=>void;loadPoints:()=>Promise<Float64Array>}

export class WorkoutMap {
 private analysis:any=null;private index:any=null;private colouring:any=null;private current:any=null;private range:[number,number]|null=null;
 private measurements:any[]|null=null;private pointsPromise:Promise<void>|null=null;
 private consentGranted=false;private wheelWanted=false;private followWanted=false;private followPaused=false;private zone='Europe/Sofia';
 private local=routeMap([]);private street:StreetController|null=null;private request=0;private candidates:any[]=[];private page=0;private chosen='';
 private controls=el('div',undefined,'lab-map-controls');private localButton=el('button','Локална GPS схема');private streetButton=el('button','Истинска карта');
 private consent=el('div',undefined,'lab-map-consent');private accept=el('button','Разрешавам OpenStreetMap');
 private localHost=el('div',undefined,'lab-local-route');private streetHost=el('div',undefined,'lab-street-map');
 private status=el('p',undefined,'lab-muted');private options=el('div',undefined,'lab-map-controls lab-street-options');
 private full=el('button','Цял маршрут');private wheelButton=el('button','Включи колелцето');private showPoint=el('button','Към точката');
 private followButton=el('button','Следвай точката');
 private colourSelect=el('select');private legend=el('div',undefined,'lab-route-colour-legend');
 private choices=el('div',undefined,'lab-map-passages');private pointInfo:PointPanel;private finishButton:HTMLButtonElement;
 private clearFinishButton:HTMLButtonElement;
 private forget=el('button','Отмени разрешението за фон');
 constructor(private host:HTMLElement,private hooks:Hooks,pointHost:HTMLElement,finishHost:HTMLElement){
  this.pointInfo=new PointPanel();this.finishButton=finishHost.querySelector<HTMLButtonElement>('[data-map-finish]')!;this.clearFinishButton=finishHost.querySelector<HTMLButtonElement>('[data-map-clear-finish]')!;
  this.localButton.dataset.mapMode='local';this.streetButton.dataset.mapMode='street';this.accept.dataset.mapAccept='';this.consent.dataset.mapConsent='';
  this.controls.setAttribute('role','group');this.controls.setAttribute('aria-label','Режим на GPS картата');this.controls.append(this.localButton,this.streetButton);
  const consentText=el('p','OpenStreetMap ще получава заявки за видимата географска област и IP адреса на браузъра. Файловете, точките, сензорите и библиотеката остават тук. Разрешението важи за тази тренировка до отмяна, смяна на записа или презареждане.');
  const policy=el('a','Условия за картографския фон');policy.href='https://operations.osmfoundation.org/policies/tiles/';
  this.consent.append(consentText,policy,this.accept);this.consent.hidden=true;this.streetHost.hidden=true;
  this.status.dataset.mapStatus='';this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');
  this.full.dataset.mapFit='';this.wheelButton.dataset.mapWheel='';this.showPoint.dataset.mapShowPoint='';
  this.followButton.dataset.mapFollow='';this.followButton.title='Премества картата само край ръба, без промяна на мащаба. Ръчното местене изключва следването.';
  this.options.append(this.full,this.wheelButton,this.followButton,this.showPoint);this.options.hidden=true;
  const colourLabel=el('label','Оцветяване на маршрута','lab-map-colour-control');this.colourSelect.dataset.mapColour='';
  for(const [value,label]of [['single','Единен цвят'],['pace','Темпо'],['grade','Наклон'],['hr','Отчетен пулс']])this.colourSelect.append(new Option(label,value));colourLabel.append(this.colourSelect);
  this.choices.dataset.mapPassages='';this.choices.hidden=true;this.choices.setAttribute('role','group');this.choices.setAttribute('aria-label','Избор на преминаване или измерена GPS точка');
  this.finishButton.dataset.mapFinish='';
  this.clearFinishButton.dataset.mapClearFinish='';this.clearFinishButton.disabled=true;
  const help=el('p','Плъзгане за местене, два пръста за приближаване. Колелцето запазва избора ти; извън картата превърта страницата. „Следвай точката“ мести истинската карта само близо до ръба, без автоматичен zoom. Ръчно плъзгане или стрелки изключват следването; включи го от бутона при желание. Локалната схема показва цялото трасе без външни заявки. При застъпване избери преминаване.','lab-muted');
  const markerLegend=el('p','С · начало (зелено кръгче). Ф · край на оригинала (оранжев квадрат). Р · ръчен финал (жълт ромб). Оранжева следа · избран диапазон.','lab-muted');markerLegend.classList.add('lab-marker-legend');
  const licence=el('a','Leaflet · BSD-2-Clause');licence.href='/licenses/leaflet.txt';help.append(document.createTextNode(' '),licence);
  const viewport=el('div',undefined,'lab-map-viewport');viewport.append(this.localHost,this.streetHost,this.consent,this.choices);
  const tools=el('details',undefined,'lab-map-tools');tools.append(el('summary','Карта, цветове и поверителност'),colourLabel,this.legend,markerLegend,help,this.forget);
  this.forget.dataset.mapForget='';this.forget.disabled=true;
  help.classList.add('lab-map-help');this.host.replaceChildren(this.controls,this.status,this.options,viewport,tools);pointHost.replaceChildren(this.pointInfo.node);
  this.host.querySelectorAll('button').forEach(button=>button.type='button');this.setModes(false);this.setWheel(false);this.setFollow(false);this.finishButton.disabled=true;
  this.localButton.addEventListener('click',()=>this.disableStreet('Локална GPS схема · без външни картографски заявки.'));
  this.streetButton.addEventListener('click',()=>{if(!this.street){this.choices.hidden=true;if(this.consentGranted){void this.enableStreet();return;}this.consent.hidden=!this.consent.hidden;this.streetButton.setAttribute('aria-expanded',String(!this.consent.hidden));if(!this.consent.hidden)this.accept.focus({preventScroll:true});}});
  this.accept.addEventListener('click',()=>{this.consentGranted=true;this.forget.disabled=false;this.host.dataset.mapPermission='true';void this.enableStreet();});
  this.forget.addEventListener('click',()=>{this.consentGranted=false;this.forget.disabled=true;this.host.dataset.mapPermission='false';this.disableStreet('Разрешението за външен фон е отменено. Схемата остава достъпна.');});
  this.full.addEventListener('click',()=>this.street?.fullRoute());this.showPoint.addEventListener('click',()=>this.street?.showPoint());
  this.wheelButton.addEventListener('click',()=>{const enabled=this.wheelButton.getAttribute('aria-pressed')!=='true';this.street?.wheel(enabled);this.setWheel(enabled);});
  this.followButton.addEventListener('click',()=>{this.setFollow(!this.followWanted);this.status.textContent=this.followWanted?'Следването е включено. Картата се мести край ръба; мащабът се запазва.':'Следването е изключено. GPS маркерът продължава да се обновява.';});
  this.choices.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();this.choices.hidden=true;if(this.street)this.streetHost.focus();else this.localButton.focus();}});
  this.colourSelect.addEventListener('change',()=>{if(!this.analysis)return;this.colouring=routeColouring(this.analysis,this.colourSelect.value);this.renderLegend();this.renderLocal();this.street?.setAnalysis(this.mapAnalysis(),this.colouring);});
  window.addEventListener('offline',this.offline);
 }
 private offline=()=>{if(this.street)this.disableStreet('Няма интернет. Върнахме локалната GPS схема; всички локални анализи остават достъпни.');};
 private setModes(street:boolean){this.localButton.setAttribute('aria-pressed',String(!street));this.streetButton.setAttribute('aria-pressed',String(street));this.options.hidden=!street;this.localHost.hidden=street;this.streetHost.hidden=!street;}
 private setWheel(enabled:boolean){this.wheelWanted=enabled;this.wheelButton.setAttribute('aria-pressed',String(enabled));this.wheelButton.textContent=enabled?'Колелце: включено':'Включи колелцето';}
 private setFollow(enabled:boolean){this.followWanted=enabled;this.followPaused=false;this.followButton.setAttribute('aria-pressed',String(enabled));this.followButton.textContent=enabled?'Следване: включено':'Следвай точката';this.street?.follow(enabled);}
 private disableStreet(message:string){
  this.request++;this.street?.destroy();this.street=null;this.streetHost.replaceChildren();this.consent.hidden=true;this.streetButton.setAttribute('aria-expanded','false');this.accept.disabled=false;this.setModes(false);this.status.textContent=message;
 }
 private mapAnalysis(){return {...this.analysis,points:this.measurements||this.analysis.samples};}
 private async ensurePoints(){
  if(this.measurements)return;
  if(!this.pointsPromise){const id=this.analysis.id;this.pointsPromise=this.hooks.loadPoints().then(packed=>{
   if(this.analysis?.id!==id)throw new Error('Тренировката е сменена. Избери точка от текущия запис.');
   this.measurements=unpackMapPoints(packed);this.index=measuredPointIndex(this.measurements);
  }).finally(()=>{this.pointsPromise=null;});}
  await this.pointsPromise;
 }
 private async enableStreet(){
  if(!this.consentGranted)return;
  if(!this.analysis)return;const unavailable=streetMapPossible(this.analysis.samples);if(unavailable){this.status.textContent=unavailable;return;}
  if(!navigator.onLine){this.disableStreet('Няма интернет. Локалната GPS схема остава достъпна.');return;}
  const token=++this.request;this.accept.disabled=true;this.consent.hidden=true;this.streetButton.setAttribute('aria-expanded','false');this.status.textContent='Зареждане на картографския модул и фона…';this.setModes(true);
  try{
   await this.ensurePoints();if(token!==this.request)return;
   const unavailable=streetMapPossible(this.measurements!);if(unavailable){this.disableStreet(unavailable);return;}
   const {createStreetMap}=await import('./street-map');if(token!==this.request)return;
   if(!this.streetHost.clientWidth){this.disableStreet('Картата остана изключена, защото прегледът е затворен. Можеш да я включиш отново.');return;}
   this.street=createStreetMap(this.streetHost,this.mapAnalysis(),this.colouring,{
    onPick:(position,radius,pixels,limit)=>this.pick(position,radius,pixels,limit),onPoint:point=>this.choose(point,'Избрана измерена точка от маркер'),
    onUnavailable:message=>{if(token===this.request)this.disableStreet(message);},onStatus:message=>{if(token===this.request)this.status.textContent=message+(this.followPaused?' Следването е спряно след ръчно местене.':'');},
    onFollowOff:()=>{if(token===this.request){this.setFollow(false);this.followPaused=true;this.status.textContent='Следването е изключено след ръчно местене. Включи го от „Следвай точката“ при желание.';}},
   });
   this.street.wheel(this.wheelWanted);this.street.setRange(this.range);if(this.current)this.street.update(this.current);this.street.follow(this.followWanted);this.accept.disabled=false;
  }catch{if(token===this.request)this.disableStreet('Картата не се зареди. Локалната GPS схема остава достъпна. Опитай отново при налична връзка.');}
 }
 setAnalysis(analysis:any,zone='Europe/Sofia'){
  this.zone=zone;
  const changed=this.analysis!==analysis,newActivity=this.analysis?.id!==analysis?.id;
  if(newActivity){this.consentGranted=false;this.forget.disabled=true;this.host.dataset.mapPermission='false';this.setWheel(false);this.setFollow(false);this.disableStreet('Фонът, колелцето и следването са изключени за новата тренировка.');this.measurements=null;this.index=null;this.pointsPromise=null;this.current=null;this.range=null;this.candidates=[];this.chosen='';this.choices.hidden=true;}
  this.analysis=analysis;
  if(!analysis){this.index=null;this.localHost.replaceChildren();this.pointInfo.clear();this.finishButton.disabled=true;this.clearFinishButton.disabled=true;return;}
  if(changed){this.colouring=routeColouring(analysis,this.colourSelect.value);this.colourSelect.value=this.colouring.mode;
   for(const option of Array.from(this.colourSelect.options))option.disabled=!this.colouring.available[option.value];
   this.streetButton.disabled=!!streetMapPossible(analysis.samples);this.renderLegend();
  }
  this.renderLocal();if(changed)this.street?.setAnalysis(this.mapAnalysis(),this.colouring);this.street?.resize();if(this.current)this.update(this.current);
 }
 private renderLocal(){
  if(!this.analysis)return;
  const width=this.localHost.clientWidth||this.host.clientWidth||(innerWidth>=1180?560:innerWidth-64),height=parseFloat(getComputedStyle(this.streetHost).height);
  this.local=routeMap(this.analysis.samples,{width,height:Number.isFinite(height)?height:undefined,range:this.range,finishTime:this.analysis.manualFinish?.available?this.analysis.manualFinish.time:null,colouring:this.colouring,onCursor:point=>this.choose(point,'Избрана измерена точка от километров маркер'),onPick:(position,radius,pixels,limit)=>this.pick(position,radius,pixels,limit)});
  this.localHost.replaceChildren(this.local.node);if(this.current)this.local.update(this.current);
 }
 private renderLegend(){
  this.legend.replaceChildren();const a=this.colouring;if(!a)return;
  const list=el('ul');
  for(const row of a.legend){const item=el('li'),swatch=el('span',undefined,'lab-colour-swatch');swatch.style.backgroundColor=row.color;if(row.dashed)swatch.classList.add('is-missing');swatch.setAttribute('aria-hidden','true');item.append(swatch,document.createTextNode(row.label));list.append(item);}
  this.legend.append(list);
  if(a.mode==='pace'||a.mode==='hr'){
   const format=(value:number)=>a.mode==='pace'?pace(value):num(value)+' уд./мин';
   this.legend.append(el('p',`Граници на цветовете: ${a.limits.map(format).join(' · ')}. Спрямо диапазона на този запис; без физиологично тълкуване.`,'lab-muted'));
  }
  if(a.mode!=='single')this.legend.append(el('p','Цветовете следват аналитичната графична серия. Липсващите данни са сиви с прекъсната линия; при избор се показва измерената точка.','lab-muted'));
 }
 private async pick(position:{lat:number;lon:number},radius:number,pixels:(p:any)=>number,limit:number){
  if(!this.analysis)return;const id=this.analysis.id;
  try{await this.ensurePoints();}catch(error){this.status.textContent=error instanceof Error?error.message:'GPS точките не се заредиха. Опитай отново.';return;}
  if(this.analysis?.id!==id)return;this.candidates=passageCandidates(this.index,position,radius,pixels,limit);this.page=0;
  if(!this.candidates.length){this.choices.hidden=true;this.status.textContent='Няма измерена GPS точка достатъчно близо. Приближи трасето за по-точен избор; предишният избор е запазен.';return;}
  if(this.candidates.length===1){this.choices.hidden=true;this.choose(this.candidates[0].point,'Избрана най-близка измерена GPS точка');return;}
  this.status.textContent='Избери преминаване; курсорът не е преместен автоматично.';this.renderChoices();this.choices.querySelector('button')?.focus({preventScroll:true});
 }
 private renderChoices(){
  this.choices.hidden=false;this.choices.replaceChildren(el('h4','Кое преминаване?'));
  const list=el('div',undefined,'lab-map-candidate-list'),start=this.page*20;
  for(const candidate of this.candidates.slice(start,start+20)){
   const p=candidate.point,label=`Преминаване ${candidate.visit} · ${km(p.d)} км · ${this.elapsed(p)}`,button=el('button',label);button.type='button';button.dataset.mapCandidate=String(candidate.index);button.setAttribute('aria-pressed',String(this.current?.t===p.t&&this.current?.d===p.d));
   button.addEventListener('click',()=>{this.choose(p,`Избрано преминаване ${candidate.visit} от ${candidate.visitCount}`);this.choices.hidden=true;if(this.street)this.streetHost.focus({preventScroll:true});});list.append(button);
  }
  this.choices.append(list);
  if(this.candidates.length>20){const pager=el('div',undefined,'lab-map-controls'),previous=el('button','Предишни'),next=el('button','Следващи');previous.type=next.type='button';previous.disabled=this.page===0;next.disabled=start+20>=this.candidates.length;previous.addEventListener('click',()=>{this.page--;this.renderChoices();});next.addEventListener('click',()=>{this.page++;this.renderChoices();});pager.append(previous,el('span',`${start+1}–${Math.min(start+20,this.candidates.length)} от ${this.candidates.length}`),next);this.choices.append(pager);}
  const close=el('button','Затвори избора');close.type='button';close.addEventListener('click',()=>this.choices.hidden=true);this.choices.append(close);
 }
 private elapsed(point:any){return this.analysis.quality.clockReliable&&Number.isFinite(point.t)?duration((point.t-this.analysis.stats.start)/1000):'няма надеждно време';}
 private choose(point:any,label:string){this.current=point;this.chosen=label;this.hooks.onPoint(point);this.status.textContent=`${label}: ${km(point.d)} км · ${this.elapsed(point)}.`;}
 update(point:any){
  if(!this.analysis||!point)return;
  if(this.current?.t!==point.t||this.current?.d!==point.d)this.chosen='';this.current=point;this.local.update(point);this.street?.update(point);
  const a=this.analysis;this.pointInfo.update(a,point,this.zone,this.chosen);
  this.showPoint.disabled=!validMapPoint(point);this.finishButton.disabled=!(a.quality.clockReliable&&a.quality.complete&&a.quality.distanceSource==='gps'&&Number.isFinite(point.t)&&point.t>a.stats.start&&point.t<a.stats.end);
  this.clearFinishButton.disabled=!a.settings.manualFinishElapsedS;
 }
 setRange(range:[number,number]|null){this.range=range;this.local.setRange(range);this.street?.setRange(range);}
 destroy(){this.disableStreet('');window.removeEventListener('offline',this.offline);}
}
