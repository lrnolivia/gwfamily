import {photoFramePayload} from './photo-framing-model.js';
export const PAGE_ELEMENT_TYPES=Object.freeze([['eyebrow','Eyebrow'],['heading','Heading'],['date','Date detail'],['button','Button'],['media','Media'],['text','Text area']]);
export const PAGE_ELEMENT_DESTINATIONS=Object.freeze(['home','reunion','family','you','memories','shop']);
export const MAX_PAGE_ELEMENTS=12;
export function validatePageElements(elements,cleanText){
 if(elements===undefined)return undefined;
 if(!Array.isArray(elements)||elements.length>MAX_PAGE_ELEMENTS)throw Error('Use up to 12 added elements per panel');
 const ids=new Set();return elements.map(element=>{
  if(!element||Object.keys(element).some(key=>!['id','kind','text','destination','media'].includes(key))||!/^element-[A-Za-z0-9_-]{1,80}$/.test(element.id)||ids.has(element.id)||!PAGE_ELEMENT_TYPES.some(([kind])=>kind===element.kind))throw Error('Choose distinct supported panel elements');ids.add(element.id);
  const result={id:element.id,kind:element.kind,text:cleanText(element.text,element.kind==='text'?1500:160,true)};
  if(element.kind==='button'){if(!PAGE_ELEMENT_DESTINATIONS.includes(element.destination))throw Error('Choose a family page for the button');result.destination=element.destination}else if(element.destination!==undefined)throw Error('Only buttons have a destination');
  if(element.kind==='media'){
   if(!Array.isArray(element.media)||element.media.length>1)throw Error('Choose one uploaded element image');
   result.media=element.media.map(file=>{if(!file||Object.keys(file).some(key=>!['id','alt','frame'].includes(key))||typeof file.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(file.id))throw Error('Choose an uploaded element image');return {id:file.id,alt:cleanText(file.alt||'',240),...photoFramePayload(file.frame)}});
  }else if(element.media!==undefined)throw Error('Only media elements have files');return result;
 });
}
export function elementSlots(panel){return (panel?.elements||[]).map(element=>({id:element.id,label:PAGE_ELEMENT_TYPES.find(([kind])=>kind===element.kind)?.[1]||'Element',role:element.kind==='media'?'image':element.kind==='button'?'action':'text',column:'left',align:element.kind==='media'||element.kind==='button'?'stretch':'start'}));}
export function elementPayload(element){return {...element,...(element.media?{media:element.media.map(({id,alt='',frame})=>({id,alt,...photoFramePayload(frame)}))}:{})};}
