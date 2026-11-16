import {point,number,text,timestamp,bounded,LIMITS} from './model.mjs';
import {inspectFit} from './fit-framing.mjs';
export async function parseFitWorkout(bytes){
 inspectFit(bytes);
 const {default:FitParser}=await import('fit-file-parser');
 let data;
 try{data=await new FitParser({force:false,strict:true,mode:'list',speedUnit:'m/s',lengthUnit:'m',temperatureUnit:'celsius'}).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));}
 catch{throw new Error('FIT е повреден, непълен или с невалидна CRC проверка. Не се допуска принудително декодиране.');}
 if(!data.records?.length||data.records.length>LIMITS.points)throw new Error('FIT няма използваеми записи или надвишава ограничението за точки.');
 const sessions=data.sessions?.length?data.sessions:[{}];
 return sessions.map(session=>{
  const start=+session.start_time,end=+session.timestamp;
  const records=data.records.filter(p=>sessions.length===1 || +p.timestamp>=start&&+p.timestamp<=end);
  const points=records.map(p=>point({t:p.timestamp,lat:p.position_lat,lon:p.position_long,z:p.enhanced_altitude??p.altitude,deviceDistance:p.distance,hr:p.heart_rate,cad:p.cadence,speed:p.enhanced_speed??p.speed,power:p.power,temperature:p.temperature},0));
  const events=(data.events||[]).filter(e=>e.event==='timer').map(e=>({t:+e.timestamp,type:e.event_type==='start'?'start':['stop','stop_all','stop_disable','stop_disable_all'].includes(e.event_type)?'stop':'other',source:'device'})).filter(e=>Number.isFinite(e.t)&&e.type!=='other');
  const laps=(data.laps||[]).filter(lap=>sessions.length===1||+lap.timestamp>=start&&+lap.start_time<=end).map(lap=>({start:timestamp(lap.start_time),end:timestamp(lap.timestamp),timerSeconds:bounded(lap.total_timer_time,0,604800),distanceM:bounded(lap.total_distance,0,2000000),source:'device'}));
  return {points,events,laps,name:'',reported:{timerSeconds:number(session.total_timer_time),elapsedSeconds:number(session.total_elapsed_time),distanceM:number(session.total_distance),sport:text(session.sport),deviceId:text(String(data.file_ids?.[0]?.serial_number??''))},warnings:[]};
 }).filter(run=>run.points.length>=2);
}
