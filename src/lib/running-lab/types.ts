export interface LabPoint {t:number|null;lat:number|null;lon:number|null;z:number|null;hr:number|null;cad:number|null;speed:number|null;deviceDistance:number|null;power:number|null;temperature:number|null;segment:number}
export interface LabSettings {smoothingM:25|50|100|200;altitudeSource:'unknown'|'gps'|'barometer';lapLengthM:number|null;lapBoundaries:number[]}
export interface LabSource {hash:string;index:number;format:'gpx'|'tcx'|'fit';name:string;originalBytesRetained:false;timeConvention:string}
export interface LabWorkout {version:1;id:string;name:string;comment:string;source:LabSource;points:LabPoint[];settings:LabSettings;laps:Record<string,unknown>[];events:{t:number;type:'start'|'stop';source?:string}[];reported:Record<string,string|number|null>;warnings:string[];provenance:Record<string,string>}
export interface LabOfficialResult {id:string;distanceM:number;seconds:number;date:string;race:string;url:string;comment:string;source:string}
export interface LabPreferences {version:1;customDistances:number[];officialResults:LabOfficialResult[];timeZone:string}
export interface LabFinding {id:string;title:string;values:string;method:string;limitation:string}
