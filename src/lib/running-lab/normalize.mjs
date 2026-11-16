import {distanceBetween} from '../geo.mjs';
import {bounded} from './model.mjs';
export const QUALITY_RULES=Object.freeze({maxSpeedMps:12,maxGapS:30,maxEdgeM:500,recordGapS:10,recordEdgeM:100});
export function prepareActivity(activity){
 const sport=String(activity.reported?.sport||'').toLowerCase(),runningEligible=!sport||['running','run','generic','unknown'].includes(sport);
 // Exact repeated measurements at a TCX lap boundary are redundant, not a backwards clock.
 // The unmodified input remains in the stored model. Explicit GPX segments stay separate.
 const raw=activity.points.filter((p,i,all)=>!(activity.source.format==='tcx'&&i&&p.t!==null&&Object.keys(p).every(key=>p[key]===all[i-1][key])));
 const duplicates=activity.points.length-raw.length,geometry=raw.filter(p=>p.lat!==null&&p.lon!==null).length/raw.length;
 const deviceCoverage=raw.filter(p=>p.deviceDistance!==null).length/raw.length;
 const distanceSource=geometry>=.98?'gps':deviceCoverage>=.98?'device':geometry>0?'partial-gps':'unavailable';
 let distanceM=0,run=0,gaps=0,jumps=0,missing=0,nonmonotonic=0,breaks=0,clockReliable=raw.every(p=>Number.isFinite(p.t)),maxStepSeconds=0;
 const points=raw.map((p,i)=>{
  if(!i)return {...p,d:0,run:0};
  const a=raw[i-1],dt=clockReliable?(p.t-a.t)/1000:null;
  if(Number.isFinite(p.t)&&Number.isFinite(a.t)&&p.t<=a.t){nonmonotonic++;}
  let dx=distanceSource==='device'?(p.deviceDistance!==null&&a.deviceDistance!==null?p.deviceDistance-a.deviceDistance:null):p.lat!==null&&a.lat!==null?distanceBetween(a,p):null;
  let valid=true;
  if(p.segment!==a.segment){valid=false;breaks++;}
  else if(dx===null||dx<0){valid=false;missing++;}
  else if(dt!==null&&dt<=0){valid=false;}
  else if(dt!==null&&dt>QUALITY_RULES.maxGapS || dx>QUALITY_RULES.maxEdgeM){valid=false;gaps++;}
  else if(dt!==null&&dx/dt>QUALITY_RULES.maxSpeedMps){valid=false;jumps++;}
  if(!valid)run++;else{distanceM+=dx;if(dt!==null)maxStepSeconds=Math.max(maxStepSeconds,dt);}
  return {...p,d:distanceM,run};
 });
 clockReliable=clockReliable&&!nonmonotonic;
 const complete=distanceM>0&&!gaps&&!jumps&&!missing&&!breaks&&distanceSource!=='partial-gps';
 const start=clockReliable?raw[0].t:null,end=clockReliable?raw.at(-1).t:null;
 const elapsedSeconds=clockReliable?(end-start)/1000:null;
 let moving=0;
 if(clockReliable&&complete)for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dt=(b.t-a.t)/1000;if((b.d-a.d)/dt>=.5)moving+=dt;}
 const reportedTimer=bounded(activity.reported?.timerSeconds,0,elapsedSeconds===null?604800:elapsedSeconds+1);
 let timer=0,eventValid=true,stops=0,active=null,cursor=start,knownAtStart=false;
 const events=(activity.events||[]).filter(e=>e.t<=end);
 for(let i=0;i<events.length;i++){
  const event=events[i];if(i&&event.t<events[i-1].t)eventValid=false;
  if(event.t<=start){active=event.type==='start';knownAtStart=true;continue;}
  if(active===true)timer+=Math.max(0,event.t-cursor)/1000;
  if(event.type==='stop'&&active===true)stops++;
  active=event.type==='start';cursor=event.t;
 }
 if(active===true&&end!==null)timer+=Math.max(0,end-cursor)/1000;
 const eventTimer=clockReliable&&knownAtStart&&eventValid?timer:null;
 const timerSeconds=reportedTimer??eventTimer;
 const messages=[];
 if(!runningEligible)messages.push(`Отчетеният спорт е „${sport}“. GPS рекордите и бегаческите изводи са потиснати. Филтрите за скорост са за бягане, не за този спорт.`);
 if(duplicates)messages.push(`Пропуснати са ${duplicates} точно повторени TCX измервания; оригиналните точки са запазени.`);
 if(!clockReliable)messages.push('Липсват надеждни последователни времена: темпо, отсечки и GPS рекорди са ограничени.');
 if(gaps||jumps||missing||breaks)messages.push(`Прекъсвания: ${gaps+missing+breaks}; отхвърлени скокове: ${jumps}. Не свързваме отсечените интервали.`);
 if(distanceSource==='device')messages.push('Дистанцията е от устройството; липсва пълна GPS геометрия. GPS рекорди не се присъждат.');
 if(distanceSource==='partial-gps')messages.push('GPS геометрията е непълна; дистанцията е сбор само на проверимите интервали.');
 if(distanceSource==='unavailable')messages.push('Няма измерима дистанция. Не я заместваме с нула; времевите и сензорните данни могат да се анализират отделно.');
 else if(!distanceM)messages.push('Няма положителна измерена дистанция; темпо и GPS рекорди не се изчисляват.');
 if(activity.reported?.distanceM>0&&Math.abs(activity.reported.distanceM-distanceM)/activity.reported.distanceM>.1)messages.push('Изчислената дистанция се различава с над 10% от отчета на устройството; няма автоматично коригиране.');
 return {points,quality:{clockReliable,complete,runningEligible,reportedSport:sport||null,distanceSource,geometryCoverage:geometry,gaps,jumps,missing,breaks,nonmonotonic,duplicates,maxStepSeconds,messages},
  stats:{distanceM:distanceSource==='unavailable'?null:distanceM,start,end,elapsedSeconds,timerSeconds,timerSource:reportedTimer!==null?'device summary':eventTimer!==null?'device events':null,confirmedPauseSeconds:eventTimer!==null?elapsedSeconds-eventTimer:null,confirmedStops:eventTimer!==null?stops:0,movingSeconds:clockReliable&&complete?moving:null,estimatedStopSeconds:clockReliable&&complete?elapsedSeconds-moving:null,pace:clockReliable&&complete?elapsedSeconds*1000/distanceM:null,speed:clockReliable&&complete?distanceM/elapsedSeconds:null}};
}
