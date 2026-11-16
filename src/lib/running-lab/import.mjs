import {activity,checksum,LIMITS} from './model.mjs';
import {parseGpxWorkout,parseTcxWorkout} from './xml-import.mjs';
export async function importWorkout(bytes,name){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>LIMITS.fileBytes)throw new Error('Файлът е празен или надвишава 16 MiB.');
 const format=String(name).split('.').at(-1).toLowerCase();
 const hash=await checksum(bytes);let runs;
 if(format==='gpx'||format==='tcx'){
  const xml=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  runs=format==='gpx'?parseGpxWorkout(xml):parseTcxWorkout(xml);
 }else if(format==='fit'){const {parseFitWorkout}=await import('./fit-import.mjs');runs=await parseFitWorkout(bytes);}
 else throw new Error('Поддържат се GPX, TCX и FIT.');
 if(!runs.length)throw new Error('Файлът няма използваема тренировка.');
 return runs.map((run,index)=>activity({...run,source:{format,name:String(name).slice(0,200),hash,index}}));
}
