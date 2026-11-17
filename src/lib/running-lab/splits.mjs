import {atDistance,sensorStats} from './series.mjs';
export function interval(points,startM,endM,{record=false,last=false}={}){
 const a=atDistance(points,startM,record?'last':'first'),b=atDistance(points,endM,last?'last':'first');
 if(!a||!b||a.run!==b.run||a.t===null||b.t===null||b.t<=a.t||endM<=startM)return null;
 const seconds=(b.t-a.t)/1000,lengthM=endM-startM;
 return {startM,endM,lengthM,seconds,pace:seconds*1000/lengthM,startTime:a.t,endTime:b.t,deltaElevationM:a.z!==null&&b.z!==null?b.z-a.z:null};
}
export function makeSplits(points,length=1000){
 const end=points.at(-1).d,rows=[];
 for(let start=0;start<end-1e-6;start+=length){const row=interval(points,start,Math.min(end,start+length),{last:start+length>=end});if(!row)return [];rows.push({...row,hr:sensorStats(points,'hr',row.startTime,row.endTime).mean,cad:sensorStats(points,'cad',row.startTime,row.endTime).mean});}
 return rows;
}
export function manualLaps(points,settings){
 if(!settings.lapLengthM&&!settings.lapBoundaries?.length)return [];
 const end=points.at(-1).d,markers=[0,...(settings.lapBoundaries||[]),end];
 if(settings.lapLengthM>0){markers.splice(1,markers.length-2);for(let x=settings.lapLengthM;x<end;x+=settings.lapLengthM)markers.splice(markers.length-1,0,x);}
 return markers.slice(1).flatMap((x,i)=>{const row=interval(points,markers[i],x,{last:i===markers.length-2});return row?[{...row,source:'calculated'}]:[];});
}
