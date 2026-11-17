import {prepareActivity} from './normalize.mjs';
import {elevationProfile} from './elevation.mjs';
import {sensorStats} from './series.mjs';

// A separate prefix report, snapped to an actual measurement. No edits, new GPS
// records, substituted device totals or inferred official finish are made here.
export function manualFinishReport(activity,prepared,elapsedS){
 if(elapsedS===undefined||elapsedS===null)return null;
 const {quality,stats,points}=prepared;
 if(!quality.clockReliable||!quality.complete||quality.distanceSource!=='gps')return {available:false,reason:'Ръчният финал изисква надеждни последователни времена и непрекъсната GPS дистанция.'};
 if(!Number.isFinite(elapsedS)||elapsedS<=0||elapsedS>=stats.elapsedSeconds)return {available:false,reason:'Избери момент след началото и преди края на целия запис.'};
 const target=stats.start+elapsedS*1000;let lo=0,hi=points.length-1;
 while(lo+1<hi){const mid=(lo+hi)>>1;if(points[mid].t<=target)lo=mid;else hi=mid;}
 const index=Math.abs(points[lo].t-target)<=Math.abs(points[hi].t-target)?lo:hi;
 if(index<1||index>=points.length-1)return {available:false,reason:'Недостатъчно измервания преди избрания момент.'};
 const chosen=points[index],raw=activity.points.filter(p=>p.t<=chosen.t),prefix={...activity,points:raw,reported:{sport:activity.reported?.sport||''}};
 const result=prepareActivity(prefix),elevation=elevationProfile(result.points,activity.settings.smoothingM);
 return {available:true,requestedElapsedS:elapsedS,time:chosen.t,distanceM:result.stats.distanceM,
  stats:{...result.stats,heart:sensorStats(result.points,'hr'),cadence:sensorStats(result.points,'cad'),ascentM:elevation.available?elevation.ascentM:null,descentM:elevation.available?elevation.descentM:null},
  afterSeconds:stats.elapsedSeconds-result.stats.elapsedSeconds,source:'manual measured-point finish',note:'Ръчно избран край, привързан към най-близкото измерване. Отделна GPS оценка; не е официален Chip Time. Целият запис и рекордите са запазени.'};
}
