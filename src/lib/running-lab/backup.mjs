import {MODEL_VERSION,LIMITS,point,checksum,text,timestamp,bounded} from './model.mjs';
import {officialResult,validateDistance} from './history.mjs';
/** @returns {import('./types').LabPreferences} */
export const defaultPreferences=()=>({version:1,customDistances:[],officialResults:[],timeZone:'Europe/Sofia'});
/** @returns {import('./types').LabPreferences} */
export function validatePreferences(value){
 if(!value||value.version!==1||!Array.isArray(value.customDistances)||value.customDistances.length>20||!Array.isArray(value.officialResults)||value.officialResults.length>2000)throw new Error('Невалидни настройки/официални резултати.');
 const timeZone=text(value.timeZone)||'Europe/Sofia';try{new Intl.DateTimeFormat('bg',{timeZone}).format();}catch{throw new Error('Невалидна часова зона.');}
 const results=value.officialResults.map(officialResult);if(new Set(results.map(r=>r.id)).size!==results.length)throw new Error('Повтарящи се официални резултати.');
 return {version:1,customDistances:[...new Set(value.customDistances.map(validateDistance))],officialResults:results,timeZone};
}
export function validateActivity(value){
 if(!value||value.version!==MODEL_VERSION||!value.source||!['gpx','tcx','fit'].includes(value.source.format)||!/^[a-f0-9]{64}$/.test(value.source.hash)||!Number.isInteger(value.source.index)||value.id!==`run-${value.source.hash}-${value.source.index}`||typeof value.name!=='string'||value.name.length>200||typeof value.comment!=='string'||value.comment.length>2000)throw new Error('Невалидна схема на тренировка.');
 if(value.source.index<0||value.source.index>=LIMITS.files||typeof value.source.name!=='string'||value.source.name.length>200||value.source.originalBytesRetained!==false||!value.name.trim())throw new Error('Невалиден произход на тренировка.');
 if(!value.reported||typeof value.reported!=='object'||Array.isArray(value.reported)||Object.keys(value.reported).length>20||Object.values(value.reported).some(v=>v!==null&&(typeof v==='number'?!Number.isFinite(v)||v<0||v>2000000:typeof v!=='string'||v.length>500))||!value.provenance||typeof value.provenance!=='object'||Object.values(value.provenance).some(v=>typeof v!=='string'||v.length>500))throw new Error('Невалидни метаданни.');
 if(!Array.isArray(value.points)||value.points.length<2||value.points.length>LIMITS.points)throw new Error('Невалиден брой точки в архива.');
 const allowed=['t','lat','lon','z','hr','cad','speed','deviceDistance','power','temperature','segment'];
 for(const p of value.points){
  if(!p||Object.keys(p).length!==allowed.length||Object.keys(p).some(key=>!allowed.includes(key))||!Number.isInteger(p.segment)||p.segment<0||p.segment>LIMITS.points)throw new Error('Невалидна GPS/сензорна точка.');
  const normalized=point(p,p.segment);if(allowed.some(key=>normalized[key]!==p[key]))throw new Error('Стойност извън допустимите граници в архива.');
 }
 const settings=value.settings;
 if(!settings||![25,50,100,200].includes(settings.smoothingM)||!['unknown','gps','barometer'].includes(settings.altitudeSource)||!Array.isArray(settings.lapBoundaries)||settings.lapBoundaries.length>1000||settings.lapBoundaries.some((n,i)=>!Number.isFinite(n)||n<=0||n>2000000||i&&n<=settings.lapBoundaries[i-1]))throw new Error('Невалидни настройки на анализа.');
 if(settings.lapLengthM!==null)validateDistance(settings.lapLengthM);
 if(!Array.isArray(value.events)||value.events.length>10000||value.events.some(e=>!e||timestamp(e.t)!==e.t||!['start','stop'].includes(e.type)))throw new Error('Невалидни timer събития.');
 if(!Array.isArray(value.laps)||value.laps.length>2000||value.laps.some(lap=>!lap||lap.source!=='device'||['start','end'].some(k=>lap[k]!==null&&(timestamp(lap[k])!==lap[k]))||lap.start!==null&&lap.end!==null&&lap.end<lap.start||lap.distanceM!==null&&bounded(lap.distanceM,0,2000000)!==lap.distanceM||lap.timerSeconds!==null&&bounded(lap.timerSeconds,0,604800)!==lap.timerSeconds)||!Array.isArray(value.warnings)||value.warnings.length>100||value.warnings.some(message=>typeof message!=='string'||message.length>2000))throw new Error('Невалидни обиколки/диагностика.');
 return value;
}
function safeTree(value,depth=0,budget={n:0}){
 if(++budget.n>7000000||depth>20)throw new Error('Архивът е прекалено сложен.');
 if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Невалидно число в архива.');
 if(value&&typeof value==='object')for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key))throw new Error('Недопустимо поле в архива.');safeTree(value[key],depth+1,budget);}
}
export async function createArchive(activities,preferences){
 activities.forEach(validateActivity);const payload={version:1,activities,preferences:validatePreferences(preferences)};
 safeTree(payload);
 const serialized=JSON.stringify(payload);if(new TextEncoder().encode(serialized).length>LIMITS.archiveBytes-1024)throw new Error('Архивът надвишава 64 MiB.');
 return JSON.stringify({format:'DIDO-Running-Lab',version:1,createdAt:new Date().toISOString(),checksum:await checksum(serialized),payload});
}
export async function validateArchive(source){
 if(typeof source!=='string'||new TextEncoder().encode(source).length>LIMITS.archiveBytes)throw new Error('Архивът е празен или надвишава 64 MiB.');
 let document;try{document=JSON.parse(source);}catch{throw new Error('Повреден JSON архив.');}
 safeTree(document);
 if(document?.format!=='DIDO-Running-Lab'||document.version!==1||document.payload?.version!==1||!Array.isArray(document.payload.activities)||document.payload.activities.length>LIMITS.activities)throw new Error('Неподдържан формат/версия на архива.');
 if(await checksum(JSON.stringify(document.payload))!==document.checksum)throw new Error('Checksum на архива не съвпада. Не е направена промяна в библиотеката.');
 document.payload.activities.forEach(validateActivity);
 if(new Set(document.payload.activities.map(a=>a.id)).size!==document.payload.activities.length)throw new Error('Архивът съдържа повторени идентификатори.');
 return {activities:document.payload.activities,preferences:validatePreferences(document.payload.preferences)};
}
