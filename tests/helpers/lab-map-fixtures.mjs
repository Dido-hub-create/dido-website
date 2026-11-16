// Explicitly synthetic geometry for testing overlapping visits, never an
// owner's recording or an organizer's route. No live tiles are used by tests.
export function loopGpx({laps=2,lapDistance=10560,pointsPerLap=720,times=true,heart=true,heights=true}={}){
 const radius=lapDistance/(2*Math.PI),baseLat=42.68,baseLon=23.32,start=Date.parse('2026-01-01T08:00:00Z');
 let xml='<gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>Синтетичен маршрут — тест на картата</name><type>running</type><trkseg>';
 for(let i=0;i<=laps*pointsPerLap;i++){
  const theta=2*Math.PI*i/pointsPerLap,lat=baseLat+radius*Math.sin(theta)/111195.0802,lon=baseLon+radius*Math.cos(theta)/(111195.0802*Math.cos(baseLat*Math.PI/180));
  xml+=`<trkpt lat="${lat.toFixed(9)}" lon="${lon.toFixed(9)}">${heights?`<ele>${100+25*Math.sin(theta*2)}</ele>`:''}${times?`<time>${new Date(start+i/pointsPerLap*lapDistance*.35*1000).toISOString()}</time>`:''}${heart?`<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${Math.round(145+18*Math.sin(theta)+5*i/(laps*pointsPerLap))}</gpxtpx:hr><gpxtpx:cad>82</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>`:''}</trkpt>`;
 }
 return xml+'</trkseg></trk></gpx>';
}
