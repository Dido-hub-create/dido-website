import {LabWorker} from './rpc';
import {el,num,km,pace,duration,date,action,download,parseDuration} from './dom';
import {WorkoutView} from './workout-view';
import {recordViews,historyViews,comparisonView} from './views';
import {openLibrary} from '../../lib/running-lab/library.mjs';
import {defaultPreferences,validatePreferences} from '../../lib/running-lab/backup.mjs';
import {probableDuplicate} from '../../lib/running-lab/compare.mjs';
import {validateDistance,officialResult} from '../../lib/running-lab/history.mjs';
import {splitsCsv,metricsCsv,publicSummary,csv} from '../../lib/running-lab/export.mjs';
import {LIMITS} from '../../lib/running-lab/model.mjs';
import {recordHistory} from '../../lib/running-lab/records.mjs';
import {confirmedRecordFindings} from '../../lib/running-lab/insights.mjs';
import type {LabWorkout,LabPreferences} from '../../lib/running-lab/types';

interface Preview {model:LabWorkout;analysis:any;meta:any;selected:boolean;duplicate:'exact'|'probable'|null;saved?:boolean;dirty?:boolean}
const root=document.querySelector<HTMLElement>('[data-running-lab]');
if(root)initialize(root);
function initialize(root:HTMLElement){
 const q=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
 const rpc=new LabWorker();let library:any=null,metadata:any[]=[],preferences:LabPreferences=defaultPreferences(),previews:Preview[]=[],active:Preview|null=null,restoration:any=null,comparison:any=null;
 let busy=false,cancelled=false,visibleLimit=100;const selected=new Set<string>();
 const status=(message:string)=>{q('[data-lab-status]').textContent=message;};
 const show=(panel:string)=>{root.querySelectorAll<HTMLElement>('[data-panel]').forEach(node=>node.hidden=node.dataset.panel!==panel);root.querySelectorAll<HTMLElement>('[data-tab]').forEach(node=>{if(node.dataset.tab===panel)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');});};
 const workout=new WorkoutView(root,{run:task,status,isBusy:()=>busy,changeSettings:async change=>{const entry=requireActive();entry.model.settings={...entry.model.settings,...change};await reanalyze();},range:async(startM,endM)=>rpc.run('range',{model:requireActive().model,startM,endM})});
 function renderInto(selector:string,content:Node){q(selector).replaceChildren(content);}
 async function task(job:()=>Promise<void>){
  if(busy){status('Изчакай текущата операция или я прекрати.');return;}
  busy=true;cancelled=false;q('[data-lab-job]').hidden=false;q<HTMLProgressElement>('[data-lab-progress]').removeAttribute('value');status('Обработка в браузъра… Можеш да прекратиш операцията.');
  try{await job();}catch(error){status(error instanceof Error?error.message:'Операцията не завърши.');}
  finally{busy=false;q('[data-lab-job]').hidden=true;renderPreviews();}
 }
 const progress=(value:{done:number;total:number})=>{q<HTMLProgressElement>('[data-lab-progress]').value=value.total?100*value.done/value.total:0;status(`Обработка ${value.done} / ${value.total} — локално, без качване.`);};
 async function refresh(){
  if(!library)return;
  metadata=await library.list();preferences=validatePreferences(await library.preferences());
  for(const id of selected)if(!metadata.some(row=>row.id===id))selected.delete(id);
  for(const entry of previews){entry.saved=metadata.some(row=>row.id===entry.model.id);entry.duplicate=findDuplicate(entry);if(entry.saved||entry.duplicate==='exact')entry.selected=false;}
  if(comparison&&comparison.analyses.some((a:any)=>!metadata.some(row=>row.id===a.id&&row.name===a.name&&JSON.stringify(row.settings)===JSON.stringify(a.settings)))){comparison=null;q('[data-lab-comparison]').replaceChildren();}
  if(active?.saved&&!metadata.some(row=>row.id===active!.model.id)){active.saved=false;active.dirty=true;}
  const zoneInput=q<HTMLInputElement>('[data-lab-timezone-form] [name="zone"]');zoneInput.value=preferences.timeZone;renderLibrary();renderRecords();renderHistory();
  const estimate=await navigator.storage?.estimate?.();q('[data-lab-space]').textContent=estimate?`Данни на сайта: ${num((estimate.usage||0)/1048576)} MiB / квота ${num((estimate.quota||0)/1048576)} MiB`:'Браузърът не предоставя оценка за свободното място.';
 }
 async function initLibrary(){
  try{library=await openLibrary();await refresh();q('[data-lab-storage]').hidden=true;}
  catch(error){q('[data-lab-storage]').hidden=false;q('[data-lab-storage]').textContent=(error instanceof Error?error.message:'IndexedDB не е достъпна.')+' Временният анализ и отчетите остават достъпни. Нищо не е изтривано.';renderLibrary();renderRecords();renderHistory();}
 }
 function requireLibrary(){if(!library)throw new Error('Локалната библиотека не е достъпна. Използвай временен анализ и изтегли отчет.');}
 function requireActive(){if(!active)throw new Error('Първо отвори тренировка от импорта или библиотеката.');return active;}
 function findDuplicate(entry:Preview){
  const all=[...metadata,...previews.filter(p=>p!==entry).map(p=>({...p.meta,summary:p.analysis.stats}))];
  let probable=false;for(const other of all){const kind=probableDuplicate({...entry.meta,summary:entry.analysis.stats},other);if(kind==='exact')return 'exact';if(kind==='probable')probable=true;}return probable?'probable':null;
 }
 async function importFiles(files:FileList|File[]){
  const list=Array.from(files);if(!list.length)return;
  if(list.length>LIMITS.files||list.reduce((sum,file)=>sum+file.size,0)>LIMITS.batchBytes)throw new Error('Избери до 200 файла / 64 MiB за една партида.');
  if(previews.length&& !confirm('Да заменим временния преглед? Незаписаните тренировки ще бъдат освободени; библиотеката не се променя.'))return;
  previews=[];active=null;workout.resetView();q<HTMLInputElement>('[data-lab-range-start]').value='0';q<HTMLInputElement>('[data-lab-range-end]').value='';renderActiveOptions();renderOverview();const errors:any[]=[];let processed=0,valid=0,duplicates=0,totalPoints=0,totalFiles=0;
  for(const file of list){
   if(cancelled)break;
   try{
    if(previews.length>=LIMITS.files)throw new Error('Достигнати са 200 тренировки в прегледа. Раздели партидата.');
    if(file.size>(/\.zip$/i.test(file.name)?LIMITS.batchBytes:LIMITS.fileBytes))throw new Error('Файлът надвишава ограниченията.');
    if(!/\.(gpx|tcx|fit|zip)$/i.test(file.name))throw new Error('Неподдържано разширение.');
    const bytes=await file.arrayBuffer();if(cancelled)break;
    const result=await rpc.run('import',{bytes,name:file.name,distances:preferences.customDistances},value=>{q<HTMLProgressElement>('[data-lab-progress]').value=100*(processed+value.done/value.total)/list.length;},[bytes]);
    totalFiles+=result.files;if(totalFiles>LIMITS.files)throw new Error('Общият брой файлове след ZIP надвишава 200. Раздели партидата.');
    errors.push(...result.errors);
    for(const value of result.entries){if(previews.length>=LIMITS.files)throw new Error('Достигнати са 200 тренировки в прегледа; останалите сесии не са задържани.');totalPoints+=value.model.points.length;if(totalPoints>LIMITS.batchPoints)throw new Error('Достигнати са 200 000 точки в партидата; останалите не са задържани.');
     const entry:Preview={...value,selected:true,duplicate:null};entry.duplicate=findDuplicate(entry);if(entry.duplicate){entry.selected=false;duplicates++;}else valid++;previews.push(entry);
    }
   }catch(error){if(cancelled)break;errors.push({name:file.name,message:error instanceof Error?error.message:'Невалиден файл.'});}
   processed++;q<HTMLProgressElement>('[data-lab-progress]').value=100*processed/list.length;status(`Файлове ${processed}/${list.length} · нови ${valid} · дубликати/сходни ${duplicates} · проблеми ${errors.length}.`);renderPreviews();
  }
  const report=el('div');report.append(el('p',`${cancelled?'Прекратено':'Готово'}: ${processed} външни файла; ${previews.length} тренировки в прегледа; ${valid} нови; ${duplicates} дубликати/сходни; ${errors.length} проблема.`));
  if(errors.length){const details=el('details'),summary=el('summary',`Диагностика по файлове (${errors.length})`),list=el('ul');for(const error of errors)list.append(el('li',`${error.name}: ${error.message}`));details.append(summary,list);report.append(details);}renderInto('[data-lab-import-report]',report);
  if(previews.length){active=previews[0];renderActiveOptions();renderOverview();}
  status(cancelled?'Импортът е прекратен. Обработените тренировки остават временни.':'Прегледай резултатите и избери какво да запазиш. Няма автоматичен запис.');
 }
 function renderPreviews(){
  const list=q('[data-lab-previews]');list.replaceChildren();
  for(const [index,entry]of previews.entries()){
   const card=el('article',undefined,'lab-item'),label=el('label',undefined,'lab-check'),check=el('input');check.type='checkbox';check.checked=entry.selected;check.disabled=entry.duplicate==='exact'||!!entry.saved;check.setAttribute('aria-label',`Избери за запис: ${entry.model.name}`);check.addEventListener('change',()=>{entry.selected=check.checked;renderSaveButton();});
   label.append(check,document.createTextNode(entry.saved?'Записано':entry.duplicate==='exact'?'Точен дубликат — без повторен запис':entry.duplicate==='probable'?'Вероятен дубликат — избери само ако е отделна тренировка':'Избери за локален запис'));
   card.append(label,el('h3',entry.model.name),el('p',`${entry.model.source.format.toUpperCase()} · ${km(entry.analysis.stats.distanceM)} km · ${duration(entry.analysis.stats.elapsedSeconds)} · ${pace(entry.analysis.stats.pace)}`),el('p',entry.analysis.quality.messages.join(' ')||'Проверени непрекъснати интервали.','lab-muted'));
   const buttons=el('div',undefined,'lab-actions');buttons.append(action('Отвори анализа','open-preview',String(index)));card.append(buttons);list.append(card);
  }renderSaveButton();
 }
 function renderSaveButton(){q<HTMLButtonElement>('[data-action="save-selected"]').disabled=busy||!previews.some(p=>p.selected&&!p.saved&&p.duplicate!=='exact');}
 function renderActiveOptions(){const select=q<HTMLSelectElement>('[data-lab-active]');select.replaceChildren(new Option('Избери от импорта или библиотеката',''));previews.forEach((p,i)=>select.append(new Option(`${p.model.name}${p.saved?' · записано':' · временно'}`,'preview:'+i)));for(const row of metadata)if(!previews.some(p=>p.model.id===row.id))select.append(new Option(row.name+' · библиотека',row.id));if(active){const index=previews.indexOf(active);select.value=index>=0?'preview:'+index:active.model.id;}}
 function renderOverview(){workout.render(active,preferences.timeZone);}
 async function reanalyze(){const entry=requireActive();try{const value=await rpc.run('analyze',{model:entry.model,distances:preferences.customDistances});entry.analysis=value.analysis;entry.meta=value.meta;entry.dirty=true;renderOverview();status('Анализът е преизчислен временно. Използвай „Запази текущата тренировка“, за да запазиш настройките.');}catch(error){entry.model.settings={...entry.analysis.settings};renderOverview();throw error;}}
 function renderLibrary(){
  const container=q('[data-lab-library]');container.replaceChildren();if(!library){container.append(el('p','Библиотеката не е достъпна. Временните тренировки не са загубени от прегледа.','lab-empty'));return;}
  const search=q<HTMLInputElement>('[data-lab-search]').value.trim().toLocaleLowerCase('bg'),from=q<HTMLInputElement>('[data-lab-from]').value,to=q<HTMLInputElement>('[data-lab-to]').value,min=Number(q<HTMLInputElement>('[data-lab-min-distance]').value||0)*1000,max=Number(q<HTMLInputElement>('[data-lab-max-distance]').value||Infinity)*1000;
  const sort=q<HTMLSelectElement>('[data-lab-sort]').value;
  const rows=metadata.filter(row=>{const d=row.date!==null?new Date(row.date).toISOString().slice(0,10):'';return (!search||(row.name+' '+row.comment).toLocaleLowerCase('bg').includes(search))&&(!from||d>=from)&&(!to||d<=to)&&row.summary.distanceM>=min&&row.summary.distanceM<=max;}).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'bg'):sort==='distance'?b.summary.distanceM-a.summary.distanceM:sort==='time'?(b.summary.elapsedSeconds||0)-(a.summary.elapsedSeconds||0):(b.date||0)-(a.date||0));
  if(!rows.length)container.append(el('p','Няма запазени тренировки за този филтър. Импортирай и потвърди записването им.','lab-empty'));
  for(const row of rows.slice(0,visibleLimit)){
   const card=el('article',undefined,'lab-item'),label=el('label',undefined,'lab-check'),check=el('input');check.type='checkbox';check.checked=selected.has(row.id);check.setAttribute('aria-label','Избери за сравнение: '+row.name);check.addEventListener('change',()=>{if(check.checked&&selected.size>=3){check.checked=false;status('Можеш да сравниш до три тренировки.');return;}if(check.checked)selected.add(row.id);else selected.delete(row.id);});label.append(check,document.createTextNode('Избери за сравнение'));
   const info=`${date(row.date,preferences.timeZone)} · ${km(row.summary.distanceM)} km · ${duration(row.summary.elapsedSeconds)} · ${pace(row.summary.pace)} · пулс ${num(row.summary.heart.mean)} · ↑ ${num(row.summary.ascentM)} m · ${row.source.format.toUpperCase()}`;
   card.append(label,el('h3',row.name),el('p',info),el('p',row.quality.complete?'Проверима непрекъсната дистанция':'Има ограничения в данните','lab-muted'));if(row.comment)card.append(el('p',row.comment));const buttons=el('div',undefined,'lab-actions');buttons.append(action('Отвори','open-saved',row.id),action('Име / коментар','rename',row.id),action('Изтрий','delete',row.id));card.append(buttons);container.append(card);
  }
  if(rows.length>visibleLimit)container.append(action(`Покажи още (${rows.length-visibleLimit})`,'more-library'));renderActiveOptions();
 }
 function renderRecords(){const value=recordViews(metadata,preferences);renderInto('[data-lab-records]',value.main);renderInto('[data-lab-record-history]',value.history);renderInto('[data-lab-official]',value.official);const distances=q('[data-lab-distances]');distances.replaceChildren();for(const d of preferences.customDistances)distances.append(action(`Премахни ${num(d/1000,4)} km`,'delete-distance',String(d)));}
 function renderHistory(){const value=historyViews(metadata);q('[data-lab-history-totals]').replaceChildren(...Array.from(value.totals.children));renderInto('[data-lab-history-chart]',value.chart);renderInto('[data-lab-history]',value.table);renderInto('[data-lab-years]',value.years);}
 async function openSaved(id:string){requireLibrary();const model=await library.get(id);if(!model)throw new Error('Тренировката е изтрита от този браузър. Обнови библиотеката.');const value=await rpc.run('analyze',{model,distances:preferences.customDistances});active={model,...value,selected:false,duplicate:null,saved:true};workout.resetView();q<HTMLInputElement>('[data-lab-range-start]').value='0';q<HTMLInputElement>('[data-lab-range-end]').value='';renderActiveOptions();renderOverview();show('overview');status('Тренировката е заредена от локалната библиотека.');}
 async function saveEntries(entries:Preview[],overwrite=false){
  requireLibrary();if(!entries.length)throw new Error('Избери нови тренировки за запазване.');
  if(!confirm(`Запази ${entries.length} тренировка/и само в този браузър?${entries.some(e=>e.duplicate==='probable')?' Има вероятни дубликати — ще се запазят отделно.':''}${overwrite?' Съществуващият запис ще получи текущото име/настройки.':''}`))return;
  const previous=recordHistory(metadata.map(m=>({id:m.id,name:m.name,stats:m.summary,records:m.records,settings:m.settings})),[...new Set(entries.flatMap(e=>e.analysis.evaluatedDistances))]);
  const count=await library.write(entries.map(e=>({model:e.model,meta:e.meta})),undefined,{overwrite});for(const entry of entries){entry.saved=true;entry.selected=false;entry.dirty=false;entry.analysis.findings=entry.analysis.findings.filter((f:any)=>!f.id.startsWith('record-'));entry.analysis.findings.push(...confirmedRecordFindings(entry.analysis,previous,true));}await refresh();renderPreviews();renderActiveOptions();renderOverview();status(`Запазени локално: ${count}. Оригиналните файлове не са качвани.`);
 }
 async function compare(){requireLibrary();const ids=[...selected];if(ids.length<2||ids.length>3)throw new Error('Избери две или три тренировки в библиотеката.');const models=[];for(const id of ids){const model=await library.get(id);if(!model)throw new Error('Избрана тренировка липсва. Обнови библиотеката.');models.push(model);}comparison=await rpc.run('compare',{models,mode:q<HTMLSelectElement>('[data-lab-compare-mode]').value,distances:preferences.customDistances});renderInto('[data-lab-comparison]',comparisonView(comparison,q<HTMLSelectElement>('[data-lab-compare-metric]').value));show('compare');status('Сравнението е по действителния общ участък.');}
 async function recompute(){requireLibrary();const rows=[...metadata];try{for(let i=0;i<rows.length;i++){if(cancelled)break;const model=await library.get(rows[i].id);if(!model)continue;const result=await rpc.run('analyze',{model,distances:preferences.customDistances});await library.write([{model,meta:result.meta}],undefined,{overwrite:true});progress({done:i+1,total:rows.length});}}catch(error){if(!cancelled)throw error;}finally{await refresh();}status(cancelled?'Преизчисляването е прекратено. Част от кеша може да чака обновяване.':'GPS рекордите са преизчислени от наличните оригинални измервания.');}
 async function savePreferences(value:any){requireLibrary();const checked=validatePreferences(value);await library.write([],checked);preferences=checked;await refresh();}
 async function restore(){
  requireLibrary();if(!restoration)throw new Error('Първо избери и валидирай архив.');const replace=q<HTMLSelectElement>('[data-lab-restore-mode]').value==='replace',keepProbable=q<HTMLInputElement>('[data-lab-restore-probable]').checked;
  const entries=replace?restoration.entries:restoration.entries.filter((entry:any)=>!metadata.some(row=>probableDuplicate(entry.meta,row)==='exact')&&(keepProbable||!metadata.some(row=>probableDuplicate(entry.meta,row)==='probable')));
  if(!confirm(replace?`Замени цялата локална библиотека и настройките с проверения архив (${entries.length} тренировки)? Предишните данни ще бъдат заменени само ако транзакцията завърши успешно.`:`Добави ${entries.length} тренировки? Точните дубликати се пропускат; вероятните ${keepProbable?'се запазват отделно':'се пропускат по твоя избор'}. Съществуващи официални резултати със същия ID се запазват.`))return;
  const prefs=replace?restoration.preferences:{...preferences,customDistances:[...new Set([...preferences.customDistances,...restoration.preferences.customDistances])],officialResults:[...preferences.officialResults,...restoration.preferences.officialResults.filter((r:any)=>!preferences.officialResults.some(old=>old.id===r.id))]};
  await library.write(entries,prefs,{replace,confirmed:replace});restoration=null;q<HTMLButtonElement>('[data-action="restore"]').disabled=true;if(replace){active=null;selected.clear();renderOverview();}await refresh();status('Архивът е възстановен атомарно в локалната библиотека.');
 }
 async function handleAction(name:string,id?:string){
  if(name==='cancel'){cancelled=true;rpc.cancel();status('Прекратяване…');return;}
  if(name==='clear-preview'){if(busy)throw new Error('Първо прекрати текущата операция.');previews=[];active=null;renderPreviews();renderActiveOptions();renderOverview();status('Временните данни са освободени. Библиотеката не е променяна.');return;}
  if(name==='more-library'){visibleLimit+=100;renderLibrary();return;}
  if(name==='reset-zoom'){workout.resetZoom();return;}
  if(name==='zoom'){workout.zoom();return;}
  if(name==='print'){window.print();return;}
  await task(async()=>{
   if(name==='open-preview'){active=previews[Number(id)];workout.resetView();q<HTMLInputElement>('[data-lab-range-start]').value='0';q<HTMLInputElement>('[data-lab-range-end]').value='';renderActiveOptions();renderOverview();show('overview');}
   else if(name==='open-saved')await openSaved(id!);
   else if(name==='save-selected')await saveEntries(previews.filter(p=>p.selected&&!p.saved&&p.duplicate!=='exact'));
   else if(name==='save-active')await saveEntries([requireActive()],metadata.some(row=>row.id===active?.model.id));
   else if(name==='refresh-library'){if(library)await refresh();else await initLibrary();}
   else if(name==='rename'){
    requireLibrary();const model=await library.get(id);if(!model)return;const name=prompt('Ново име на тренировката:',model.name);if(name===null)return;const comment=prompt('Личен коментар (по желание):',model.comment);if(comment===null)return;model.name=name.trim().slice(0,200)||model.name;model.comment=comment.slice(0,2000);const value=await rpc.run('analyze',{model,distances:preferences.customDistances});await library.write([{model,meta:value.meta}],undefined,{overwrite:true});if(active?.model.id===id){active={model,...value,selected:false,duplicate:null,saved:true};renderOverview();}await refresh();status('Името и коментарът са запазени локално.');
   }else if(name==='delete'){
    requireLibrary();const row=metadata.find(row=>row.id===id);if(!confirm(`Изтрий „${row?.name||'тренировката'}“? GPS историята ще се преизчисли от останалите записи.`))return;await library.remove(id);selected.delete(id!);if(active?.model.id===id){active=null;renderOverview();}await refresh();status('Тренировката е изтрита; историята на рекордите е обновена.');
   }else if(name==='delete-library'){
    requireLibrary();if(!confirm(`Изтрий всички ${metadata.length} тренировки, официални резултати и потребителски дистанции само в Running Lab? Първо направи архив, ако искаш да ги запазиш.`))return;await library.write([],defaultPreferences(),{replace:true,confirmed:true});selected.clear();active=null;await refresh();renderOverview();status('Локалната библиотека на Running Lab е изчистена. Другите приложения не са променяни.');
   }else if(name==='compare-selected')await compare();
   else if(name==='range')await workout.calculateRange();
   else if(name==='mark-finish')await workout.markFinish();
   else if(name==='clear-finish')await workout.clearFinish();
   else if(name==='recompute-records')await recompute();
   else if(name==='delete-distance'){await savePreferences({...preferences,customDistances:preferences.customDistances.filter(d=>d!==Number(id))});status('Потребителската дистанция е премахната.');}
   else if(name==='delete-official'){if(confirm('Изтрий този ръчно въведен официален резултат?')){await savePreferences({...preferences,officialResults:preferences.officialResults.filter(r=>r.id!==id)});status('Официалният резултат е изтрит.');}}
   else if(name==='edit-official'){
    const result=preferences.officialResults.find(r=>r.id===id);if(!result)return;const form=q<HTMLFormElement>('[data-lab-official-form]');for(const [key,value]of Object.entries({id:result.id,km:result.distanceM/1000,time:duration(result.seconds),date:result.date,race:result.race,url:result.url,comment:result.comment}))(form.elements.namedItem(key)as HTMLInputElement).value=String(value);form.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
   }else if(name==='backup'){requireLibrary();const value=await rpc.run('backup',{activities:await library.all(),preferences});download(value,'dido-running-lab-backup.json','application/json');status('Личният архив с GPS и сензорни данни е създаден локално.');}
   else if(name==='restore')await restore();
   else if(name==='splits-csv'){download(splitsCsv(requireActive().analysis),'dido-lab-splits.csv','text/csv;charset=utf-8');}
   else if(name==='metrics-csv'){download(metricsCsv([requireActive().analysis]),'dido-lab-metrics.csv','text/csv;charset=utf-8');}
   else if(name==='summary'){download(JSON.stringify(publicSummary(requireActive().analysis),null,2),'dido-lab-summary.json','application/json');}
   else if(name==='comparison-csv'){if(!comparison)throw new Error('Първо изчисли сравнение.');download(csv([['Име','Общ участък m','Време s','Темпо s/km'],...comparison.comparison.rows.map((r:any)=>[r.name,r.distanceM,r.seconds,r.pace])]),'dido-lab-comparison.csv','text/csv;charset=utf-8');}
  });
 }
 root.addEventListener('click',event=>{const button=event.target instanceof Element?event.target.closest<HTMLElement>('[data-tab],[data-action]'):null;if(!button)return;if(button.dataset.tab){show(button.dataset.tab);return;}void handleAction(button.dataset.action!,button.dataset.id).catch(error=>status(error.message));});
 q<HTMLInputElement>('[data-lab-files]').addEventListener('change',event=>{const input=event.target as HTMLInputElement;if(input.files){const files=Array.from(input.files);input.value='';void task(()=>importFiles(files));}});
 const drop=q('[data-lab-drop]');drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragging');if(event.dataTransfer?.files)void task(()=>importFiles(event.dataTransfer!.files));});
 q<HTMLSelectElement>('[data-lab-active]').addEventListener('change',event=>{const id=(event.target as HTMLSelectElement).value;if(id.startsWith('preview:')){active=previews[Number(id.slice(8))];workout.resetView();q<HTMLInputElement>('[data-lab-range-start]').value='0';q<HTMLInputElement>('[data-lab-range-end]').value='';renderOverview();}else if(id)void task(()=>openSaved(id));});
 for(const selector of ['[data-lab-search]','[data-lab-sort]','[data-lab-from]','[data-lab-to]','[data-lab-min-distance]','[data-lab-max-distance]'])q(selector).addEventListener('input',()=>{visibleLimit=100;renderLibrary();});
 q('[data-lab-compare-mode]').addEventListener('change',()=>{if(selected.size>=2)void task(compare);});
 q<HTMLSelectElement>('[data-lab-compare-metric]').addEventListener('change',()=>{if(comparison)renderInto('[data-lab-comparison]',comparisonView(comparison,q<HTMLSelectElement>('[data-lab-compare-metric]').value));});
 q<HTMLInputElement>('[data-lab-print-map]').addEventListener('change',event=>root.classList.toggle('lab-print-route',(event.target as HTMLInputElement).checked));
 q<HTMLFormElement>('[data-lab-distance-form]').addEventListener('submit',event=>{event.preventDefault();void task(async()=>{const data=new FormData(event.target as HTMLFormElement),distance=validateDistance(Number(String(data.get('km')).replace(',','.'))*1000);await savePreferences({...preferences,customDistances:[...new Set([...preferences.customDistances,distance])]});await recompute();});});
 q<HTMLFormElement>('[data-lab-official-form]').addEventListener('submit',event=>{event.preventDefault();void task(async()=>{const form=event.target as HTMLFormElement,data=new FormData(form),result=officialResult({id:data.get('id')||undefined,distanceM:Number(String(data.get('km')).replace(',','.'))*1000,seconds:parseDuration(String(data.get('time'))),date:data.get('date'),race:data.get('race'),url:data.get('url'),comment:data.get('comment')});await savePreferences({...preferences,officialResults:[...preferences.officialResults.filter(row=>row.id!==result.id),result]});form.reset();status('Официалният резултат е запазен отделно от GPS рекордите.');});});
 q<HTMLFormElement>('[data-lab-timezone-form]').addEventListener('submit',event=>{event.preventDefault();void task(async()=>{const data=new FormData(event.target as HTMLFormElement);await savePreferences({...preferences,timeZone:String(data.get('zone'))});renderOverview();status('Часовата зона за показване е запазена; времената остават UTC в данните.');});});
 q<HTMLInputElement>('[data-lab-restore]').addEventListener('change',event=>{const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;(event.target as HTMLInputElement).value='';void task(async()=>{restoration=null;q('[data-lab-restore-preview]').textContent='';q<HTMLButtonElement>('[data-action="restore"]').disabled=true;if(file.size>LIMITS.archiveBytes)throw new Error('Архивът надвишава 64 MiB.');restoration=await rpc.run('validate-backup',{text:await file.text()},progress);const exact=restoration.entries.filter((e:any)=>metadata.some(row=>probableDuplicate(e.meta,row)==='exact')).length,probable=restoration.entries.filter((e:any)=>metadata.some(row=>probableDuplicate(e.meta,row)==='probable')).length;q('[data-lab-restore-preview]').textContent=`Проверен архив: ${restoration.entries.length} тренировки, ${restoration.preferences.officialResults.length} официални резултата, ${exact} точни и ${probable} вероятни дубликата. Нищо не е записано.`;q<HTMLButtonElement>('[data-action="restore"]').disabled=false;status('Архивът е проверен. Избери режим и потвърди възстановяването.');});});
 window.addEventListener('beforeunload',()=>{rpc.cancel();library?.close();});
 let resizeTimer:ReturnType<typeof setTimeout>;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(active)workout.redraw();if(comparison)renderInto('[data-lab-comparison]',comparisonView(comparison,q<HTMLSelectElement>('[data-lab-compare-metric]').value));renderHistory();},150);});
 const fontProbe=el('span',undefined,'lab-font-probe');fontProbe.setAttribute('aria-hidden','true');root.append(fontProbe);
 if(typeof ResizeObserver!=='undefined'){let previous=0;const observer=new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(previous&&Math.abs(width-previous)>.1){workout.redraw();if(comparison)renderInto('[data-lab-comparison]',comparisonView(comparison,q<HTMLSelectElement>('[data-lab-compare-metric]').value));renderHistory();}previous=width;});observer.observe(fontProbe);window.addEventListener('beforeunload',()=>observer.disconnect());}
 root.querySelectorAll<HTMLElement>('[data-panel]').forEach(node=>{node.id='lab-panel-'+node.dataset.panel;root.querySelector(`[data-tab="${node.dataset.panel}"]`)?.setAttribute('aria-controls',node.id);});
 void initLibrary();renderPreviews();renderActiveOptions();
 // A separate explicit save action also persists analysis settings without changing raw points.
 const saveCurrent=action('Запази текущата тренировка / настройки','save-active');q('[data-lab-save-actions]').prepend(saveCurrent);
}
