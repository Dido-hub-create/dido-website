// Pixel-only presentation policy. No coordinates, measurements or zoom changes.
export const FOLLOW_INTERVAL_MS=1200;
export function followPanOffset(point,size){
 const {width,height}=size||{};
 if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||!Number.isFinite(width)||!Number.isFinite(height)||width<160||height<140)return null;
 const xInset=Math.min(80,Math.max(38,width*.16)),top=Math.min(70,Math.max(40,height*.17)),bottom=Math.max(top,58);
 if(point.x>=xInset&&point.x<=width-xInset&&point.y>=top&&point.y<=height-bottom)return null;
 // Re-enter a smaller inner rectangle, leaving room before the next edge pan.
 // The bottom reserve keeps the cursor away from the attribution.
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 return {x:point.x-clamp(point.x,width*.32,width*.68),y:point.y-clamp(point.y,height*.32,height*.62)};
}
