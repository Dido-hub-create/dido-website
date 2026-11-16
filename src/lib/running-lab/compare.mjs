import {atDistance,atTime} from './series.mjs';
export function compareActivities(analyses,mode='distance'){
 if(analyses.length<2||analyses.length>3)throw new Error('Избери две или три тренировки.');
 if(!['distance','time','splits','laps'].includes(mode))throw new Error('Непознат режим за сравнение.');
 const timed=analyses.every(a=>a.quality.clockReliable&&a.quality.complete);
 const commonDistanceM=Math.min(...analyses.map(a=>a.stats.distanceM)),commonSeconds=timed?Math.min(...analyses.map(a=>a.stats.elapsedSeconds)):null;
 const rows=analyses.map(a=>{
  const last=mode==='time'&&commonSeconds!==null?atTime(a.points,a.stats.start+commonSeconds*1000):atDistance(a.points,commonDistanceM);
  const seconds=timed&&last?(last.t-a.stats.start)/1000:null,distanceM=last?.d??null;
  return {id:a.id,name:a.name,distanceM,seconds,pace:seconds!==null&&distanceM>0?seconds*1000/distanceM:null,heartRate:a.stats.heart.mean,ascentM:a.stats.ascentM,elapsedSeconds:a.stats.elapsedSeconds,fullDistanceM:a.stats.distanceM};
 });
 const table=mode==='laps'?Array.from({length:Math.min(...analyses.map(a=>a.manualLaps.length||a.deviceLaps.length))},(_,i)=>({index:i+1,values:analyses.map(a=>a.manualLaps[i]||a.deviceLaps[i])})):
  mode==='splits'?Array.from({length:Math.floor(commonDistanceM/1000)},(_,i)=>({index:i+1,values:analyses.map(a=>a.splits[i]||null)})):[];
 const findings=[];if(timed&&rows.every(r=>r.seconds!==null)&&commonDistanceM>=1000){const delta=rows[1].seconds-rows[0].seconds;
  if(mode!=='time'&&Math.abs(delta)>=1)findings.push({id:'comparison',title:'Разлика по общия дистанционен участък',values:`${Math.abs(delta).toFixed(1)} сек; ${rows[1].name} е ${delta<0?'по-бързо':'по-бавно'} от ${rows[0].name}`,method:`Първите ${(commonDistanceM/1000).toFixed(2)} км от всяка тренировка.`,limitation:'Сходна дистанция не доказва еднакво трасе, посока, атмосферни условия или усилие.'});}
 return {mode,rows,table,findings,commonDistanceM,commonSeconds,timed,warning:timed?'Сравнението е по общ действителен участък; няма разтягане на данните.':'Темповото сравнение е потиснато: липсват надеждни времена/дистанции.'};
}
export function probableDuplicate(a,other){
 if(a.source.hash===other.source.hash&&a.source.index===other.source.index)return 'exact';
 const x=a.summary||a.stats,y=other.summary||other.stats;
 if(!x||!y||x.start===null||y.start===null)return null;
 const close=Math.abs(x.start-y.start)<=60000&&Math.abs(x.distanceM-y.distanceM)<=Math.max(100,x.distanceM*.02)&&x.elapsedSeconds!==null&&y.elapsedSeconds!==null&&Math.abs(x.elapsedSeconds-y.elapsedSeconds)<=Math.max(15,x.elapsedSeconds*.02);
 return close?'probable':null;
}
