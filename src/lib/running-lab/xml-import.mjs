import {XMLParser} from 'fast-xml-parser';
import {SyntaxValidator} from 'fast-xml-validator';
import {point,number,text,LIMITS} from './model.mjs';
const array=value=>value===undefined?[]:Array.isArray(value)?value:[value];
const scalar=value=>value&&typeof value==='object'?value['#text']:value;
function xml(source){
 if(typeof source!=='string'||!source.trim()||new TextEncoder().encode(source).length>LIMITS.fileBytes||/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('Невалиден, празен или прекалено голям XML; DTD/entities не са разрешени.');
 try{SyntaxValidator.validate(source);}catch{throw new Error('Повреден XML документ.');}
 return new XMLParser({ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false,processEntities:false,removeNSPrefix:true}).parse(source);
}
function extension(object,key,depth=0){
 if(!object||typeof object!=='object'||depth>8)return null;
 for(const [name,value]of Object.entries(object)){if(name.toLowerCase()===key.toLowerCase())return number(scalar(value));const found=extension(value,key,depth+1);if(found!==null)return found;}return null;
}
export function parseGpxWorkout(source){
 const root=xml(source).gpx;if(!root)throw new Error('Липсва GPX корен.');
 const tracks=array(root.trk),segments=tracks.flatMap(track=>array(track.trkseg).map(segment=>array(segment?.trkpt)));
 segments.push(...array(root.rte).map(route=>array(route.rtept)));
 let count=0;const points=segments.flatMap((segment,index)=>segment.map(p=>{if(++count>LIMITS.points)throw new Error('Твърде много GPS точки.');return point({lat:p?.['@_lat'],lon:p?.['@_lon'],t:scalar(p?.time),z:scalar(p?.ele),hr:extension(p?.extensions,'hr'),cad:extension(p?.extensions,'cad'),speed:extension(p?.extensions,'speed'),power:extension(p?.extensions,'power'),temperature:extension(p?.extensions,'atemp')},index);}));
 return [{name:text(tracks[0]?.name),points,laps:[],events:[],reported:{},warnings:[]}];
}
export function parseTcxWorkout(source){
 const root=xml(source).TrainingCenterDatabase;if(!root)throw new Error('Липсва TCX корен.');
 const activities=array(root.Activities?.Activity);if(!activities.length)throw new Error('TCX няма тренировки.');
 return activities.map((run)=>{
  const points=[],laps=[];let segment=0;
  for(const lap of array(run.Lap)){
   const startIndex=points.length;
   for(const track of array(lap.Track)){for(const p of array(track.Trackpoint)){
    if(points.length>=LIMITS.points)throw new Error('Твърде много TCX точки.');
    points.push(point({t:scalar(p?.Time),lat:scalar(p?.Position?.LatitudeDegrees),lon:scalar(p?.Position?.LongitudeDegrees),z:scalar(p?.AltitudeMeters),deviceDistance:scalar(p?.DistanceMeters),hr:scalar(p?.HeartRateBpm?.Value),cad:scalar(p?.Cadence)??extension(p?.Extensions,'RunCadence'),speed:extension(p?.Extensions,'Speed'),power:extension(p?.Extensions,'Watts')},segment));
   }segment++;}
   laps.push({start:lap['@_StartTime']||null,end:points.at(-1)?.t??null,startIndex,endIndex:points.length-1,distanceM:number(lap.DistanceMeters),timerSeconds:number(lap.TotalTimeSeconds),source:'device'});
   // A device lap boundary is not automatically a GPS discontinuity.
   if(laps.length>1 && points[startIndex] && points[startIndex-1]){
    const delta=(points[startIndex].t-points[startIndex-1].t)/1000;
    if(delta>0&&delta<=10){const previous=points[startIndex-1].segment;const current=points[startIndex].segment;for(let i=startIndex;i<points.length;i++)if(points[i].segment===current)points[i].segment=previous;}
   }
  }
  return {name:text(run.Notes)||`TCX ${text(run.Id)}`,points,laps,events:[],reported:{sport:text(run['@_Sport'])},warnings:[]};
 });
}
