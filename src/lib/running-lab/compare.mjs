import {atDistance,atTime} from './series.mjs';
import {distanceBetween} from '../geo.mjs';
export function compareActivities(analyses,mode='distance'){
 if(analyses.length<2||analyses.length>3)throw new Error('Избери две или три тренировки.');
 if(!['distance','time','splits','laps'].includes(mode))throw new Error('Непознат режим за сравнение.');
 const timed=analyses.every(a=>a.quality.clockReliable&&a.quality.complete&&a.quality.runningEligible!==false);
 const commonDistanceM=analyses.every(a=>a.stats.distanceM!==null)?Math.min(...analyses.map(a=>a.stats.distanceM)):0,commonSeconds=timed?Math.min(...analyses.map(a=>a.stats.elapsedSeconds)):null;
 const rows=analyses.map(a=>{
  const last=mode==='time'&&commonSeconds!==null?atTime(a.points,a.stats.start+commonSeconds*1000):atDistance(a.points,commonDistanceM);
  const seconds=timed&&last?(last.t-a.stats.start)/1000:null,distanceM=last?.d??null;
  return {id:a.id,name:a.name,distanceM,seconds,pace:seconds!==null&&distanceM>0?seconds*1000/distanceM:null,heartRate:a.stats.heart.mean,ascentM:a.stats.ascentM,elapsedSeconds:a.stats.elapsedSeconds,fullDistanceM:a.stats.distanceM};
 });
 const table=mode==='laps'?Array.from({length:Math.min(...analyses.map(a=>a.manualLaps.length||a.deviceLaps.length))},(_,i)=>({index:i+1,values:analyses.map(a=>a.manualLaps[i]||a.deviceLaps[i])})):
  mode==='splits'?Array.from({length:Math.floor(commonDistanceM/1000)},(_,i)=>({index:i+1,values:analyses.map(a=>a.splits[i]||null)})):[];
 const findings=[];if(timed&&rows.every(r=>r.seconds!==null)&&commonDistanceM>=1000)for(const [i,row]of rows.slice(1).entries()){
  const delta=row.seconds-rows[0].seconds,distanceDelta=row.distanceM-rows[0].distanceM;
  if(mode!=='time'&&Math.abs(delta)>=1)findings.push({id:'comparison-'+i,title:'Разлика по общия дистанционен участък',values:`${Math.abs(delta).toFixed(1)} сек; ${row.name} е ${delta<0?'по-бързо':'по-бавно'} от ${rows[0].name}`,method:`Първите ${(commonDistanceM/1000).toFixed(2)} км от всяка тренировка.`,limitation:'Сходна дистанция не доказва еднакво трасе, посока, атмосферни условия или усилие.'});
  if(mode==='time'&&Math.abs(distanceDelta)>=10)findings.push({id:'comparison-time-'+i,title:'Разлика по общото изминало време',values:`${row.name}: ${distanceDelta>0?'+':''}${distanceDelta.toFixed(0)} m спрямо ${rows[0].name}`,method:`Първите ${commonSeconds.toFixed(0)} s от всяка тренировка, с интерполация по време.`,limitation:'Не доказва еднакъв маршрут или усилие; спиранията са включени.'});
 }
 return {mode,rows,table,findings,commonDistanceM,commonSeconds,timed,warning:timed?'Сравнението е по общ действителен участък; няма разтягане на данните.':'Темповото сравнение е потиснато: ненадеждни времена/дистанции или неподходящ отчетен спорт.'};
}
export function probableDuplicate(a,other){
 if(a.source.hash===other.source.hash&&a.source.index===other.source.index)return 'exact';
 const x=a.summary||a.stats,y=other.summary||other.stats;
 if(!x||!y||x.start===null||y.start===null)return null;
 const close=Math.abs(x.start-y.start)<=60000&&Math.abs(x.distanceM-y.distanceM)<=Math.max(100,x.distanceM*.02)&&x.elapsedSeconds!==null&&y.elapsedSeconds!==null&&Math.abs(x.elapsedSeconds-y.elapsedSeconds)<=Math.max(15,x.elapsedSeconds*.02);
 if(close&&a.geometry?.length&&other.geometry?.length){const count=Math.min(a.geometry.length,other.geometry.length);const separation=a.geometry.slice(0,count).reduce((sum,p,i)=>sum+distanceBetween(p,other.geometry[i]),0)/count;if(separation>200)return null;}
 return close?'probable':null;
}
