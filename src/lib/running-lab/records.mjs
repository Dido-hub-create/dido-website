import {cleanRuns} from './series.mjs';
export const STANDARD_DISTANCES=[1000,3000,5000,10000,15000,20000,21000,21097.5,42195];
// Queries increase monotonically. Each cursor crosses the series once, retaining
// first/last semantics at a stationary plateau without sorting or binary searches.
function timeCursor(points,last){
 let next=0;
 return d=>{while(next<points.length&&(points[next].d<d||last&&points[next].d===d))next++;
  if(last&&next&&points[next-1].d===d)return points[next-1].t;
  if(next<points.length&&points[next].d===d)return points[next].t;
  const b=points[Math.min(next,points.length-1)],a=points[Math.max(0,next-1)];
  return a.t+(b.t-a.t)*(b.d>a.d?(d-a.d)/(b.d-a.d):0);
 };
}
export function fastestWindow(points,distanceM,quality){
 if(!quality.clockReliable||quality.distanceSource!=='gps'||!(distanceM>=100&&distanceM<=100000))return null;
 let best=null;
 for(const run of cleanRuns(points)){
  // A record cannot contain a sparse interval, even if it was usable for totals.
  const pieces=[];let piece=[];
  for(const p of run){const previous=piece.at(-1);if(previous&&((p.t-previous.t)>10000||p.d-previous.d>100)){if(piece.length>1)pieces.push(piece);piece=[];}piece.push(p);}if(piece.length>1)pieces.push(piece);
  for(const part of pieces){
   if(part.at(-1).d-part[0].d+1e-7<distanceM)continue;
   const startTimeAt=timeCursor(part,true),endTimeAt=timeCursor(part,false),min=part[0].d,max=part.at(-1).d-distanceM;
   let left=0,right=0,previous=-Infinity;
   // A minimum of t(s + D) - t(s) lies at a measurement or at a shifted end
   // measurement. Merge these two already sorted candidate streams in O(n).
   while(left<part.length||right<part.length){
    const a=left<part.length?part[left].d:Infinity,b=right<part.length?part[right].d-distanceM:Infinity,candidate=Math.min(a,b);
    if(a===candidate)left++;if(b===candidate)right++;
    if(candidate<min-1e-7||candidate===previous)continue;if(candidate>max+1e-7)break;
    previous=candidate;const startM=Math.max(min,Math.min(max,candidate)),startTime=startTimeAt(startM),endTime=endTimeAt(startM+distanceM),seconds=(endTime-startTime)/1000;
    if(seconds>0&&(!best||seconds<best.seconds-1e-7))best={distanceM,seconds,pace:seconds*1000/distanceM,startM,endM:startM+distanceM,startTime,endTime,source:'GPS estimate',quality:'continuous interpolated GPS; not an official result'};
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
