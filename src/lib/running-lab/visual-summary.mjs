export const isFullKm=row=>row.lengthM>=1000-.001;
export function adaptiveMetrics(a){
 const s=a.stats,out=[],add=(id,title,value,kind,detail,priority)=>{if(Number.isFinite(value))out.push({id,title,value,kind,detail,priority});};
 const reliable=a.quality.complete&&a.quality.clockReliable&&a.quality.runningEligible!==false;
 if(reliable){
  add('average','Средно темпо',s.pace,'pace','По изминалото време на целия запис',100);
  const full=a.splits.filter(isFullKm),fast=[...full].sort((x,y)=>x.pace-y.pace)[0],slow=[...full].sort((x,y)=>y.pace-x.pace)[0];
  if(fast)add('fastest','Най-бърз пълен километър',fast.pace,'pace',`Километър ${a.splits.indexOf(fast)+1} · автоматична отсечка`,99);
  const distances=s.distanceM>=10000?[10000,5000]:s.distanceM>=5000?[5000]:[3000];
  for(const [i,d]of distances.entries()){const record=a.records.find(r=>r.distanceM===d);if(record)add('record-'+d,`Най-бързи непрекъснати ${d/1000} км`,record.seconds,'time','GPS оценка по изминало време; не е официален резултат',98-i);}
  if(full.length>=5)add('variation','Равномерност на темпото',s.paceCV*100,'percent','CV на пълните километри; по-малко означава по-малки колебания',90);
  const halves=a.fractions[2];if(s.distanceM>=2000&&halves?.every(Boolean))add('halves','Разлика между половините',(halves[1].pace/halves[0].pace-1)*100,'signed-percent','По отчетени времена; паузи и късно спиране могат да повлияят',91);
  if(a.manualLaps.length===2&&Math.abs(a.manualLaps[0].lengthM/a.manualLaps[1].lengthM-1)<.02)add('laps','Разлика между два лапа',(a.manualLaps[1].pace/a.manualLaps[0].pace-1)*100,'signed-percent','Ръчни дистанционни граници; не е доказано географско повторение',92);
  if(full.length>=3&&slow)add('slowest','Най-бавен пълен километър',slow.pace,'pace',`Километър ${a.splits.indexOf(slow)+1} · включва отчетените паузи`,89);
 }
 add('cadence','Среден каданс',Number.isFinite(s.cadence.mean)?s.cadence.mean*(a.cadenceDisplay?.factor||1):null,'cadence',a.cadenceDisplay?.unit||'отчетени ед./мин',94);
 if(a.elevation.available)add('ascent','Общо изкачване',s.ascentM,'metres',`Оценка след ${a.settings.smoothingM} м изглаждане`,93);
 if(!reliable)add('distance','Измерима дистанция',s.distanceM,'distance','Само проверимите интервали',100);
 if(s.heart.mean!==null)add('heart','Отчетен среден пулс',s.heart.mean,'heart','Измервания, без физиологично тълкуване',85);
 return out.sort((x,y)=>y.priority-x.priority).slice(0,8);
}
export function lapPresentation(a,kind='calculated'){
 if(kind==='device')return a.deviceLaps.map((lap,i)=>({id:i,label:`Лап ${i+1}`,lengthM:lap.distanceM,seconds:lap.timerSeconds,pace:lap.distanceM>0&&lap.timerSeconds!==null?lap.timerSeconds*1000/lap.distanceM:null,partial:false,source:'Таймер и дистанция от устройството',startTime:lap.start,endTime:lap.end}));
 return a.manualLaps.map((lap,i)=>{const partial=a.settings.lapLengthM>0?lap.lengthM<a.settings.lapLengthM-.001:i===a.manualLaps.length-1&&lap.lengthM<10;return {...lap,id:i,label:partial?'Непълен остатък':`Лап ${i+1}`,partial,source:a.settings.lapLengthM>0?'По зададена дължина':'По ръчни граници'};});
}
