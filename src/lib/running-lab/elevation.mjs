import {cleanRuns} from './series.mjs';
import {detectClimbs} from '../profile-terrain.mjs';
export const ELEVATION_RULES=Object.freeze({jumpM:10,jumpGrade:.5});
export function elevationInterval(profile,start,end){
 const points=profile.samples;if(!profile.available||!points.length)return null;
 const at=d=>{let lo=0,hi=points.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(points[m].d<=d)lo=m;else hi=m;}const a=points[lo],b=points[hi],ratio=b.d>a.d?(d-a.d)/(b.d-a.d):0;return {d,ele:a.ele+ratio*(b.ele-a.ele)};};
 const section=[at(start),...points.filter(p=>p.d>start&&p.d<end),at(end)];let ascentM=0,descentM=0;
 for(let i=1;i<section.length;i++){const delta=section[i].ele-section[i-1].ele;ascentM+=Math.max(0,delta);descentM+=Math.max(0,-delta);}
 return {ascentM,descentM,deltaElevationM:section.at(-1).ele-section[0].ele};
}
export function elevationProfile(points,windowM=100){
 if(![25,50,100,200].includes(windowM))throw new Error('Невалидно изглаждане.');
 if(points.some(p=>!Number.isFinite(p.z)))return {available:false,reason:'Липсват пълни височини.',samples:[],climbs:[]};
 const samples=[],climbs=[];let ascentM=0,descentM=0;
 const step=Math.max(10,points.at(-1).d/10000);
 for(const run of cleanRuns(points)){
  const unique=[];for(const p of run){if(unique.at(-1)?.d===p.d)unique[unique.length-1]=p;else unique.push(p);}
  // Tiny horizontal GPS jitter must not turn centimetres of height noise into
  // an impossible slope. Reject a jump only above both the absolute and grade bounds.
  if(unique.some((p,i)=>i&&Math.abs(p.z-unique[i-1].z)>Math.max(ELEVATION_RULES.jumpM,(p.d-unique[i-1].d)*ELEVATION_RULES.jumpGrade)))return {available:false,reason:'Нереалистични вертикални скокове (над 10 m и над 50% в един интервал).',samples:[],climbs:[]};
  const area=[0];for(let i=1;i<unique.length;i++)area.push(area[i-1]+(unique[i].d-unique[i-1].d)*(unique[i].z+unique[i-1].z)/2);
  function integral(d){let lo=0,hi=unique.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(unique[mid].d<=d)lo=mid;else hi=mid;}const a=unique[lo],b=unique[hi],dx=d-a.d,z=a.z+(b.z-a.z)*dx/(b.d-a.d);return area[lo]+dx*(a.z+z)/2;}
  const smoothed=[],start=unique[0].d,end=unique.at(-1).d;
  for(let d=start;d<end+step;d+=step){const x=Math.min(d,end),left=Math.max(start,x-windowM/2),right=Math.min(end,x+windowM/2);smoothed.push({d:x,x,ele:(integral(right)-integral(left))/(right-left),run:run[0].run});if(x===end)break;}
  smoothed.forEach((p,i)=>{p.grade=i?(p.ele-smoothed[i-1].ele)/(p.d-smoothed[i-1].d):0;if(i){const delta=p.ele-smoothed[i-1].ele;ascentM+=Math.max(0,delta);descentM+=Math.max(0,-delta);}});
  climbs.push(...detectClimbs(smoothed).map(c=>({...c,run:run[0].run})));samples.push(...smoothed);
 }
 return {available:samples.length>1,reason:'Оценка след дистанционно изглаждане; типът на височинния сензор не е потвърден.',samples,climbs:climbs.sort((a,b)=>b.gainM-a.gainM).slice(0,3),ascentM,descentM,startM:points[0].z,endM:points.at(-1).z,windowM};
}
