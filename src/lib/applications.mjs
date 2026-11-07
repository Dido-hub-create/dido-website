import categories from '../data/app-categories.json' with {type:'json'};
import extra from '../data/applications.json' with {type:'json'};
import cabinet from '../data/cabinet.json' with {type:'json'};
import {existsSync,realpathSync,statSync} from 'node:fs';
import {resolve,relative} from 'node:path';
export {categories as appCategories};
// Only actual, local files/pages can become public actions. No arbitrary schemes or traversal.
export function applicationUrl(value,root=process.cwd(),download=false){
 if(typeof value!=='string'||!/^\/(?!\/)[\p{L}\p{N}_ /.-]+$/u.test(value))return undefined;
 let path;try{path=decodeURIComponent(value);}catch{return undefined;}
 if(path.split('/').some(p=>p==='.'||p==='..')||path.includes('\\'))return undefined;
 const base=resolve(root,'public'),file=resolve(base,'.'+path);
 const confined=(dir,file)=>{try{return existsSync(file)&&statSync(file).isFile()&&!relative(dir,realpathSync(file)).startsWith('..');}catch{return false;}};
 if(confined(base,file))return path;
 if(download)return undefined;
 const pages=resolve(root,'src/pages'),page=resolve(pages,'.'+path,'index.astro');
 return confined(pages,page)?path:undefined;
}
export function publishedApplications(root=process.cwd(),additional=extra.apps){
 const records=[{id:'teacher-cabinet',category:'digitalni-kabineti',...cabinet,status:'published',online:'/tehnologii/digitalen-kabinet/',download:'/downloads/digitalen-kabinet.html'},...(Array.isArray(additional)?additional:[])];
 const ids=new Set();return records.flatMap(record=>{
  if(!record||record.status!=='published'||!categories.some(c=>c.slug===record.category)||typeof record.id!=='string'||!/^[a-z0-9-]+$/.test(record.id)||ids.has(record.id)||typeof record.title!=='string'||!record.title.trim()||typeof record.description!=='string'||!record.description.trim())return [];
  ids.add(record.id);
  const online=applicationUrl(record.online,root),download=applicationUrl(record.download,root,true);
  if(!online&&!download)return [];
  const image=applicationUrl(record.image,root,true);
  return [{id:record.id,category:record.category,title:record.title.trim(),description:record.description.trim(),image,online,download}];
 });
}
export function applicationCategories(root=process.cwd()){
 const apps=publishedApplications(root);return categories.map(c=>({...c,href:`/prilozheniya/${c.slug}/`,apps:apps.filter(a=>a.category===c.slug)}));
}
