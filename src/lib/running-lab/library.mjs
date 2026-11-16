import {LIMITS} from './model.mjs';
import {defaultPreferences,validatePreferences,validateActivity} from './backup.mjs';
export const DATABASE='dido-running-lab-v1';
export function metadata(model,analysis){
 return {id:model.id,name:model.name,comment:model.comment,source:model.source,summary:analysis.stats,quality:analysis.quality,records:analysis.records,computedDistances:analysis.evaluatedDistances,settings:model.settings,date:analysis.stats.start,
  geometry:model.points.filter(p=>p.lat!==null).filter((_,i,array)=>i%Math.max(1,Math.floor(array.length/8))===0).slice(0,9).map(p=>({lat:p.lat,lon:p.lon})),
  bytes:new TextEncoder().encode(JSON.stringify(model)).length};
}
export function openLibrary(factory=globalThis.indexedDB){
 return new Promise((resolve,reject)=>{
  if(!factory){reject(new Error('IndexedDB не е достъпна. Можеш да анализираш временно и да изтеглиш отчет.'));return;}
  let request,blocked=false;try{request=factory.open(DATABASE,1);}catch{reject(new Error('Браузърът не разрешава IndexedDB.'));return;}
  request.onupgradeneeded=()=>{const db=request.result;for(const name of ['activities','metadata','preferences'])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});};
  request.onerror=()=>reject(new Error('Локалната библиотека не се отвори. Данните не са изтривани.'));
  request.onblocked=()=>{blocked=true;reject(new Error('Библиотеката е блокирана от друг отворен таб. Затвори стария таб и опитай отново.'));};
  request.onsuccess=()=>{const db=request.result;if(blocked){db.close();return;}db.onversionchange=()=>db.close();resolve(libraryApi(db));};
 });
}
function libraryApi(db){
 const read=(store,key)=>new Promise((resolve,reject)=>{const transaction=db.transaction(store,'readonly'),request=key===undefined?transaction.objectStore(store).getAll():transaction.objectStore(store).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Четенето на локални данни е отказано.'));});
 function write(entries,preferences,{replace=false,confirmed=false,overwrite=false}={}){
  if(replace&&!confirmed)return Promise.reject(new Error('Замяната изисква изрично потвърждение.'));
  entries.forEach(entry=>validateActivity(entry.model));
  const prefs=preferences?validatePreferences(preferences):null;
  return new Promise((resolve,reject)=>{
   let transaction;try{transaction=db.transaction(['activities','metadata','preferences'],'readwrite');}catch{reject(new Error('Записът не е разрешен.'));return;}
   let failure='',written=0;const meta=transaction.objectStore('metadata'),activities=transaction.objectStore('activities'),request=meta.getAll();
   request.onsuccess=()=>{try{
    const existing=replace?[]:request.result,ids=new Set(existing.map(row=>row.id));let bytes=existing.reduce((sum,row)=>sum+row.bytes,0),count=existing.length;
    const incoming=entries.filter(entry=>overwrite||!ids.has(entry.model.id));
    for(const entry of incoming){const old=existing.find(row=>row.id===entry.model.id);bytes+=entry.meta.bytes-(old?.bytes||0);if(!old)count++;}
    if(count>LIMITS.activities||bytes>LIMITS.archiveBytes*.85)throw new Error('Достигнат е безопасният размер на библиотеката (54 MiB модели / 2000 тренировки). Архивирай и освободи място.');
    if(replace){activities.clear();meta.clear();transaction.objectStore('preferences').clear();}
    for(const entry of incoming){activities.put(entry.model);meta.put(entry.meta);written++;}
    if(prefs)transaction.objectStore('preferences').put({id:'main',value:prefs});
   }catch(error){failure=error instanceof Error?error.message:'Записът е отказан.';transaction.abort();}};
   transaction.oncomplete=()=>resolve(written);
   transaction.onabort=transaction.onerror=()=>reject(new Error(failure||'Недостатъчно място или отказан запис. Предишната библиотека е запазена.'));
  });
 }
 return {list:()=>read('metadata'),get:id=>read('activities',id),all:()=>read('activities'),preferences:async()=>(await read('preferences','main'))?.value||defaultPreferences(),write,
  remove:id=>new Promise((resolve,reject)=>{const tx=db.transaction(['activities','metadata'],'readwrite');tx.objectStore('activities').delete(id);tx.objectStore('metadata').delete(id);tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error('Изтриването не завърши.'));}),
  close:()=>db.close()};
}
