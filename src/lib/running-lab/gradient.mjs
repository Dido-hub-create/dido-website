export function gradientProfile(profile,windowM=100){
 if(!profile.available||!profile.samples.length)return {available:false,windowM,samples:[]};
 const points=profile.samples,window=Math.max(50,windowM),runs=new Map();for(const p of points){if(!runs.has(p.run))runs.set(p.run,[]);runs.get(p.run).push(p);}
 function height(series,d){let lo=0,hi=series.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(series[mid].d<=d)lo=mid;else hi=mid;}const a=series[lo],b=series[hi],ratio=b.d>a.d?(d-a.d)/(b.d-a.d):0;return a.ele+ratio*(b.ele-a.ele);}
 const samples=points.map(p=>{const run=runs.get(p.run),left=Math.max(run[0].d,p.d-window/2),right=Math.min(run.at(-1).d,p.d+window/2);return {d:p.d,run:p.run,grade:right-left>=25?(height(run,right)-height(run,left))/(right-left):null};});
 return {available:samples.some(p=>p.grade!==null),windowM:window,samples};
}
