import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
test('favorite controls reference only current public index entries and the private list is never baked into HTML',()=>{
 const index=JSON.parse(readFileSync('dist/search-index.json','utf8'));const urls=new Set(index.documents.map(doc=>doc.url));let buttons=0;
 function walk(folder){for(const entry of readdirSync(folder,{withFileTypes:true})){const path=join(folder,entry.name);if(entry.isDirectory())walk(path);else if(path.endsWith('.html')){const html=readFileSync(path,'utf8');for(const match of html.matchAll(/data-favorite-url="([^"]+)"/g)){buttons++;assert.ok(urls.has(match[1]),`${path}: ${match[1]} is absent from public index`);}}}}
 walk('dist');assert.ok(buttons>=10);assert.ok(!urls.has('/lyubimi/'));
 const page=readFileSync('dist/lyubimi/index.html','utf8');assert.match(page,/<h1[^>]*>Моите любими/);assert.match(page,/data-favorites-empty/);assert.doesNotMatch(page,/localStorage\.clear|KEEP_AUTHOR_DATA/);
 for(const [path,url] of [['dist/posts/2026-11-06-moyata-purva-probna-publikaciya/index.html','/posts/2026-11-06-moyata-purva-probna-publikaciya/'],['dist/byagane/marshruti/pleven-half-2026/index.html','/byagane/marshruti/pleven-half-2026/'],['dist/byagane/sastezaniya/kaylakamarathon2026/index.html','/byagane/sastezaniya/kaylakamarathon2026/'],['dist/prilozheniya/digitalni-kabineti/index.html','/tehnologii/digitalen-kabinet/']])assert.ok(readFileSync(path,'utf8').includes(`data-favorite-url="${url}"`));
});
