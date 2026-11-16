import test from 'node:test';
import assert from 'node:assert/strict';
import { createFavoritesStore, parseFavorites, resolveFavorites, FAVORITES_KEY, MAX_FAVORITES } from '../src/lib/favorites.mjs';

function memoryStorage(){
 const values=new Map([['cabinet-existing-data','KEEP_AUTHOR_DATA']]);
 return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
}
test('favorites add/remove persist only canonical URLs and keep unrelated application data',()=>{
 const storage=memoryStorage(),store=createFavoritesStore(()=>storage);
 assert.deepEqual(store.read().urls,[]);
 assert.equal(store.set('/posts/урок/',true).changed,true);
 assert.equal(store.set('/byagane/analiz/',true).changed,true);
 assert.equal(store.set('/byagane/analiz/',true).changed,false);
 const saved=JSON.parse(storage.values.get(FAVORITES_KEY));
 assert.deepEqual(Object.keys(saved),['version','urls']);assert.equal(saved.urls.length,2);
 const reopened=createFavoritesStore(()=>storage);assert.deepEqual(reopened.read().urls,saved.urls);
 assert.equal(reopened.set('/byagane/analiz/',false).changed,true);
 assert.equal(reopened.set('/byagane/analiz/',false).changed,false);
 assert.equal(reopened.read().urls.length,1);
 assert.equal(storage.values.get('cabinet-existing-data'),'KEEP_AUTHOR_DATA');
 assert.equal(store.set('javascript:alert(1)',true).changed,false);
});
test('malformed or hostile storage is bounded, deduplicated, validated and never used as HTML',()=>{
 for(const raw of ['',null,'{broken','{"version":2,"urls":[]}','{"version":1,"urls":"bad"}','x'.repeat(1100001)])assert.deepEqual(parseFavorites(raw).urls,[]);
 const data={version:1,urls:['/posts/урок/','/posts/%D1%83%D1%80%D0%BE%D0%BA/','javascript:alert(1)','//evil.test','/%2e%2e/secret','/x\\secret','/bad?q=secret',{},null,'/lyubimi/'],title:'<img onerror=alert(1)>'};
 const parsed=parseFavorites(JSON.stringify(data));assert.equal(parsed.invalid,true);assert.deepEqual(parsed.urls,['/posts/%D1%83%D1%80%D0%BE%D0%BA/']);
 const many=parseFavorites(JSON.stringify({version:1,urls:Array.from({length:MAX_FAVORITES+1},(_,i)=>`/posts/${i}/`)}));assert.equal(many.urls.length,MAX_FAVORITES);assert.equal(many.invalid,true);
 const storage=memoryStorage();storage.values.set(FAVORITES_KEY,'{bad');const store=createFavoritesStore(()=>storage);assert.equal(store.read().problem,'invalid');assert.equal(storage.values.get(FAVORITES_KEY),'{bad','read never clears a damaged record');store.set('/byagane/',true);assert.equal(store.read().problem,'');
});
test('denied reads and quota failures retain a clearly temporary in-memory list without throwing',()=>{
 for(const source of [()=>{throw new Error('SecurityError');},()=>({getItem:()=>JSON.stringify({version:1,urls:['/posts/old/']}),setItem:()=>{throw new Error('QuotaExceededError');}})]){
  const store=createFavoritesStore(source);store.read();let state=store.set('/posts/new/',true);assert.equal(state.persistent,false);assert.equal(state.problem,'unavailable');assert.ok(state.urls.includes('/posts/new/'));
  state=store.set('/posts/next/',true);assert.ok(state.urls.includes('/posts/new/'));assert.ok(state.urls.includes('/posts/next/'));
  state=store.set('/posts/new/',false);assert.ok(!state.urls.includes('/posts/new/'));assert.ok(store.read().urls.includes('/posts/next/'));
 }
});
test('multiple tabs merge current storage and the limit never prevents removal',()=>{
 const storage=memoryStorage(),a=createFavoritesStore(()=>storage),b=createFavoritesStore(()=>storage);a.read();b.read();
 a.set('/posts/a/',true);b.set('/posts/b/',true);assert.deepEqual(a.read().urls,['/posts/b/','/posts/a/']);
 b.set('/posts/a/',false);assert.deepEqual(a.read().urls,['/posts/b/']);
 storage.values.set(FAVORITES_KEY,JSON.stringify({version:1,urls:Array.from({length:MAX_FAVORITES},(_,i)=>`/posts/${i}/`)}));
 assert.equal(a.set('/posts/extra/',true).limit,true);a.set('/posts/0/',false);assert.equal(a.set('/posts/extra/',true).changed,true);
});
test('current public metadata replaces old titles; missing, hidden or private addresses have no active record',()=>{
 const urls=['/posts/урок/','/posts/draft/','/private/'];const canonical=parseFavorites(JSON.stringify({version:1,urls})).urls;
 const document={url:canonical[0],title:'Ново заглавие на кирилица',type:'Статия · Полезно',description:'Актуално описание',body:''};
 const rows=resolveFavorites(canonical,[document]);assert.equal(rows[0].title,document.title);assert.equal(rows[0].description,document.description);assert.equal(rows[0].available,true);
 for(const row of rows.slice(1)){assert.equal(row.available,false);assert.equal(row.title,'Материалът вече не е наличен');assert.ok(!row.title.includes(row.url));}
 assert.equal(resolveFavorites(canonical,[]).filter(row=>row.available).length,0);
});
