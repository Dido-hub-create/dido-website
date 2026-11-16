import {importWorkout} from '../../lib/running-lab/import.mjs';
import {expandZip} from '../../lib/running-lab/zip-import.mjs';
import {analyzeActivity} from '../../lib/running-lab/analyze.mjs';
import {insights} from '../../lib/running-lab/insights.mjs';
import {compareActivities} from '../../lib/running-lab/compare.mjs';
import {validateArchive,createArchive,validateActivity} from '../../lib/running-lab/backup.mjs';
import {metadata} from '../../lib/running-lab/library.mjs';
import {interval} from '../../lib/running-lab/splits.mjs';
import {sensorStats} from '../../lib/running-lab/series.mjs';
import {LIMITS} from '../../lib/running-lab/model.mjs';
// JSON-like models are validated at import/restore boundaries. Kept out of global site scripts.
const compact=(analysis:any)=>{const {points,...rest}=analysis;return {...rest,findings:insights(analysis)};};
self.onmessage=async(event:MessageEvent)=>{
 const {id,type,payload}=event.data;
 try{
  let result:any;
  if(type==='import'){
   const bytes=new Uint8Array(payload.bytes),files=/\.zip$/i.test(payload.name)?await expandZip(bytes):[{name:payload.name,bytes}];const entries=[],errors=[];let totalPoints=0;
   for(let i=0;i<files.length;i++){
    try{const file=files[i];if('error' in file)throw new Error(file.error);const models=await importWorkout(file.bytes,file.name);for(const model of models){totalPoints+=model.points.length;if(totalPoints>LIMITS.batchPoints)throw new Error('Партидата надвишава 200 000 точки; раздели я на по-малки части.');const analysis=analyzeActivity(model,{distances:payload.distances});entries.push({model,analysis:compact(analysis),meta:metadata(model,analysis)});}}
    catch(error){errors.push({name:files[i].name,message:error instanceof Error?error.message:'Файлът не може да се обработи.'});}
    self.postMessage({id,progress:{done:i+1,total:files.length}});
   }result={entries,errors,files:files.length};
  }else if(type==='analyze'){
   validateActivity(payload.model);
   const analysis=analyzeActivity(payload.model,{distances:payload.distances});result={analysis:compact(analysis),meta:metadata(payload.model,analysis)};
  }else if(type==='compare'){
   payload.models.forEach(validateActivity);
   const analyses=payload.models.map((model:any)=>analyzeActivity(model,{distances:payload.distances}));result={comparison:compareActivities(analyses,payload.mode),analyses:analyses.map(compact)};
  }else if(type==='range'){
   validateActivity(payload.model);
   const analysis=analyzeActivity(payload.model),row=analysis.quality.complete&&analysis.quality.clockReliable?interval(analysis.points,payload.startM,payload.endM):null;
   result=row?{...row,heart:sensorStats(analysis.points,'hr',row.startTime,row.endTime).mean}:null;
  }else if(type==='validate-backup'){
   const data=await validateArchive(payload.text),entries=[];
   for(let i=0;i<data.activities.length;i++){const model=data.activities[i],analysis=analyzeActivity(model,{distances:data.preferences.customDistances});entries.push({model,meta:metadata(model,analysis)});self.postMessage({id,progress:{done:i+1,total:data.activities.length}});}result={entries,preferences:data.preferences};
  }else if(type==='backup')result=await createArchive(payload.activities,payload.preferences);
  else throw new Error('Непозната операция.');
  self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:error instanceof Error?error.message:'Обработката не завърши.'});}
};
