// Piecewise-linear distance interpolation, retaining pauses at equal distances.
export function atDistance(points,d,side='first'){
 if(!points.length||d<points[0].d-1e-6||d>points.at(-1).d+1e-6)return null;
 let lo=0,hi=points.length;
 while(lo<hi){const m=(lo+hi)>>1;if(points[m].d<d || side==='last'&&points[m].d===d)lo=m+1;else hi=m;}
 if(side==='last'&&lo&&points[lo-1].d===d)return {...points[lo-1]};
 if(lo<points.length&&points[lo].d===d)return {...points[lo]};
 const b=points[Math.min(lo,points.length-1)],a=points[Math.max(0,lo-1)],ratio=b.d>a.d?(d-a.d)/(b.d-a.d):0;
 const lerp=key=>a[key]!==null&&a[key]!==undefined&&b[key]!==null&&b[key]!==undefined?a[key]+ratio*(b[key]-a[key]):null;
 return {d,t:lerp('t'),z:lerp('z'),hr:lerp('hr'),cad:lerp('cad'),lat:lerp('lat'),lon:a.lon!==null&&b.lon!==null?((a.lon+ratio*(((b.lon-a.lon+540)%360)-180)+540)%360)-180:null,run:a.run};
}
export function atTime(points,t){
 if(!points.length||t<points[0].t||t>points.at(-1).t)return null;
 let lo=0,hi=points.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(points[m].t<=t)lo=m;else hi=m;}
 const a=points[lo],b=points[hi];if(a.run!==b.run)return null;
 const ratio=b.t>a.t?(t-a.t)/(b.t-a.t):0;return atDistance([a,b],a.d+ratio*(b.d-a.d));
}
export function sensorStats(points,key,start=-Infinity,end=Infinity){
 const valid=points.filter(p=>Number.isFinite(p[key])&& (p.t===null||p.t>=start&&p.t<=end));
 if(!valid.length)return {mean:null,min:null,max:null,coverage:0,method:'unavailable'};
 const reliableClock=points.every((p,i)=>Number.isFinite(p.t)&&(!i||p.t>points[i-1].t));
 if(!reliableClock)return {mean:valid.reduce((sum,p)=>sum+p[key],0)/valid.length,min:valid.reduce((n,p)=>Math.min(n,p[key]),Infinity),max:valid.reduce((n,p)=>Math.max(n,p[key]),-Infinity),coverage:0,method:'sample mean, unreliable clock'};
 let area=0,coverage=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];if(a.run!==b.run||b.t-a.t>30000||a[key]===null||b[key]===null)continue;
  const l=Math.max(start,a.t),r=Math.min(end,b.t);if(r<=l)continue;
  const x=a[key]+(b[key]-a[key])*(l-a.t)/(b.t-a.t),y=a[key]+(b[key]-a[key])*(r-a.t)/(b.t-a.t);
  area+=(x+y)/2*(r-l);coverage+=r-l;
 }
 const total=Number.isFinite(start)&&Number.isFinite(end)?end-start:points.at(-1).t-points[0].t;
 const fraction=total>0?Math.min(1,coverage/total):0;
 return {mean:coverage>0&&fraction>=.8?area/coverage:null,min:valid.reduce((n,p)=>Math.min(n,p[key]),Infinity),max:valid.reduce((n,p)=>Math.max(n,p[key]),-Infinity),coverage:fraction,method:coverage>0&&fraction>=.8?'time-weighted':'insufficient coverage'};
}
export function cleanRuns(points){
 const runs=[];for(const p of points){if(!runs.length||runs.at(-1)[0].run!==p.run)runs.push([]);runs.at(-1).push(p);}return runs.filter(run=>run.length>=2&&run.at(-1).d>run[0].d);
}
