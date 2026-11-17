export function nearest(samples:any[],distance:number){
 if(!samples.length)return null;
 let lo=0,hi=samples.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(samples[mid].d<=distance)lo=mid;else hi=mid;}
 return Math.abs(samples[lo].d-distance)<=Math.abs(samples[hi].d-distance)?samples[lo]:samples[hi];
}
export function nearestTime(samples:any[],time:number){
 if(!samples.length)return null;
 let lo=0,hi=samples.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(samples[mid].t<=time)lo=mid;else hi=mid;}
 return Math.abs(samples[lo].t-time)<=Math.abs(samples[hi].t-time)?samples[lo]:samples[hi];
}
export function chartValues(a:any,key:string,axis:string){
 const samples=key==='elevation'?a.elevation.samples.map((p:any)=>({...p,value:p.ele,t:nearest(a.samples,p.d)?.t})):
  key==='grade'?(a.gradient?.samples||[]).map((p:any)=>({...p,value:p.grade===null?null:p.grade*100,t:nearest(a.samples,p.d)?.t})):
  a.samples.map((p:any)=>({...p,value:key==='cad'&&p.cad!==null?p.cad*(a.cadenceDisplay?.factor||1):p[key]}));
 return samples.map((p:any)=>({x:axis==='time'?(p.t-a.stats.start)/60000:p.d/1000,y:p.value,run:p.run}));
}
