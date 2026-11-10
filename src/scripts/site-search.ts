import { prepareSearchIndex, queryWords, searchDocuments } from '../lib/search.mjs';

const dialog=document.querySelector<HTMLDialogElement>('#site-search');
const trigger=document.querySelector<HTMLButtonElement>('[data-search-open]');
const input=document.querySelector<HTMLInputElement>('#search-query');
const results=document.querySelector<HTMLUListElement>('#search-results');
const status=document.querySelector<HTMLElement>('#search-status');
const retry=document.querySelector<HTMLButtonElement>('[data-search-retry]');
if(dialog && trigger && input && results && status && retry) {
  const modal=dialog, button=trigger, field=input, list=results, message=status, retryButton=retry;
  let index:ReturnType<typeof prepareSearchIndex>|undefined;
  let pending:Promise<void>|undefined;
  let invoker:HTMLElement|null=null;
  button.hidden=false;

  function render() {
    list.replaceChildren();
    if(!index)return;
    const words=queryWords(field.value);
    if(!words.length) { message.textContent='Напиши дума или заглавие (поне 2 букви).';return; }
    const matches=searchDocuments(index,field.value);
    message.textContent=matches.length ? `${matches.length===12?'Първите 12':matches.length} резултат${matches.length===1?'':'а'}.` : 'Няма резултати. Опитай с друга дума или по-кратко заглавие.';
    for(const result of matches) {
      const item=document.createElement('li');
      const link=document.createElement('a');link.href=result.url;
      const category=document.createElement('span');category.className='search-result-type';category.textContent=result.type;
      const title=document.createElement('strong');title.textContent=result.title;
      const excerpt=document.createElement('span');excerpt.className='search-result-excerpt';excerpt.textContent=result.snippet;
      link.append(category,title,excerpt);item.append(link);list.append(item);
    }
  }
  function loadIndex() {
    if(index) {render();return;}
    if(pending)return;
    message.textContent='Зареждане на търсенето…';retryButton.hidden=true;list.replaceChildren();
    pending=(async()=>{
      try {
        const response=await fetch('/search-index.json',{cache:'no-cache',signal:AbortSignal.timeout(8000)});
        if(!response.ok)throw new Error('Unavailable index');
        index=prepareSearchIndex(await response.json());render();
      } catch {
        message.textContent='Търсенето не се зареди. Провери връзката и опитай отново.';
        retryButton.hidden=false;
      } finally {pending=undefined;}
    })();
  }
  function open() {
    if(modal.open)return;
    invoker=document.activeElement instanceof HTMLElement?document.activeElement:button;
    // The dialog lives outside the mobile navigation so Ctrl+K works with a closed menu.
    document.querySelector('.navigation')?.classList.remove('is-open');
    document.querySelector('.menu-toggle')?.setAttribute('aria-expanded','false');
    modal.showModal();button.setAttribute('aria-expanded','true');
    document.documentElement.classList.add('search-is-open');field.focus();loadIndex();
  }
  function close() {modal.close();}
  button.addEventListener('click',open);
  modal.querySelector('[data-search-close]')?.addEventListener('click',close);
  retryButton.addEventListener('click',loadIndex);
  field.addEventListener('input',render);
  list.addEventListener('click',event=>{if(event.target instanceof Element && event.target.closest('a'))close();});
  modal.addEventListener('close',()=>{
    button.setAttribute('aria-expanded','false');document.documentElement.classList.remove('search-is-open');
    const target=invoker?.getClientRects().length ? invoker : document.querySelector<HTMLElement>('.menu-toggle');
    if(target?.getClientRects().length)target.focus();else button.focus();
  });
  modal.addEventListener('click',event=>{
    if(event.target!==modal)return;
    const box=modal.getBoundingClientRect();
    if(event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom)close();
  });
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='k') {event.preventDefault();open();}
  });
  modal.addEventListener('keydown',event=>{
    // Search inputs may consume Escape to clear text before the native dialog closes.
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key==='Tab'){
      const controls=Array.from(modal.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled])')).filter(el=>el.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
      return;
    }
    const links=Array.from(list.querySelectorAll<HTMLAnchorElement>('a'));
    const active=document.activeElement;
    if(event.key==='Enter' && active===field) {event.preventDefault();links[0]?.click();}
    if(!['ArrowDown','ArrowUp'].includes(event.key) || (active!==field && !links.includes(active as HTMLAnchorElement)))return;
    event.preventDefault();
    const current=links.indexOf(active as HTMLAnchorElement);
    const next=event.key==='ArrowDown' ? (current+1)%Math.max(1,links.length) : current===-1?links.length-1:current-1;
    if(next<0)field.focus();else links[next]?.focus();
  });
}
