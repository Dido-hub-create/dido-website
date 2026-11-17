export function historicalStats(metadata){
 const groups=new Map();for(const item of metadata){const s=item.summary;if(s.start===null)continue;const month=new Date(s.start).toISOString().slice(0,7);const row=groups.get(month)||{month,count:0,distanceM:0,elapsedSeconds:0,timedDistanceM:0,timedSeconds:0};row.count++;row.distanceM+=s.distanceM||0;row.elapsedSeconds+=s.elapsedSeconds||0;if(s.pace!==null&&s.elapsedSeconds>0){row.timedDistanceM+=s.distanceM;row.timedSeconds+=s.elapsedSeconds;}groups.set(month,row);}
 return [...groups.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(row=>({...row,pace:row.timedDistanceM?row.timedSeconds*1000/row.timedDistanceM:null,year:row.month.slice(0,4)}));
}
export function validateDistance(value){const n=Number(value);if(!Number.isFinite(n)||n<100||n>100000)throw new Error('Дистанцията трябва да е между 100 m и 100 km.');return Math.round(n*10)/10;}
export function officialHistory(results){
 return [...new Set(results.map(r=>r.distanceM))].sort((a,b)=>a-b).map(distanceM=>{const attempts=results.filter(r=>r.distanceM===distanceM).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));let previous=null;const history=[];
  for(const row of attempts)if(!previous||row.seconds<previous.seconds){history.push({...row,previousSeconds:previous?.seconds??null,improvementSeconds:previous?previous.seconds-row.seconds:null});previous=row;}
  return {distanceM,current:previous,history};
 });
}
export function officialResult(value){
 const distanceM=validateDistance(value.distanceM),seconds=Number(value.seconds);
 if(!Number.isFinite(seconds)||seconds<=0||seconds>604800)throw new Error('Невалидно официално време.');
 const parsedDate=typeof value.date==='string'?new Date(value.date+'T12:00:00Z'):null;
 if(typeof value.date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(value.date)||!parsedDate||!Number.isFinite(+parsedDate)||parsedDate.toISOString().slice(0,10)!==value.date)throw new Error('Невалидна дата.');
 let url='';if(value.url){const parsed=new URL(value.url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new Error('Официалната връзка трябва да е HTTPS.');url=parsed.href;}
 const race=String(value.race||'').trim().slice(0,200);if(!race)throw new Error('Въведи състезание.');
 const id=value.id||crypto.randomUUID();if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('Невалиден идентификатор на официален резултат.');
 return {id,distanceM,seconds,date:value.date,race,url,comment:String(value.comment||'').slice(0,2000),source:'official, manually entered'};
}
