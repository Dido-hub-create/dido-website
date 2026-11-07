import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {applicationCategories,publishedApplications,applicationUrl} from '../src/lib/applications.mjs';
test('only categories with real published applications activate; drafts and missing/unsafe files never create actions',()=>{
 const root=mkdtempSync(join(tmpdir(),'dido-apps-'));
 try{mkdirSync(join(root,'public/apps'),{recursive:true});writeFileSync(join(root,'public/apps/real.html'),'<!doctype html><title>Test</title>');
 const app={id:'real',title:'Real',description:'A real test application',category:'fitnes-trakeri',status:'published',online:'/apps/real.html',download:'/apps/real.html'};
 assert.equal(publishedApplications(root,[app]).length,1);
 for(const change of [{status:'draft'},{description:''},{online:'/missing/',download:'/missing.html'},{category:'unknown'},{online:'javascript:alert(1)',download:'//evil/file.html'}])assert.equal(publishedApplications(root,[{...app,...change}]).length,0);
 for(const path of ['/../secret','/%2e%2e/secret','//example.com/file','https://example.com','/apps/../../secret'])assert.equal(applicationUrl(path,root),undefined);
 }finally{rmSync(root,{recursive:true,force:true});}
 const categories=applicationCategories();assert.equal(categories.length,5);assert.deepEqual(categories.filter(c=>c.apps.length).map(c=>c.slug),['digitalni-kabineti']);
});
