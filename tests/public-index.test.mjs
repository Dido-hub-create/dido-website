import test from 'node:test';
import assert from 'node:assert/strict';
const payload={version:1,documents:[{url:'/za-men/',title:'За мен',type:'Страница',description:'Описание',body:''}]};
test('search and favorites share a lazy request and failures remain retryable',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'/search-index.json');assert.equal(options.cache,'no-cache');return Response.json(payload);};
  const {loadPublicIndex}=await import('../src/lib/public-index.mjs?shared');
  assert.equal(calls,0);const a=loadPublicIndex(),b=loadPublicIndex();assert.equal(a,b);
  assert.equal((await a)[0].title,'За мен');await b;await loadPublicIndex();assert.equal(calls,1);
  calls=0;globalThis.fetch=()=>{if(++calls===1)throw new Error('Network failure');return Promise.resolve(Response.json(payload));};
  const retry=await import('../src/lib/public-index.mjs?retry');await assert.rejects(retry.loadPublicIndex());assert.equal((await retry.loadPublicIndex()).length,1);assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});
