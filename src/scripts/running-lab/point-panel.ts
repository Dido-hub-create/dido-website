import {el,num,km,pace,duration} from './dom';
import {pointData} from '../../lib/running-lab/point-data.mjs';

export class PointPanel {
 readonly node=el('div',undefined,'lab-map-point lab-point-panel');
 private heading=el('h4','Избери точка от картата или графиката');private description=el('span',undefined,'sr-only');
 private values=new Map<string,HTMLElement>();
 constructor(){
  this.node.dataset.mapPoint='';this.node.dataset.labCursor='';this.node.id='lab-point-readout';this.node.setAttribute('role','group');this.node.setAttribute('aria-label','Данни за избраното измерване');
  this.description.setAttribute('role','status');this.description.setAttribute('aria-live','polite');this.description.setAttribute('aria-atomic','true');
  const list=el('dl');for(const [key,label]of [['distance','Километър'],['elapsed','Изминало време'],['clock','Час на тренировката'],['pace','Локално темпо'],['hr','Пулс'],['cad','Каданс'],['elevation','Отчетена височина'],['grade','Наклон']]){
   const item=el('div'),title=el('dt',label),value=el('dd','Няма данни');value.dataset.pointField=key;this.values.set(key,value);item.append(title,value);list.append(item);
  }
  this.node.append(this.heading,list,this.description);
 }
 clear(){this.heading.textContent='Избери точка от картата или графиката';for(const value of this.values.values())value.textContent='Няма данни';this.description.textContent='';}
 update(analysis:any,point:any,zone:string,label:string){
  const p=pointData(analysis,point,zone),missing='Няма данни';
  const formatted:Record<string,string>={distance:p.distanceM===null?missing:km(p.distanceM)+' км',elapsed:p.elapsedS===null?missing:duration(p.elapsedS),clock:p.clock||missing,
   pace:p.pace===null?missing:pace(p.pace),hr:p.heart===null?missing:num(p.heart)+' уд./мин',cad:p.cadence===null?missing:num(p.cadence)+' '+p.cadenceUnit,
   elevation:p.elevationM===null?missing:num(p.elevationM)+' м',grade:p.gradePercent===null?missing:num(p.gradePercent,2)+'%'};
  const title=label||(p.hasGps?'Текуща GPS точка':'Текущо измерване · няма GPS позиция');if(this.heading.textContent!==title)this.heading.textContent=title;
  for(const [key,text]of Object.entries(formatted)){const node=this.values.get(key)!;if(node.textContent!==text)node.textContent=text;}
  const text=`${title}: ${formatted.distance}, ${formatted.elapsed}.`;if(this.description.textContent!==text)this.description.textContent=text;
 }
}
