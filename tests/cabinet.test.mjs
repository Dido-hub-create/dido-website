import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('public/downloads/digitalen-kabinet.html','utf8');
test('cabinet starts empty, retains legacy keys and validates untrusted imports/URLs',()=>{
 const util=html.slice(html.indexOf('function safeResourceUrl'),html.indexOf('function nowISO'));
 const ctx=vm.createContext({URL,GRADES:['7'],RESOURCE_TYPES:['PDF']});vm.runInContext(util,ctx);
 const valid={resources:[{id:'test',name:'<img src=x onerror=alert(1)>',tags:[],link:'https://example.org',resourceType:'PDF',grade:'7'}],topics:[]};
 assert.equal(ctx.validateImport(valid),valid);
 for(const link of ['javascript:alert(1)','data:text/html,test','file:///etc/passwd','https://user:pass@example.org']){assert.equal(ctx.safeResourceUrl(link),null);assert.throws(()=>ctx.validateImport({resources:[{...valid.resources[0],link}],topics:[]}));}
 for(const patch of [{id:'" onmouseover="alert(1)'},{tags:[{}]},{grade:'<img>'},{resourceType:'__proto__'},{name:{}},{description:[]}])assert.throws(()=>ctx.validateImport({resources:[{...valid.resources[0],...patch}],topics:[]}));
 assert.throws(()=>ctx.validateImport(JSON.parse('{"resources":[{"id":"x","name":"x","__proto__":{}}],"topics":[]}')));
 assert.match(html,/function seedResources\(\)\{ return \[\]; \}/);assert.match(html,/function seedTopics\(\)\{ return \[\]; \}/);
 for(const key of ['teacherHub.resources','teacherHub.topics','teacherHub.settings'])assert.ok(html.includes(key));
 assert.ok(!html.includes('onedrive.live.com/')); // no source example records or protected URLs
 assert.match(html,/connect-src 'none'/);assert.match(html,/Те ще заменят текущата база/);
});
