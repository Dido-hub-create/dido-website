import {raceTiming} from "./races.mjs";
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
export function normalizeRankings(value){
 const input=object(value);
 return ['overall','men','ageGroup'].flatMap(key=>{
  const row=object(input[key]),{place,total}=row;
  if(!Number.isSafeInteger(place)||!Number.isSafeInteger(total)||place<1||total<1||place>total)return [];
  const label=key==='overall'?'Общо':key==='men'?'Мъже':typeof row.label==='string'&&row.label.trim()?row.label.trim():'Възрастова група';
  return [{key,label,place,total}];
 });
}
export function legacyPlacing(race){
 const text=typeof race.placing==='string'?race.placing.trim():'';
 const normalize=value=>value.toLocaleLowerCase('bg').replace(/\s+/g,' ').replace(/\s*\/\s*/g,'/').replace(/\s*:\s*/g,':').trim();
 const normalized=normalize(text);
 for(const r of race.rankings||[]){
  const forms=[`${r.place} от ${r.total}`,`${r.place}/${r.total}`];
  if(forms.flatMap(pair=>[pair,`${r.label}: ${pair}`,`${r.label} ${pair}`]).some(v=>normalize(v)===normalized))return '';
 }
 return text;
}

export function compareArchivedRaces(a,b){return ((raceTiming(b).dayStamp??-Infinity)-(raceTiming(a).dayStamp??-Infinity))||b.id.localeCompare(a.id);}
