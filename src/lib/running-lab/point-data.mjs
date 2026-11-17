import {closestSample} from './map-data.mjs';

// Presentation only. Coordinates/times remain the selected measured point;
// local pace and gradient reuse the existing analytic series in the same run.
export function pointData(analysis,point,zone='Europe/Sofia'){
 const a=analysis,p=point,finite=value=>Number.isFinite(value)?value:null;
 const timed=!!a.quality.clockReliable&&Number.isFinite(p.t),sample=closestSample(a.samples,timed?p.t:p.d,timed?'t':'d',p.run);
 const pace=Number.isFinite(p.pace)?p.pace:sample?.pace;
 const grade=a.elevation.available&&a.gradient?.available?closestSample(a.gradient.samples,p.d,'d',p.run)?.grade:null;
 let clock=null;if(timed)try{clock=new Intl.DateTimeFormat('bg-BG',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(p.t);}catch{/* An invalid display zone must not break interaction. */}
 return {distanceM:finite(p.d),elapsedS:timed?(p.t-a.stats.start)/1000:null,clock,
  pace:Number.isFinite(pace)&&pace>0?pace:null,heart:finite(p.hr),cadence:Number.isFinite(p.cad)?p.cad*(a.cadenceDisplay?.factor||1):null,
  cadenceUnit:a.cadenceDisplay?.unit||'отчетени ед./мин',elevationM:finite(p.z),gradePercent:Number.isFinite(grade)?grade*100:null,
  hasGps:Number.isFinite(p.lat)&&Number.isFinite(p.lon)};
}
