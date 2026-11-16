import {LIMITS} from './model.mjs';
export function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}return (crc^0xffffffff)>>>0;}
// Central directory preflight bounds allocations BEFORE the decompressor is invoked.
export function inspectZip(bytes){
 if(bytes.length>LIMITS.batchBytes||bytes.length<22)throw new Error('Невалиден или прекалено голям ZIP.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eocd=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){eocd=i;break;}
 if(eocd<0||view.getUint16(eocd+4,true)||view.getUint16(eocd+6,true))throw new Error('Липсва ZIP каталог; многотомни архиви не се поддържат.');
 const count=view.getUint16(eocd+10,true),size=view.getUint32(eocd+12,true),start=view.getUint32(eocd+16,true);
 if(count>LIMITS.files||count===65535||start+size>eocd)throw new Error('ZIP надвишава ограниченията или използва ZIP64.');
 let offset=start,total=0;const entries=[],names=new Set();
 for(let i=0;i<count;i++){
  if(offset+46>eocd||view.getUint32(offset,true)!==0x02014b50)throw new Error('Повреден ZIP каталог.');
  const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),packed=view.getUint32(offset+20,true),unpacked=view.getUint32(offset+24,true),n=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
  if(offset+46+n+extra+comment>eocd||local+30>start)throw new Error('Невалидни ZIP граници.');
  const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(offset+46,offset+46+n));
  if(flags&1||![0,8].includes(method)||name.includes('\\')||name.startsWith('/')||name.split('/').some(p=>p==='..'||p==='.')||/[\x00-\x1f]/.test(name)||names.has(name)||/\.zip$/i.test(name))throw new Error('ZIP съдържа криптиране, вложен архив, опасно име или неподдържана структура.');
  names.add(name);total+=unpacked;
  if(unpacked>LIMITS.fileBytes||total>LIMITS.expandedBytes||unpacked>Math.max(1024*1024,packed*200)||view.getUint32(local,true)!==0x04034b50)throw new Error('ZIP надвишава безопасния разархивиран размер.');
  const localName=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true),data=local+30+localName+localExtra;
  if(data+packed>start||new TextDecoder().decode(bytes.subarray(local+30,local+30+localName))!==name)throw new Error('ZIP локалният запис не съвпада с каталога.');
  entries.push({name,packed,unpacked,crc:view.getUint32(offset+16,true)});offset+=46+n+extra+comment;
 }
 if(offset!==start+size)throw new Error('ZIP каталогът е непоследователен.');return entries;
}
export async function expandZip(bytes){
 const entries=inspectZip(bytes),{unzipSync}=await import('fflate');
 let files;try{files=unzipSync(bytes,{filter:entry=>/\.(gpx|tcx|fit)$/i.test(entry.name)});}catch{throw new Error('ZIP не може да бъде разархивиран.');}
 return entries.filter(e=>/\.(gpx|tcx|fit)$/i.test(e.name)).map(e=>{const data=files[e.name];if(!data||data.length!==e.unpacked||crc32(data)!==e.crc)throw new Error('Непоследователен размер или CRC в ZIP.');return {name:e.name.split('/').at(-1),bytes:data};});
}
