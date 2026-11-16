// A view transform only. Never write these limits back to measurements or statistics.
const MIN_SPREAD={pace:30,hr:12,cad:8,elevation:3,grade:1,generic:1};
function weightedValues(points){
 const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
 const values=points.flatMap((p,i)=>{
  if(!valid(p))return [];
  const before=points[i-1],after=points[i+1];
  const left=valid(before)&&before.run===p.run?Math.max(0,p.x-before.x):0;
  const right=valid(after)&&after.run===p.run?Math.max(0,after.x-p.x):0;
  return [{value:p.y,weight:(left+right)/2}];
 });
 if(!values.some(p=>p.weight>0))values.forEach(p=>p.weight=1);
 return values;
}
function quantile(sorted,fraction,total){
 let cumulative=0;for(const row of sorted){cumulative+=row.weight;if(cumulative>=total*fraction)return row.value;}
 return sorted.at(-1).value;
}
export function visualScale(points,{mode='typical',metric='generic',includeZero=false}={}){
 const values=weightedValues(points);if(!values.length)return null;
 const rawMin=Math.min(...values.map(p=>p.value)),rawMax=Math.max(...values.map(p=>p.value));
 let visible=values,trimmed=false;
 if(mode==='typical'&&['pace','hr','cad'].includes(metric)&&values.length>=8){
  const sorted=[...values].sort((a,b)=>a.value-b.value),total=sorted.reduce((sum,p)=>sum+p.weight,0);
  const q1=quantile(sorted,.25,total),median=quantile(sorted,.5,total),q3=quantile(sorted,.75,total);
  const margin=Math.max(3*(q3-q1),MIN_SPREAD[metric],Math.abs(median)*.1);
  const inside=values.filter(p=>p.value>=q1-margin&&p.value<=q3+margin);
  const outsideWeight=values.filter(p=>p.value<q1-margin||p.value>q3+margin).reduce((sum,p)=>sum+p.weight,0);
  // A coherent, substantial interval is not treated as an isolated extreme.
  if(inside.length>=4&&inside.length<values.length&&outsideWeight/total<=.05){visible=inside;trimmed=true;}
 }
 let min=Math.min(...visible.map(p=>p.value)),max=Math.max(...visible.map(p=>p.value));
 if(includeZero){min=Math.min(0,min);max=Math.max(0,max);}
 const padding=Math.max((max-min)*.08,metric==='pace'?5:metric==='hr'?3:metric==='grade'?.5:1);
 min-=padding;max+=padding;if(['pace','hr','cad'].includes(metric))min=Math.max(0,min);
 return {min,max,rawMin,rawMax,trimmed,below:values.filter(p=>p.value<min).length,above:values.filter(p=>p.value>max).length,total:values.length};
}
export function axisTicks(min,max,count=5,metric='generic'){
 if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return [];
 const ideal=(max-min)/count,power=10**Math.floor(Math.log10(ideal));
 const candidates=metric==='pace'?[1,2,5,10,15,20,30,60,120,300,600,1200,3600,7200]:[1,2,2.5,5,10].map(n=>n*power);
 const step=Math.max(['elevation','hr','cad'].includes(metric)?1:0,candidates.find(n=>n>=ideal)||Math.ceil(ideal/power)*power),first=Math.ceil(min/step)*step,out=[];
 for(let value=first;value<=max+step*1e-8&&out.length<12;value+=step)out.push(Math.abs(value)<step*1e-8?0:value);
 return out.length>=2?out:[min,max];
}
