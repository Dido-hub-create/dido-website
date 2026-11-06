import test from 'node:test';import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,symlinkSync,rmSync} from 'node:fs';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';
test('album static routes exclude drafts and link optimized responsive photos', {timeout:90000},()=>{
 const source=process.cwd(),root=mkdtempSync(join(tmpdir(),'dido-gallery-build-'));
 try {for(const item of ['src','public','package.json','tsconfig.json','astro.config.mjs'])cpSync(join(source,item),join(root,item),{recursive:true});symlinkSync(join(source,'node_modules'),join(root,'node_modules'),'dir');
 const photo='/images/IMG-4a64148048c44ebcb450fa03afe7d8c7-V-1.jpg';
 mkdirSync(join(root,'src/content/albums'),{recursive:true});
 for(const status of ['published','draft'])writeFileSync(join(root,`src/content/albums/${status}.json`),JSON.stringify({title:status==='draft'?'HIDDEN_ALBUM':'Пътувания',status,photos:[photo,photo]}));
 execFileSync(process.execPath,[resolve('node_modules/astro/bin/astro.mjs'),'build'],{cwd:root,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'},stdio:'pipe'});
 const index=readFileSync(join(root,'dist/galeria/index.html'),'utf8'),album=readFileSync(join(root,'dist/galeria/published/index.html'),'utf8');
 assert.match(index,/Пътувания/);assert.doesNotMatch(index,/HIDDEN_ALBUM/);assert.equal(existsSync(join(root,'dist/galeria/draft')),false);assert.match(album,/data-gallery-photo/);
 for(const match of album.matchAll(/(?:src|href)="(\/gallery\/[^"]+)"/g))assert.ok(existsSync(join(root,'dist',match[1])),match[1]);assert.match(album,/srcset=/);assert.match(album,/loading="lazy"/);assert.match(album,/<dialog/);assert.doesNotMatch(album,/src="\/images\//);
 if(process.env.DIDO_GALLERY_FIXTURE){mkdirSync(process.env.DIDO_GALLERY_FIXTURE,{recursive:true});cpSync(join(root,'dist'),join(process.env.DIDO_GALLERY_FIXTURE,'dist'),{recursive:true});}
 }finally{rmSync(root,{recursive:true,force:true});}
});
