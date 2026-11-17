import {LIMITS} from './model.mjs';
// Cheap FIT message framing bounds the record count before the full decoder allocates objects.
export function inspectFit(bytes){
 if(bytes.length<14)throw new Error('Непълен FIT header.');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),header=bytes[0];
 if(![12,14].includes(header)||String.fromCharCode(...bytes.subarray(8,12))!=='.FIT')throw new Error('Невалиден FIT header.');
 const end=header+view.getUint32(4,true);if(end+2!==bytes.length)throw new Error('Непълен FIT или данни след края му.');
 const definitions=new Map();let cursor=header,records=0;
 while(cursor<end){
  const code=bytes[cursor++],compressed=!!(code&128),local=compressed?(code>>5)&3:code&15;
  if(!compressed&&(code&64)){
   if(cursor+5>end)throw new Error('Непълна FIT дефиниция.');const arch=bytes[cursor+1];if(arch>1)throw new Error('Невалидна FIT архитектура.');const global=view.getUint16(cursor+2,arch===0),count=bytes[cursor+4];cursor+=5;if(cursor+count*3>end)throw new Error('Непълни FIT полета.');
   let size=0,timestampSize=0;for(let i=0;i<count;i++){const number=bytes[cursor],width=bytes[cursor+1];if(!width)throw new Error('Празно FIT поле.');size+=width;if(number===253)timestampSize=width;cursor+=3;}
   if(code&32){if(cursor>=end)throw new Error('Непълен developer header.');const count=bytes[cursor++];if(cursor+count*3>end)throw new Error('Непълни developer полета.');for(let i=0;i<count;i++){size+=bytes[cursor+1];cursor+=3;}}
   definitions.set(local,{global,size,timestampSize});
  }else{
   const definition=definitions.get(local);if(!definition)throw new Error('FIT запис без локална дефиниция.');const size=definition.size-(compressed?definition.timestampSize:0);if(size<0||cursor+size>end)throw new Error('Прекъснат FIT запис.');cursor+=size;
   if(definition.global===20&&++records>LIMITS.points)throw new Error('FIT надвишава 100 000 точки.');
  }
 }return {records};
}
