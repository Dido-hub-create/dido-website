import {compareArchivedRaces} from "./race-results.mjs";
import {archivedRace,countdownText} from './races.mjs';
export function initializeRaceWidgets(root=document){
 root.querySelectorAll('[data-races-widget]').forEach(widget=>{
  let limit=3;const more=widget.querySelector('[data-race-more]');
  function update(){
   const archive=widget.querySelector('[data-race-group="archive"]');
   widget.querySelectorAll('[data-race]').forEach(card=>{
    const race=JSON.parse(card.dataset.race||'{}'),past=archivedRace(race);
    const counter=card.querySelector('[data-countdown]');if(counter)counter.textContent=countdownText(race);
    const result=card.querySelector('[data-completed-results]');if(result)result.hidden=!past;
    if(past){
     if(archive&&!archive.contains(card)){
      const template=card.querySelector('[data-archive-template]');
      if(template){archive.prepend(template.content.firstElementChild.cloneNode(true));card.remove();}
      else archive.prepend(card);
     }else if(!archive)card.hidden=true;
    }
   });
   if(archive&&more){
    const cards=Array.from(archive.children).filter(el=>el.matches('.race-card'));
    cards.sort((a,b)=>{const x=JSON.parse(a.dataset.race||'{}'),y=JSON.parse(b.dataset.race||'{}');return compareArchivedRaces({...x,id:a.id},{...y,id:b.id});});
    cards.forEach((card,i)=>{archive.append(card);card.hidden=i>=limit;});
    more.hidden=cards.length<=limit;
   }
   ['upcoming','archive'].forEach(group=>{
    const empty=widget.querySelector(`[data-race-empty="${group}"]`);
    if(empty)empty.hidden=widget.querySelectorAll(`[data-race-group="${group}"] > .race-card:not([hidden])`).length>0;
   });
  }
  more?.addEventListener('click',()=>{
   const previous=limit;limit+=3;more.setAttribute('aria-expanded','true');update();
   if(more.hidden)widget.querySelectorAll('[data-race-group="archive"] > .race-card')[previous]?.querySelector('a')?.focus({preventScroll:true});
  });
  update();setInterval(update,60000);
 });
}
