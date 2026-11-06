import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import sharp from 'sharp';import {loadAlbums,albumImage} from '../src/lib/albums.mjs';
test('albums publish safely, preserve ordering and originals, optimize images and hide drafts',async()=>{
 const root=mkdtempSync(join(tmpdir(),'dido-albums-'));
 try {
 mkdirSync(join(root,'src/content/albums'),{recursive:true});mkdirSync(join(root,'public/images'),{recursive:true});
 const original=await sharp({create:{width:2400,height:1600,channels:3,background:'#ff8800'}}).jpeg().toBuffer();
 writeFileSync(join(root,'public/images/photo.jpg'),original);writeFileSync(join(root,'public/images/bad.jpg'),'invalid');
 const write=(id,data)=>writeFileSync(join(root,'src/content/albums',id+'.json'),JSON.stringify(data));
 write('public',{title:'Природа',status:'published',photos:['/images/photo.jpg','/images/bad.jpg','/images/missing.jpg','https://example.com/a.jpg']});
 write('draft',{title:'HIDDEN',status:'draft',photos:['/images/photo.jpg']});write('invalid',{title:'Invalid',status:'published',photos:'wrong'});
 let albums=await loadAlbums(root);assert.equal(albums.length,1);assert.equal(albums[0].photos.length,1);assert.equal(albums[0].date,undefined);assert.equal(albums[0].description,'');assert.deepEqual(albums[0].cover,albums[0].photos[0]);
 const small=await sharp(join(root,'dist',albums[0].photos[0].small)).metadata();assert.equal(small.width,400);assert.equal(small.height,267);assert.deepEqual(readFileSync(join(root,'public/images/photo.jpg')),original);
 write('draft',{title:'Published now',status:'published',photos:[]});assert.equal((await loadAlbums(root)).length,2);
 write('public',{title:'Hidden now',status:'draft',photos:[]});assert.equal((await loadAlbums(root)).length,1);
 symlinkSync(join(root,'public/images/photo.jpg'),join(root,'public/images/link.jpg'));assert.equal(await albumImage('/images/link.jpg',root),undefined);assert.equal(await albumImage('/images/../photo.jpg',root),undefined);
 }finally{rmSync(root,{recursive:true,force:true});}
});
