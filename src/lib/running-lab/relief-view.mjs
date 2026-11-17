import {closestSample} from './map-data.mjs';

// Read-only projection of the existing checked, distance-smoothed analysis.
// No second smoothing algorithm, height correction or change to stored points.
export function reliefAvailable(a){
 const rows=a?.elevation?.samples;
 return !!a?.elevation?.available&&!!a?.quality?.complete&&Array.isArray(rows)&&rows.length>1&&
  rows.every((p,i)=>Number.isFinite(p.d)&&Number.isFinite(p.ele)&&(!i||p.d>=rows[i-1].d));
}
export function reliefValues(a,axis='distance'){
 if(!reliefAvailable(a))return [];
 return a.elevation.samples.map(p=>{
  const measured=axis==='time'?closestSample(a.points||a.samples,p.d,'d',p.run):null;
  return {x:axis==='time'?(Number.isFinite(measured?.t)?(measured.t-a.stats.start)/60000:NaN):p.d/1000,y:p.ele,run:p.run};
 });
}
export function reliefAt(a,point){
 if(!reliefAvailable(a)||!Number.isFinite(point?.d))return null;
 return closestSample(a.elevation.samples,point.d,'d',point.run)?.ele??null;
}
