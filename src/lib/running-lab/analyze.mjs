import {prepareActivity} from './normalize.mjs';
import {elevationProfile,elevationInterval} from './elevation.mjs';
import {atDistance,sensorStats} from './series.mjs';
import {makeSplits,manualLaps,interval} from './splits.mjs';
import {STANDARD_DISTANCES,fastestWindow} from './records.mjs';
export function analyzeActivity(activity,{distances=STANDARD_DISTANCES,...overrides}={}){
 const settings={...activity.settings,...overrides},base=prepareActivity(activity),{points,quality,stats}=base;
 const elevation=elevationProfile(points,settings.smoothingM);
 if(!quality.complete){elevation.available=false;elevation.reason='Прекъсвания или непълна дистанция: общата денивелация е потисната.';}
 const splits=quality.clockReliable&&quality.complete?makeSplits(points):[];
 if(elevation.available)for(const row of splits)Object.assign(row,elevationInterval(elevation,row.startM,row.endM));
 const fractions={};if(splits.length)for(const count of [2,3,4])fractions[count]=Array.from({length:count},(_,i)=>interval(points,i*stats.distanceM/count,(i+1)*stats.distanceM/count,{last:i===count-1}));
 const laps=quality.complete&&quality.clockReliable?manualLaps(points,settings):[];
 for(const row of [...Object.values(fractions).flat(),...laps])if(row){Object.assign(row,{hr:sensorStats(points,'hr',row.startTime,row.endTime).mean,cad:sensorStats(points,'cad',row.startTime,row.endTime).mean});if(elevation.available)Object.assign(row,elevationInterval(elevation,row.startM,row.endM));}
 if(elevation.available)for(const climb of elevation.climbs){const row=quality.clockReliable?interval(points,climb.startM,climb.endM):null;climb.pace=row?.pace??null;climb.heartRate=row?sensorStats(points,'hr',row.startTime,row.endTime).mean:null;}
 const samples=[];const stride=Math.max(1,Math.ceil(points.length/2500));
 for(let i=0;i<points.length;i+=stride){const p=points[i],a=atDistance(points,Math.max(0,p.d-50)),b=atDistance(points,Math.min(stats.distanceM,p.d+50));let pace=null;if(quality.clockReliable&&a&&b&&a.run===b.run&&b.d>a.d&&b.t>a.t)pace=(b.t-a.t)/(b.d-a.d);samples.push({...p,pace});}
 if(samples.at(-1)!==points.at(-1))samples.push({...points.at(-1),pace:samples.at(-1)?.pace??null});
 const evaluatedDistances=[...new Set([...STANDARD_DISTANCES,...distances])];const records=evaluatedDistances.map(d=>fastestWindow(points,d,quality)).filter(Boolean);
 const pacings=splits.filter(row=>row.lengthM>=999).map(row=>row.pace),mean=pacings.length?pacings.reduce((a,b)=>a+b,0)/pacings.length:null;
 return {id:activity.id,name:activity.name,settings,evaluatedDistances,stats:{...stats,heart:sensorStats(points,'hr'),cadence:sensorStats(points,'cad'),ascentM:elevation.available?elevation.ascentM:null,descentM:elevation.available?elevation.descentM:null,startElevationM:points[0].z,endElevationM:points.at(-1).z,paceCV:mean?Math.sqrt(pacings.reduce((sum,v)=>sum+(v-mean)**2,0)/pacings.length)/mean:null,fastestKm:pacings.length?Math.min(...pacings):null,slowestKm:pacings.length?Math.max(...pacings):null},quality,elevation,splits,fractions,manualLaps:laps,deviceLaps:activity.laps,records,samples,points};
}
