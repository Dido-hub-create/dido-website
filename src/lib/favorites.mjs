import { searchUrl } from './search.mjs';

export const FAVORITES_KEY = 'dido.favorites.v1';
export const MAX_FAVORITES = 500;

export function favoriteUrl(value) {
  const url = searchUrl(value);
  return url && url !== '/lyubimi/' ? url : undefined;
}

// No titles, HTML, coordinates or personal data are read from or written to storage.
/** @returns {{urls:string[], invalid:boolean}} */
export function parseFavorites(raw) {
  if (raw === null) return {urls:[], invalid:false};
  try {
    if (typeof raw !== 'string' || raw.length > 1100000) throw new Error();
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.urls)) throw new Error();
    const urls = [...new Set(data.urls.slice(0,MAX_FAVORITES).map(favoriteUrl).filter(Boolean))];
    return {urls, invalid:urls.length !== data.urls.length};
  } catch { return {urls:[], invalid:true}; }
}

/** Only the current public index can supply a title or an actionable link.
 * @param {string[]} urls
 * @param {{url:string,title:string,type:string,description:string,body?:string}[]} documents
 */
export function resolveFavorites(urls, documents) {
  const catalog = new Map(documents.map(doc => [doc.url,doc]));
  return urls.map(url => {
    const doc = catalog.get(url);
    const description = doc?.description || doc?.body || '';
    return doc ? {url, available:true, title:doc.title, type:doc.type,
      description:description.length>180 ? description.slice(0,177).replace(/\s+\S*$/,'')+'…' : description}
      : {url, available:false, title:'Материалът вече не е наличен', type:'Недостъпно',
        description:'Възможно е да е премахнат, скрит или адресът му да е променен.'};
  });
}

/** @param {() => Pick<Storage,'getItem'|'setItem'>} getStorage */
export function createFavoritesStore(getStorage) {
  /** @type {string[]} */
  let urls = [];
  let problem = '', temporary = false;
  const snapshot = () => ({urls:[...urls], problem, persistent:!temporary});
  function read() {
    if (temporary) return snapshot();
    try {
      const data = parseFavorites(getStorage().getItem(FAVORITES_KEY));
      urls = data.urls; problem = data.invalid ? 'invalid' : '';
    } catch { temporary = true; problem = 'unavailable'; }
    return snapshot();
  }
  function set(value, selected) {
    const url = favoriteUrl(value);
    read();
    if (!url) return {...snapshot(), changed:false};
    if (urls.includes(url) === selected) return {...snapshot(), changed:false};
    if (selected && !urls.includes(url) && urls.length >= MAX_FAVORITES) return {...snapshot(), changed:false, limit:true};
    const next = selected ? [url,...urls.filter(item => item !== url)] : urls.filter(item => item !== url);
    if (next.length === urls.length && next.every((item,i) => item === urls[i])) return {...snapshot(), changed:false};
    urls = next;
    if (!temporary) {
      try { getStorage().setItem(FAVORITES_KEY,JSON.stringify({version:1,urls})); problem = ''; }
      catch { temporary = true; problem = 'unavailable'; }
    }
    return {...snapshot(), changed:true};
  }
  return {read, set};
}
