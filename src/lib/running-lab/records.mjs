import {atDistance,cleanRuns} from './series.mjs';
export const STANDARD_DISTANCES=[1000,3000,5000,10000,15000,20000,21000,21097.5,42195];
export function fastestWindow(points,distanceM,quality){
 if(!quality.clockReliable||quality.distanceSource!=='gps'||!(distanceM>=100&&distanceM<=100000))return null;
 let best=null;
 for(const run of cleanRuns(points)){
  // A record cannot contain a sparse interval, even if it was usable for totals.
  const pieces=[];let piece=[];
  for(const p of run){const previous=piece.at(-1);if(previous&&((p.t-previous.t)>10000||p.d-previous.d>100)){if(piece.length>1)pieces.push(piece);piece=[];}piece.push(p);}if(piece.length>1)pieces.push(piece);
  for(const part of pieces){
   if(part.at(-1).d-part[0].d+1e-7<distanceM)continue;
   const candidates=[...new Set(part.flatMap(p=>[p.d,p.d-distanceM]).filter(d=>d>=part[0].d-1e-7&&d+distanceM<=part.at(-1).d+1e-7))].sort((a,b)=>a-b);
   for(const startM of candidates){const a=atDistance(part,startM,'last'),b=atDistance(part,startM+distanceM);if(!a||!b)continue;const seconds=(b.t-a.t)/1000;
    if(seconds>0&&(!best||seconds<best.seconds-1e-7))best={distanceM,seconds,pace:seconds*1000/distanceM,startM,endM:startM+distanceM,startTime:a.t,endTime:b.t,source:'GPS estimate',quality:'continuous interpolated GPS; not an official result'};
   }
  }
 }return best;
}
export function recordHistory(analyses,distances=STANDARD_DISTANCES){
 return distances.map(distanceM=>{
  const attempts=analyses.flatMap(a=>{const r=a.records.find(r=>r.distanceM===distanceM);return r?[{...r,activityId:a.id,name:a.name,date:a.stats.start,settings:a.settings}]:[];}).sort((a,b)=>a.date-b.date||a.activityId.localeCompare(b.activityId));
  const history=[];let previous=null;
  for(const attempt of attempts){if(!previous||attempt.seconds<previous.seconds-1e-6){history.push({...attempt,previousSeconds:previous?.seconds??null,improvementSeconds:previous?previous.seconds-attempt.seconds:null});previous=attempt;}}
  return {distanceM,current:previous,history,attempts};
 });
}
