// Presentation only: the full measured series and kilometre distances stay intact.
export function kilometreMarkerSize(zoom=12){return Math.max(13,Math.min(20,13+((Number.isFinite(zoom)?zoom:12)-10)*1.1));}
export function spacedKilometres(candidates,zoom=12){
 const size=kilometreMarkerSize(zoom),spacing=size+10,cells=new Map(),selected=[];
 // Stable priorities and distance-based collision tests are invariant under pan.
 const ordered=[...candidates].filter(p=>Number.isInteger(p.km)&&p.km>0&&Number.isFinite(p.x)&&Number.isFinite(p.y)).sort((a,b)=>(a.km%5===0?0:1)-(b.km%5===0?0:1)||a.km-b.km);
 for(const p of ordered){
  const cx=Math.floor(p.x/spacing),cy=Math.floor(p.y/spacing);let overlaps=false;
  for(let x=cx-1;x<=cx+1&&!overlaps;x++)for(let y=cy-1;y<=cy+1&&!overlaps;y++)
   overlaps=(cells.get(`${x}:${y}`)||[]).some(q=>Math.hypot(q.x-p.x,q.y-p.y)<spacing);
  if(overlaps)continue;
  const key=`${cx}:${cy}`,cell=cells.get(key)||[];cell.push(p);cells.set(key,cell);selected.push(p);
 }
 return selected.sort((a,b)=>a.km-b.km);
}
