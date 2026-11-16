import { createFavoritesStore, favoriteUrl, FAVORITES_KEY, MAX_FAVORITES, resolveFavorites } from '../lib/favorites.mjs';
import { loadPublicIndex } from '../lib/public-index.mjs';

const store = createFavoritesStore(() => window.localStorage);
let state = store.read();
let catalog:Awaited<ReturnType<typeof loadPublicIndex>>|undefined;
let loading = false, failed = false, category = 'all';
const page = document.querySelector<HTMLElement>('[data-favorites-page]');
const grid = page?.querySelector<HTMLElement>('#favorite-list');
const filter = page?.querySelector<HTMLSelectElement>('[data-favorites-filter]');
const feedback = document.querySelector<HTMLElement>('#favorite-feedback');
const announcement = document.querySelector<HTMLElement>('#favorite-announcement');
let feedbackTimer:ReturnType<typeof setTimeout>|undefined;

function syncButton(button:HTMLButtonElement) {
  const url = favoriteUrl(button.dataset.favoriteUrl);
  if (!url) return;
  const saved = state.urls.includes(url), action = saved ? 'Премахни от любими' : 'Добави в любими';
  button.hidden = false;
  button.classList.toggle('is-saved',saved);
  button.setAttribute('aria-pressed',String(saved));
  button.setAttribute('aria-label',`${action}: ${button.dataset.favoriteTitle || 'Материал'}`);
  button.title = action;
  const label = button.querySelector('[data-favorite-label]');
  const text = saved ? 'Запазено' : 'Запази';
  if (label && label.textContent !== text) label.textContent = text;
}
function syncButtons(root:ParentNode=document) {
  root.querySelectorAll<HTMLButtonElement>('button[data-favorite-url]').forEach(syncButton);
}
function announce(text:string) {
  if (!feedback) return;
  clearTimeout(feedbackTimer);
  feedback.textContent = text + (!state.persistent ? ' Браузърът не позволява постоянен запис. Любимите са временни до презареждане на тази страница.' : '');
  // Keep the live region in the accessibility tree before its text changes.
  if (announcement) announcement.textContent = feedback.textContent;
  feedback.hidden = false;
  feedbackTimer = setTimeout(() => {feedback.hidden=true;},10000);
}
async function loadCatalog() {
  if (loading || catalog) return;
  loading = true; failed = false;
  try { catalog = await loadPublicIndex(); }
  catch { failed = true; }
  finally { loading = false; renderPage(); }
}
function element<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function renderPage() {
  if (!page || !grid || !filter) return;
  const focused = document.activeElement;
  const focusKey = grid.contains(focused) && focused instanceof HTMLElement
    ? focused.dataset.favoriteRemove || (focused instanceof HTMLAnchorElement ? focused.getAttribute('href') : undefined) : undefined;
  const focusKind = focused instanceof HTMLAnchorElement ? 'a' : '[data-favorite-remove]';
  const empty = page.querySelector<HTMLElement>('[data-favorites-empty]')!;
  const storageNote = page.querySelector<HTMLElement>('[data-favorites-storage]')!;
  storageNote.hidden = !state.problem;
  storageNote.textContent = state.persistent ? 'Невалидни локални данни са пропуснати. Можеш да запазваш нови любими.' : 'Браузърът не позволява постоянен запис. Любимите са временни до презареждане на тази страница.';
  empty.hidden = state.urls.length > 0;
  if (state.urls.length && !catalog && !loading && !failed) void loadCatalog();
  const progress = page.querySelector<HTMLElement>('[data-favorites-progress]')!;
  progress.hidden = !state.urls.length || !!catalog;
  progress.textContent = failed ? 'Не успяхме да проверим публичните материали. Връзките ще се появят след успешно зареждане.' : 'Проверяваме актуалните публични материали…';
  page.querySelector<HTMLElement>('[data-favorites-retry]')!.hidden = !failed || !state.urls.length;
  const rows = catalog ? resolveFavorites(state.urls,catalog) : state.urls.map(url => ({url,available:false,title:'Запазен материал',type:'Непроверено',description:'Заглавието и връзката ще се покажат след проверка в публичния каталог.'}));
  const types = [...new Set(rows.map(row => row.type))].sort((a,b)=>a.localeCompare(b,'bg'));
  const showFilter = rows.length >= 4 && types.length >= 2;
  if (!showFilter || !types.includes(category)) category = 'all';
  page.querySelector<HTMLElement>('[data-favorites-filter-wrap]')!.hidden = !showFilter;
  filter.replaceChildren(new Option('Всички','all'),...types.map(type => new Option(`${type} (${rows.filter(row => row.type===type).length})`,type)));
  filter.value = category;
  const visible = rows.filter(row => category==='all' || row.type===category);
  const total = `${rows.length} ${rows.length===1?'материал':'материала'}`;
  page.querySelector<HTMLElement>('[data-favorites-count]')!.textContent = category==='all' ? total : `${visible.length} от ${total}`;
  grid.replaceChildren();
  visible.forEach((row,index) => {
    const card = element('article',undefined,'favorite-card');card.setAttribute('role','listitem');
    const type = element('p',row.type,'favorite-category');
    const heading = element('h2',row.title);heading.id=`favorite-title-${index}`;
    card.setAttribute('aria-labelledby',heading.id);
    const description = element('p',row.description,'favorite-description');
    const actions = element('div',undefined,'favorite-actions');
    if (row.available) {
      const link = element('a','Отвори →','favorite-open');link.href=row.url;link.setAttribute('aria-label',`Отвори: ${row.title}`);actions.append(link);
    }
    const remove = element('button','Премахни','favorite-remove');remove.type='button';remove.dataset.favoriteRemove=row.url;remove.setAttribute('aria-label',`Премахни от любими: ${row.title}`);
    remove.addEventListener('click',() => {
      const position = Array.from(grid.querySelectorAll('[data-favorite-remove]')).indexOf(remove);
      state = store.set(row.url,false);syncButtons();renderPage();announce('Материалът е премахнат от любимите.');
      const buttons = grid.querySelectorAll<HTMLButtonElement>('[data-favorite-remove]');
      (buttons[Math.min(position,buttons.length-1)] || empty.querySelector<HTMLAnchorElement>('a'))?.focus();
    });
    actions.append(remove);card.append(type,heading,description,actions);grid.append(card);
  });
  if (focusKey) {
    const replacement = Array.from(grid.querySelectorAll<HTMLElement>(focusKind)).find(control => (control.dataset.favoriteRemove || control.getAttribute('href'))===focusKey);
    (replacement || grid.querySelector<HTMLElement>('[data-favorite-remove]') || empty.querySelector<HTMLAnchorElement>('a'))?.focus();
  }
}
document.addEventListener('click',event => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-favorite-url]') : null;
  if (!button || !favoriteUrl(button.dataset.favoriteUrl)) return;
  const selected = button.getAttribute('aria-pressed') !== 'true';
  state = store.set(button.dataset.favoriteUrl,selected);
  syncButtons();renderPage();
  if ('limit' in state && state.limit) announce(`Можеш да запазиш до ${MAX_FAVORITES} материала. Премахни някой, за да добавиш нов.`);
  else announce(selected ? 'Материалът е добавен в Моите любими.' : 'Материалът е премахнат от любимите.');
});
filter?.addEventListener('change',() => {category=filter.value;renderPage();});
page?.querySelector('[data-favorites-retry]')?.addEventListener('click',() => {void loadCatalog();renderPage();});
window.addEventListener('storage',event => {
  if (event.key !== FAVORITES_KEY && event.key !== null) return;
  state = store.read();syncButtons();renderPage();
});
// Race cards can be replaced by their archived template after midnight.
new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.matches('button[data-favorite-url]')) syncButton(node as HTMLButtonElement);
    if (node.querySelector('button[data-favorite-url]')) syncButtons(node);
  }
}).observe(document.body,{childList:true,subtree:true});
syncButtons();renderPage();
