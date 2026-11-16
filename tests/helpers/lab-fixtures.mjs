export const EPOCH=Date.parse('2026-01-01T08:00:00Z');
export function gpx({distance=5000,step=10,pace=()=>300,times=true,heart=true,elevation=d=>100+d*.005,offset=0}={}){
 let seconds=0,previous=0;const positions=[];for(let d=0;d<distance;d+=step)positions.push(d);positions.push(distance);
 return `<?xml version="1.0"?><gpx xmlns:gpxtpx="urn:test"><trk><name>Тестово бягане</name><trkseg>`+positions.map(d=>{seconds+=(d-previous)*pace((d+previous)/2)/1000;previous=d;return `<trkpt lat="${42+(d+offset)/111195.0802335329}" lon="24"><ele>${elevation(d)}</ele>${times?`<time>${new Date(EPOCH+seconds*1000).toISOString()}</time>`:''}${heart?'<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr><gpxtpx:cad>90</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>':''}</trkpt>`;}).join('')+'</trkseg></trk></gpx>';
}
export function fitCrc(bytes){let crc=0;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=crc&1?(crc>>>1)^0xa001:crc>>>1;}return crc;}
// Independent FIT wire fixture: definitions, sessions/events, CRC, endian and compressed timestamps.
export function fit({bigEndian=false,compressed=false,developer=false,noGps=false,recordCount=121}={}){
 const chunks=[],u32=(n,big=false)=>{const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,n,!big);return [...a];};
 const fields=[[253,4,134],...[...(noGps?[]:[[0,4,133],[1,4,133]])],[2,2,132],[3,1,2],[4,1,2],[5,4,134],[6,2,132]];
 const definition=(local,global,defs,dev=false)=>{chunks.push((dev?0x60:0x40)|local,0,bigEndian?1:0,...(bigEndian?[(global>>8)&255,global&255]:[global&255,(global>>8)&255]),defs.length,...defs.flat(),...(dev?[1,0,2,0]:[]));};
 const value=(v,size,big=bigEndian)=>{const a=new Uint8Array(size),view=new DataView(a.buffer);if(size===4)view.setUint32(0,v>>>0,!big);else if(size===2)view.setUint16(0,v,!big);else view.setUint8(0,v);return [...a];};
 const start=(EPOCH-Date.UTC(1989,11,31))/1000;
 definition(1,21,[[253,4,134],[0,1,0],[1,1,0]]);chunks.push(1,...value(start,4),0,0);
 definition(0,20,fields,developer);
 for(let i=0;i<recordCount;i++){
  const t=start+i,d=i*3,lat=Math.round((42+d/111195.0802335329)*2147483648/180),lon=Math.round(24*2147483648/180);
  chunks.push(compressed&&i?0x80|(t&31):0,...(compressed&&i?[]:value(t,4)),...(noGps?[]:[...value(lat,4),...value(lon,4)]),...value(3000+i,2),140,90,...value(d*100,4),...value(3000,2),...(developer?value(123,2):[]));
 }
 const duration=recordCount-1;chunks.push(1,...value(start+duration,4),0,1);
 definition(2,18,[[253,4,134],[2,4,134],[7,4,134],[8,4,134],[9,4,134],[5,1,0]]);chunks.push(2,...value(start+duration,4),...value(start,4),...value(duration*1000,4),...value(duration*1000,4),...value(duration*300,4),1);
 const header=new Uint8Array([14,0x20,0,0,...u32(chunks.length),46,70,73,84,0,0]);new DataView(header.buffer).setUint16(12,fitCrc(header.subarray(0,12)),true);
 const file=new Uint8Array(header.length+chunks.length+2);file.set(header);file.set(chunks,14);new DataView(file.buffer).setUint16(file.length-2,fitCrc(file.subarray(0,-2)),true);return file;
}
export const tcx=`<TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>2026-01-01T08:00:00Z</Id><Lap StartTime="2026-01-01T08:00:00Z"><TotalTimeSeconds>60</TotalTimeSeconds><DistanceMeters>200</DistanceMeters><Track><Trackpoint><Time>2026-01-01T08:00:00Z</Time><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>130</Value></HeartRateBpm></Trackpoint><Trackpoint><Time>2026-01-01T08:00:10Z</Time><DistanceMeters>30</DistanceMeters></Trackpoint><Trackpoint><Time>2026-01-01T08:00:20Z</Time><DistanceMeters>60</DistanceMeters></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
