export const MODEL_VERSION = 1;
export const LIMITS = Object.freeze({fileBytes:16*1024*1024,batchBytes:64*1024*1024,archiveBytes:64*1024*1024,expandedBytes:96*1024*1024,files:200,points:100000,batchPoints:200000,activities:2000});
export const number = value => value!==null && value!==undefined && String(value).trim()!=='' && Number.isFinite(Number(value)) ? Number(value) : null;
export const bounded = (value,min,max) => {const n=number(value);return n!==null && n>=min && n<=max ? n : null;};
export const text = (value,max=200) => typeof value==='string'?value.trim().slice(0,max):'';
export function timestamp(value) {
 if(value instanceof Date)return Number.isFinite(+value)?timestamp(+value):null;
 if(typeof value==='number')return value>=631152000000 && value<=7258118400000?value:null;
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/i.test(value))return null;
 const [year,month,day]=value.slice(0,10).split('-').map(Number),calendar=new Date(Date.UTC(year,month-1,day));
 if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day)return null;
 const n=Date.parse(value);return Number.isFinite(n)?timestamp(n):null;
}
export function point(raw={},segment=0) {
 const lat=bounded(raw.lat,-90,90),lon=bounded(raw.lon,-180,180);
 return {t:timestamp(raw.t),lat:lat!==null&&lon!==null?lat:null,lon:lat!==null&&lon!==null?lon:null,
  z:bounded(raw.z,-1000,10000),hr:bounded(raw.hr,20,250),cad:bounded(raw.cad,1,300),speed:bounded(raw.speed,0,40),deviceDistance:bounded(raw.deviceDistance,0,2000000),power:bounded(raw.power,0,5000),temperature:bounded(raw.temperature,-60,80),segment};
}
export async function checksum(value) {
 const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
export function activity({points,source,name,laps=[],events=[],reported={},warnings=[]}) {
 if(!Array.isArray(points)||points.length<2||points.length>LIMITS.points)throw new Error(`Нужни са 2–${LIMITS.points.toLocaleString('bg')} точки.`);
 laps=laps.slice(0,2000).map(lap=>{let start=timestamp(lap.start),end=timestamp(lap.end);if(start!==null&&end!==null&&end<start)start=end=null;
  return {start,end,distanceM:bounded(lap.distanceM,0,2000000),timerSeconds:bounded(lap.timerSeconds,0,604800),source:'device'};});
 events=events.slice(0,10000).flatMap(event=>{const t=timestamp(event.t);return t!==null&&['start','stop'].includes(event.type)?[{t,type:event.type,source:'device'}]:[];});
 return {version:MODEL_VERSION,id:`run-${source.hash}-${source.index||0}`,name:text(name)||text(source.name)||'Бягане',comment:'',source:{...source,originalBytesRetained:false,timeConvention:'UTC epoch ms; изходните ISO отмествания се зачитат'},points,
  laps,events,reported,warnings:warnings.slice(0,100),settings:{smoothingM:100,altitudeSource:'unknown',lapLengthM:null,lapBoundaries:[]},
  provenance:{coordinates:'file',time:'file, timezone-aware',deviceDistance:'device',altitude:'device, sensor type unconfirmed',heartRate:'sensor report',cadence:'reported cycles/min; no doubling',derived:'DIDO distance/time algorithms v1'}};
}
