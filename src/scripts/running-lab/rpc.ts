export class LabWorker {
 private worker:Worker|undefined;
 private request=0;
 private jobs=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>;progress?:(value:any)=>void}>();
 private start(){
  this.worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
  this.worker.onmessage=event=>{const {id,result,error,progress}=event.data,job=this.jobs.get(id);if(!job)return;
   if(progress){clearTimeout(job.timer);job.timer=setTimeout(()=>this.cancel('Операцията надвиши времевия лимит. Използвай по-малък файл.'),30000);job.progress?.(progress);return;}
   clearTimeout(job.timer);this.jobs.delete(id);if(error)job.reject(new Error(error));else job.resolve(result);
  };
  this.worker.onerror=()=>this.cancel('Worker не се зареди или обработката беше прекъсната. Данните не са качвани.');
 }
 run(type:string,payload:any,progress?:(value:any)=>void,transfer:Transferable[]=[]):Promise<any>{
  if(!this.worker)this.start();const id=++this.request;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.cancel('Операцията надвиши 30 секунди без напредък. Раздели данните на по-малки части.'),30000);this.jobs.set(id,{resolve,reject,timer,progress});this.worker!.postMessage({id,type,payload},transfer);});
 }
 cancel(reason='Операцията е отменена. Вече обработените данни остават временни.'){this.worker?.terminate();this.worker=undefined;for(const job of this.jobs.values()){clearTimeout(job.timer);job.reject(new Error(reason));}this.jobs.clear();}
}
