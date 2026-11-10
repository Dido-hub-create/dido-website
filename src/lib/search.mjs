// Shared by the build and the browser. No content, network calls or dependencies here.
const letters = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sht',ъ:'a',ь:'y',ю:'yu',я:'ya'};
const families = [
  ['prilozhenie','prilozhenia','prilozhenieto','prilozheniata'],
  ['sastezanie','sastezania','sastezanieto','sastezaniata'],
  ['marshrut','marshruti','marshrutite','marshruta'],
  ['kabinet','kabineti','kabineta','kabinetite'],
  ['digitalen','digitalni','digitalna','digitalnoto'],
  ['uchitel','uchiteli','uchitelya','uchitelski'],
  ['byagane','biagane','byaganeto','biaganeto'], ['polumaraton','polumaratona'],
  ['kalculator','kalkulator','kalkulatori'], ['analiz','analizi','analiza'],
  ['trase','traseta','traseto','trasetata'],
  ['izkachvane','izkachvania','izkachvaniata'], ['spuskane','spuskania','spuskaniata'],
  ['naklon','nakloni','naklona'], ['visochina','visochini','visochinite'],
  ['statia','statii','statiata'], ['snimka','snimki','snimkite'],
];
const stems = new Map(families.flatMap(words => words.map(word => [word, words[0]])));
const stopWords = new Set(['za','na','v','s','i','ot','do','po','the','and']);

export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFC').toLocaleLowerCase('bg')
    .replaceAll('ѝ','и').replace(/[а-я]/g, letter => letters[letter] ?? letter)
    .normalize('NFD').replace(/\p{M}/gu,'')
    .replace(/iya(?=\b|ta\b)/g,'ia').replace(/ay/g,'ai')
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function tokens(value) {
  return normalizeSearch(value).split(' ').filter(Boolean).map(word => stems.get(word) ?? word);
}
export function queryWords(query) {
  return [...new Set(tokens(String(query).slice(0,80)).filter(word => word.length > 1 && !stopWords.has(word)))].slice(0,8);
}

/** Only local, canonical page links. Never accept schemes, traversal or encoded separators. */
export function searchUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /%(?:2f|5c)/i.test(value)) return undefined;
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { return undefined; }
  if (/[\\\u0000-\u0020\u007f]/u.test(decoded) || decoded.startsWith('//') || /%[0-9a-f]{2}/i.test(decoded)) return undefined;
  if (decoded.split(/[/?#]/).some(part => part === '.' || part === '..')) return undefined;
  try {
    const url = new URL(value,'https://dido.invalid');
    return url.origin === 'https://dido.invalid' && !url.search ? url.pathname + url.hash : undefined;
  } catch { return undefined; }
}

export function prepareSearchIndex(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.documents)) throw new Error('Unsupported search index');
  const seen = new Set();
  return payload.documents.slice(0,10000).flatMap(doc => {
    const url = searchUrl(doc?.url);
    if (!url || seen.has(url) || !['title','type','description','body'].every(key => typeof doc[key] === 'string') || !doc.title.trim()) return [];
    seen.add(url);
    return [{ url, title:doc.title, type:doc.type, description:doc.description, body:doc.body,
      fields:[doc.title,doc.description,doc.body].map(value => [...new Set(tokens(value))]),
      phrases:[doc.title,doc.description,doc.body].map(normalizeSearch) }];
  });
}

// At most one edit, including swapped neighbours. Fuzzy matching is a fallback only.
function oneEdit(a,b) {
  if (a === b) return true;
  if (Math.abs(a.length-b.length)>1) return false;
  let i=0; while(i<a.length && a[i]===b[i]) i++;
  if (a.length===b.length) {
    return a.slice(i+1)===b.slice(i+1) || (a[i]===b[i+1] && a[i+1]===b[i] && a.slice(i+2)===b.slice(i+2));
  }
  return a.length>b.length ? a.slice(i+1)===b.slice(i) : a.slice(i)===b.slice(i+1);
}
function wordScore(word,fields,fuzzy) {
  const weights = [[100,70],[30,20],[8,5]];
  for (let field=0;field<fields.length;field++) {
    if(fields[field].includes(word)) return weights[field][0];
    if(fields[field].some(token => token.startsWith(word))) return weights[field][1];
  }
  if(fuzzy && word.length>=5) {
    for(let field=0;field<2;field++) if(fields[field].some(token => oneEdit(word,token))) return field===0?35:12;
  }
  return 0;
}
function snippet(doc,words) {
  let text=doc.description || doc.body || doc.title;
  if (!tokens(text).some(word => words.some(query => word.startsWith(query))) && tokens(doc.body).some(word => words.some(query => word.startsWith(query)))) text=doc.body;
  let offset=0;
  for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    if(tokens(match[0]).some(word => words.some(query => word.startsWith(query)))) { offset=Math.max(0,match.index-45);break; }
  }
  if(offset) { const space=text.indexOf(' ',offset);if(space>=0)offset=space+1; }
  const part=text.slice(offset,offset+165);
  return (offset?'…':'')+part.trim()+(offset+165<text.length?'…':'');
}
export function searchDocuments(documents,query,limit=12) {
  const words=queryWords(query);if(!words.length)return [];
  const phrase=normalizeSearch(String(query).slice(0,80));
  function rank(fuzzy) {
    return documents.flatMap(doc => {
      const scores=words.map(word=>wordScore(word,doc.fields,fuzzy));
      if(scores.some(score=>!score))return [];
      const field=doc.phrases.findIndex(value=>value.includes(phrase));
      const score=scores.reduce((sum,value)=>sum+value,0)+(field>=0?[160,40,10][field]:0);
      return [{doc,score}];
    });
  }
  let ranked=rank(false);if(!ranked.length)ranked=rank(true);
  return ranked.sort((a,b)=>b.score-a.score || a.doc.title.localeCompare(b.doc.title,'bg') || a.doc.url.localeCompare(b.doc.url))
    .slice(0,limit).map(({doc})=>({url:doc.url,title:doc.title,type:doc.type,snippet:snippet(doc,words)}));
}
