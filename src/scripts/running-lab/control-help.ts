import {el} from './dom';
import {AnchoredPanel} from './anchored-panel';

const hints={
 local:['Локална GPS схема','Показва цялото GPS трасе без външен фон или картографски заявки.'],
 street:['Истинска карта','Зарежда OpenStreetMap само след разрешение за тази тренировка. Файловете остават в браузъра.'],
 fit:['Цял маршрут','Побира цялото трасе в картата. Не променя измерванията или графичния диапазон.'],
 wheel:['Колелце','Включва или изключва приближаването с колелцето само върху картата. Извън нея превърта страницата.'],
 follow:['Следвай точката','Държи избраната GPS точка видима край ръба, без промяна на zoom. Ръчното местене изключва следването.'],
 point:['Към точката','Центрира картата върху избраната GPS точка, без промяна на мащаба. Това е еднократно действие.'],
 settings:['Настройки на картата','Оцветяване, легенда, помощ и отнемане на разрешението за външния фон.'],
 scale:['Всички стойности / Автоматична скала','Превключва между пълния диапазон и устойчивата автоматична скала. Измерванията не се изтриват или променят.'],
 reset:['Цяла тренировка','Възстановява целия изглед на графиката и изчиства избрания диапазон. Не променя файла.']
} as const;

export class ControlHelp {
 private panel:AnchoredPanel;
 constructor(host:HTMLElement){
  this.panel=new AnchoredPanel(host,'lab-control-help','Помощ за картата и графиките');this.panel.node.dataset.labControlHelp='';this.panel.body.tabIndex=0;this.panel.body.setAttribute('aria-label','Пояснения към управлението');
  const intro=el('p','Плъзгай картата за местене; използвай два пръста, +/− или колелцето за zoom. Щракни близо до маршрута. При застъпване избери преминаване.','lab-muted'),list=el('dl',undefined,'lab-control-guide');
  for(const [key,[title,text]]of Object.entries(hints)){const item=el('div'),label=el('dt',title),description=el('dd',text);description.id='lab-control-hint-'+key;item.append(label,description);list.append(item);}
  this.panel.body.append(intro,list);
 }
 attach(button:HTMLButtonElement,key:keyof typeof hints){button.title=hints[key][1];button.setAttribute('aria-describedby','lab-control-hint-'+key);}
 prepare(button:HTMLButtonElement){this.panel.prepare(button);}
 open(button:HTMLButtonElement,anchor:HTMLElement=button,boundary?:HTMLElement){this.panel.open(button,anchor,boundary);}
 close(){this.panel.close(false);}
 destroy(){this.panel.destroy();}
}
