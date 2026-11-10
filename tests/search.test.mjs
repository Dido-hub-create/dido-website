import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearch, prepareSearchIndex, queryWords, searchDocuments, searchUrl } from '../src/lib/search.mjs';
import { searchText, buildSearchIndex } from '../src/lib/search-index.mjs';

const document=(url,title,description='',body='')=>({url,title,type:'Статия',description,body});
const prepare=documents=>prepareSearchIndex({version:1,documents});
test('Bulgarian search handles case, punctuation, Latin variants and common inflections',()=>{
  assert.equal(normalizeSearch('  КАЙЛЪКА — 2026! '),normalizeSearch('Kaylaka 2026'));
  assert.equal(normalizeSearch('София'),normalizeSearch('Sofiya'));
  assert.equal(normalizeSearch('София'),normalizeSearch('Sofia'));
  assert.equal(normalizeSearch('ѝ'),normalizeSearch('и'));
  const docs=prepare([document('/cabinet/','Дигитални кабинети','Учителски приложения и ресурси'),document('/sofia/','Софийски полумаратон','София')]);
  for(const query of ['дигитален кабинет','digitalen kabinet']) assert.equal(searchDocuments(docs,query)[0]?.url,'/cabinet/');
  for(const query of ['кабинет','КАБИНЕТИ!','kabinet','приложение','приложенията','учителя','uchiteli']) assert.equal(searchDocuments(docs,query)[0]?.url,'/cabinet/',query);
  for(const query of ['СОФИЯ','Sofia','Sofiya','  София,  '])assert.equal(searchDocuments(docs,query)[0]?.url,'/sofia/',query);
  assert.deepEqual(queryWords('За маршрутите и трасетата'),['marshrut','trase']);
});
test('title outranks description and prose; all meaningful words are required',()=>{
  const docs=prepare([document('/body/','Друг текст','','Парк Кайлъка маршрут'),document('/description/','Моето състезание','Кайлъка парк'),document('/title/','Кайлъка парк')]);
  assert.deepEqual(searchDocuments(docs,'Кайлъка').map(r=>r.url),['/title/','/description/','/body/']);
  assert.equal(searchDocuments(docs,'Кайлъка маршрут')[0].url,'/body/');
  assert.deepEqual(searchDocuments(docs,'Кайлъка несъществуващ'),[]);
  assert.deepEqual(searchDocuments(docs,''),[]);assert.deepEqual(searchDocuments(docs,'!? и за'),[]);
  assert.deepEqual(searchDocuments(docs,'х'),[]);assert.deepEqual(searchDocuments(docs,'пустиня'),[]);
});
test('one small typo is allowed only as a fallback in meaningful title/description words',()=>{
  const docs=prepare([document('/kaylaka/','Кайлъка маршрут'),document('/other/','Друг маршрут','','Калкулатор')]);
  for(const query of ['Кайлка','Кайълка','Кайлъко'])assert.equal(searchDocuments(docs,query)[0]?.url,'/kaylaka/',query);
  assert.deepEqual(searchDocuments(docs,'Къйпкъ'),[]);
  assert.deepEqual(searchDocuments(docs,'калкулатро'),[],'do not fuzzy-match long prose');
  const exact=prepare([...docs.map(d=>document(d.url,d.title,d.description,d.body)),document('/exact/','Кайлка')]);
  assert.deepEqual(searchDocuments(exact,'Кайлка').map(r=>r.url),['/exact/']);
});
test('snippets find relevant body text and return plain strings, not markup',()=>{
  const text='Общо въведение. '.repeat(20)+'Уникален наклон при изкачването. '+'Край на статията. '.repeat(20);
  const result=searchDocuments(prepare([document('/article/','Профил','Описание без думата',text)]),'наклон')[0];
  assert.match(result.snippet,/наклон/);assert.ok(result.snippet.length<=167);assert.ok(result.snippet.startsWith('…'));
  assert.equal(searchText('## Урок [ресурси](https://private.test/key) ![image](secret.png) <script>PRIVATE_SCRIPT</script><style>SECRET_CSS</style><!--PRIVATE--> <b title="SECRET_ATTR">текст</b> ```PRIVATE_CODE```'),'Урок ресурси текст');
});
test('index validation refuses external, malformed and traversing URLs, deduplicates safely',()=>{
  for(const path of ['https://evil.test/','javascript:alert(1)','//evil.test','/%2fevil.test','/x/%2e%2e/','/x/../private','/%252e%252e/','/x\\evil','/\nsecret','/bad%','/foo?q=secret'])assert.equal(searchUrl(path),undefined,path);
  assert.equal(searchUrl('/posts/тест/'),'/posts/%D1%82%D0%B5%D1%81%D1%82/');
  assert.equal(searchUrl('/byagane/#video-test'),'/byagane/#video-test');
  const poisoned=[document('javascript:alert(1)','Unsafe'),document('/safe/','<img src=x onerror=alert(1)>'),document('/safe/','Duplicate'),{url:'/no-title/',body:'bad'}];
  const docs=prepare(poisoned);assert.equal(docs.length,1);assert.equal(searchDocuments(docs,'onerror')[0]?.title,'<img src=x onerror=alert(1)>');
  assert.throws(()=>prepareSearchIndex({version:2,documents:[]}));
});
test('real public index includes published metadata only and never route geometry or source files',async()=>{
  const publicPost={href:'/posts/search-fixture/',data:{title:'Тестова публикация',status:'published'},body:'Текст за индексиране',category:{label:'Полезно'}};
  const index=await buildSearchIndex({posts:[publicPost,{...publicPost,href:'/posts/draft/',data:{...publicPost.data,title:'PRIVATE_DRAFT',draft:true}}]});
  const serialized=JSON.stringify(index);assert.doesNotMatch(serialized,/PRIVATE_DRAFT|gpx-source|route-geometry|"segments"|"lat"|"lon"|youtubeChannel|publicSiteUrl/);
  for(const doc of index.documents){assert.deepEqual(Object.keys(doc),['url','title','type','description','body']);assert.ok(searchUrl(doc.url));}
  assert.equal(index.documents.filter(doc=>doc.url==='/tehnologii/digitalen-kabinet/').length,1);
  assert.equal(index.documents.filter(doc=>doc.type==='Маршрут').length,3);
  assert.equal(index.documents.filter(doc=>doc.type==='Категория приложения').length,5);
  assert.ok(searchDocuments(prepareSearchIndex(index),'GPX')[0]);
});
