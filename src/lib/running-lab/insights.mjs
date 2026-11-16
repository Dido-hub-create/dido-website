import {interval} from './splits.mjs';
import {sensorStats} from './series.mjs';
const finding=(id,title,values,method,limitation)=>({id,title,values,method,limitation});
export function confirmedRecordFindings(analysis,previous,saved){
 if(!saved)return [];
 return analysis.records.flatMap(record=>{const old=previous.find(row=>row.distanceM===record.distanceM)?.current;if(old&&record.seconds>=old.seconds-1e-6)return [];
  return [finding(`record-${record.distanceM}`,old?'Нова най-добра GPS оценка':'Първа налична GPS оценка',`${(record.distanceM/1000).toFixed(4)} km · ${record.seconds.toFixed(1)} сек${old?` · подобрение ${(old.seconds-record.seconds).toFixed(1)} сек`:''}`,'Само след потвърден локален запис; непрекъснат интерполиран прозорец.','Не е официален състезателен резултат и не доказва едно и също географско трасе.')];
 });
}
export function insights(analysis){
 const a=analysis,out=[];
 if(!a.quality.complete||!a.quality.clockReliable||a.quality.runningEligible===false){out.push(finding('quality','Част от изводите са потиснати',a.quality.messages.join(' '),'Нужни са непрекъсната дистанция, последователни времена и подходящ спорт.','Изминалото време може да включва неизвестни прекъсвания.'));return out;}
 const halves=a.fractions[2];
 if(halves?.every(Boolean)&&a.stats.distanceM>=2000){const change=(halves[1].pace/halves[0].pace-1)*100;
  if(Math.abs(change)>=1)out.push(finding('halves',change<0?'По-бързо отчетено темпо във втората половина':'По-бавно отчетено темпо във втората половина',`${Math.abs(change).toFixed(1)}% · ${halves[0].pace.toFixed(1)} → ${halves[1].pace.toFixed(1)} сек/км`,'Две равни по дистанция половини, с интерполирани граници и изминало време.','Релефът, паузите и късното спиране могат да повлияят. Това не доказва промяна в скоростта на бегача или форма.'));
 }
 if(a.stats.distanceM>=10000){const first=interval(a.points,0,5000),last=interval(a.points,a.stats.distanceM-5000,a.stats.distanceM,{last:true});if(first&&last&&Math.abs(last.pace/first.pace-1)>=.01)out.push(finding('finish','Първи и последни 5 км',`${first.pace.toFixed(1)} / ${last.pace.toFixed(1)} сек/км`,'Еднакви 5 km прозорци в началото и края.','Късното спиране и паузите влияят на отчетените времена; не доказва еднакъв релеф, усилие или промяна в скоростта на бегача.'));}
 if(a.splits.length>=5&&a.stats.paceCV>.10)out.push(finding('variability','Големи колебания между километровите отсечки',`CV ${(a.stats.paceCV*100).toFixed(1)}%`,'Стандартно отклонение / средно темпо на пълните километри; праг 10%.','Паузи и релеф също променят темпото.'));
 if(halves?.every(Boolean)&&a.stats.elapsedSeconds>=1800&&Math.abs(halves[1].pace/halves[0].pace-1)<=.03){
  const left=sensorStats(a.points,'hr',halves[0].startTime,halves[0].endTime),right=sensorStats(a.points,'hr',halves[1].startTime,halves[1].endTime);
  const flat=a.elevation.available&&a.elevation.samples.every(p=>Math.abs(p.grade)<=.02);
  if(flat&&left.coverage>=.9&&right.coverage>=.9&&right.mean/left.mean>=1.05)out.push(finding('hr-drift','По-висок отчетен пулс при сходно темпо',`${left.mean.toFixed(0)} → ${right.mean.toFixed(0)} уд/мин; темпо в рамките на 3%`,'Равни дистанционни половини, ≥30 min, ≥90% пулсово покритие и слаб наклон.','Ориентировъчна тенденция; температура, сензор и умора не са контролирани. Не е медицински извод.'));
 }
 if(a.elevation.available&&a.splits.length>=4){const uphill=a.splits.filter(r=>r.deltaElevationM/r.lengthM>=.01),downhill=a.splits.filter(r=>r.deltaElevationM/r.lengthM<=-.01);if(uphill.length>=2&&downhill.length>=2){const mean=rows=>rows.reduce((sum,r)=>sum+r.pace,0)/rows.length,u=mean(uphill),d=mean(downhill);if(u>d*1.03)out.push(finding('hills','По-бавно темпо в изкачващите се отсечки',`${u.toFixed(1)} срещу ${d.toFixed(1)} сек/км`,'Поне 2 km отсечки във всяка група, среден наклон поне ±1%.','Нетната височина по km може да скрие локални хълмове; няма причинно заключение.'));}}
 if(a.manualLaps.length===2&&Math.abs(a.manualLaps[0].lengthM/a.manualLaps[1].lengthM-1)<.02){const [first,second]=a.manualLaps;if(Math.abs(second.pace/first.pace-1)>=.01)out.push(finding('laps','Промяна между две изчислени обиколки',`${first.pace.toFixed(1)} → ${second.pace.toFixed(1)} сек/км`,'Ръчно зададени дистанционни граници, дължини в рамките на 2%.','Не е доказано географско съвпадение на обиколките.'));}
 return out;
}
