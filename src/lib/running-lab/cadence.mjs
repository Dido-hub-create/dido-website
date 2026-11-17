/** Display conversion only: raw values, saved models and record times stay unchanged. */
export function cadenceDisplay(activity){
 const sport=String(activity.reported?.sport||'').toLowerCase();
 if(activity.source.format==='fit'&&sport==='running')return {factor:2,unit:'стъпки/мин',rawUnit:'цикли/мин',reason:'Стандартното FIT поле cadence за running отчита цикли. Показваме ×2; суровата стойност е запазена.'};
 if(activity.source.format==='gpx'&&activity.provenance?.cadence==='garmin-tpx-running-cycles')return {factor:2,unit:'стъпки/мин',rawUnit:'цикли/мин',reason:'Garmin TrackPointExtension cadence и изрично указан running в GPX. Показваме ×2 без промяна на измерванията.'};
 return {factor:1,unit:'отчетени ед./мин',rawUnit:'отчетени ед./мин',reason:'Източникът не доказва преобразуване към стъпки/мин. Показваме оригиналната стойност, без автоматично удвояване.'};
}
