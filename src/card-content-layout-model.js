// Presentation identities only. Nodes, actions, URLs and data stay source-owned.
import {elementSlots,PAGE_ELEMENT_TYPES,MAX_PAGE_ELEMENTS} from './page-elements-model.js';
export const CARD_COLUMNS=Object.freeze(['left','right']);
export const CARD_ALIGNMENTS=Object.freeze(['start','center','end','stretch']);
const slot=(id,label,role,column='left',align='start')=>Object.freeze({id,label,role,column,align});
const media=slot('media','Photo or video','image','right','stretch');
export const HERO_CARD_SLOTS=Object.freeze({
 home:Object.freeze([slot('eyebrow','Eyebrow','text'),slot('title','Heading','text'),slot('body','Reunion date','text'),slot('action','Reunion details button','action','left','stretch'),media]),
 reunion:Object.freeze([slot('eyebrow','Eyebrow','text'),slot('title','Heading','text'),slot('date','Reunion date','text'),slot('location','Reunion location','text'),slot('note','Planning note','text'),slot('plans','Plans button','action'),slot('action','Edit details button','action'),media]),
 memories:Object.freeze([slot('eyebrow','Eyebrow','text'),slot('title','Heading','text'),slot('body','Introduction','text'),slot('action','Add memory button','action'),media]),
 tree:Object.freeze([slot('title','Heading','text'),slot('body','Introduction','text'),media])
});
const MEDIA_ONLY_PAGES=new Set(['reunion-plans','reunion-calendar','family','people','birthdays','shop','inbox','you']);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function keys(value,allowed){if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw Error('Unsupported card content layout fields');}
export function cardSlots(page,panel){
 const extra=elementSlots(panel);
 if(panel?.kind==='hero')return [...(HERO_CARD_SLOTS[page]||(MEDIA_ONLY_PAGES.has(page)?[slot('media','Photo or video','image','left','stretch')]:[])),...extra];
 if(panel?.kind!=='content')return [];
 return [...(panel.layout==='photo'?[slot('media','Photo','image','left','stretch')]:[]),slot('title','Panel heading','text'),slot('body','Body text','text'),...(panel.layout==='columns'?[slot('secondary','Second text','text','right')]:[]),...(panel.layout==='feature'?[media]:[]),...extra];
}
export function addCardElement(content,page,id,kind,elementId){
 const panel=content.panelLayout?.panels.find(panel=>panel.id===id);
 if(!panel||panel.locked||panel.removed||!['hero','content'].includes(panel.kind))return content;
 if(!PAGE_ELEMENT_TYPES.some(([value])=>value===kind)||!/^element-[A-Za-z0-9_-]{1,80}$/.test(elementId))throw Error('Choose a supported element');
 if((panel.elements||[]).length>=MAX_PAGE_ELEMENTS)throw Error('This panel has 12 added elements. Reuse an existing element.');
 const element={id:elementId,kind,text:kind==='text'?'Your text here':kind==='media'?'':PAGE_ELEMENT_TYPES.find(([value])=>value===kind)[1],...(kind==='button'?{destination:'reunion'}:{}),...(kind==='media'?{media:[]}:{} )};
 const before=cardLayoutOf(content,page,panel),definition=elementSlots({elements:[element]})[0];
 const next={...content,panelLayout:{...content.panelLayout,panels:content.panelLayout.panels.map(panel=>panel.id===id?{...panel,elements:[...(panel.elements||[]),element]}:panel)},cardLayouts:{...content.cardLayouts,[id]:{...before,left:[...before.left,{id:elementId,align:definition.align}]}}};
 validateCardLayouts(page,next.panelLayout,next.cardLayouts);return next;
}
export function defaultCardLayout(page,panel){const slots=cardSlots(page,panel);return {version:1,...Object.fromEntries(CARD_COLUMNS.map(column=>[column,slots.filter(slot=>slot.column===column).map(({id,align})=>({id,align}))]))};}
export function cardLayoutOf(content,page,panel){return content.cardLayouts?.[panel.id]||defaultCardLayout(page,panel);}
export function validateCardLayouts(page,panelLayout,value){
 if(value===undefined)return {};
 const panels=panelLayout.panels.filter(panel=>cardSlots(page,panel).length),allowed=panels.map(panel=>panel.id);
 keys(value,allowed);
 return Object.fromEntries(Object.entries(value).map(([id,layout])=>{
  keys(layout,['version','left','right','vertical']);
  if(layout.vertical!==undefined){keys(layout.vertical,CARD_COLUMNS);if(Object.values(layout.vertical).some(value=>!['top','center','bottom'].includes(value)))throw Error('Choose a supported column vertical alignment');}if(layout.version!==1)throw Error('Choose a supported card content layout');
  const slots=cardSlots(page,panels.find(panel=>panel.id===id)),seen=new Set();
  const columns=Object.fromEntries(CARD_COLUMNS.map(column=>{
   if(!Array.isArray(layout[column])||layout[column].length>slots.length)throw Error('Use valid card content columns');
   return [column,layout[column].map(item=>{
    keys(item,['id','align','width','vertical','aspect']);if(!slots.some(slot=>slot.id===item.id)||seen.has(item.id)||!CARD_ALIGNMENTS.includes(item.align))throw Error('Use each allowed card content item once with a supported alignment');
    const image=slots.find(slot=>slot.id===item.id)?.role==='image';if((item.width!==undefined||item.vertical!==undefined||item.aspect!==undefined)&&!image)throw Error('Only images have size and vertical alignment');if(item.width!==undefined&&(!Number.isInteger(item.width)||item.width<25||item.width>100))throw Error('Choose an image width from 25 to 100 percent');if(item.vertical!==undefined&&!['top','center','bottom'].includes(item.vertical))throw Error('Choose a supported vertical alignment');if(item.aspect!==undefined&&!['original','landscape','portrait','square'].includes(item.aspect))throw Error('Choose a supported image aspect ratio');seen.add(item.id);return {id:item.id,align:item.align,...(item.width!==undefined?{width:item.width}:{}),...(item.vertical!==undefined?{vertical:item.vertical}:{}),...(item.aspect!==undefined?{aspect:item.aspect}:{})};
   })];
  }));
  if(seen.size!==slots.length)throw Error('Keep every card content item in the layout');
  return [id,{version:1,...columns,...(layout.vertical?{vertical:{...layout.vertical}}:{})}];
 }));
}
export function cardLayoutsPayload(layouts={}){return Object.fromEntries(Object.entries(layouts).map(([id,layout])=>[id,{version:layout.version,...(layout.vertical?{vertical:{...layout.vertical}}:{}),...Object.fromEntries(CARD_COLUMNS.map(column=>[column,layout[column].map(item=>({...item}))]))}]));}
export function moveCardSlot(layout,id,{column,beforeId=null}={}){
 if(!CARD_COLUMNS.includes(column)||id===beforeId)return layout;
 const item=CARD_COLUMNS.flatMap(key=>layout[key]).find(item=>item.id===id);
 if(!item||beforeId!==null&&!layout[column].some(item=>item.id===beforeId))return layout;
 const next={...layout,left:layout.left.filter(item=>item.id!==id),right:layout.right.filter(item=>item.id!==id)};
 next[column].splice(beforeId===null?next[column].length:next[column].findIndex(item=>item.id===beforeId),0,{...item});
 return JSON.stringify(next)===JSON.stringify(layout)?layout:next;
}
export function stepCardSlot(layout,id,direction){
 if(![-1,1].includes(direction))return layout;
 const column=CARD_COLUMNS.find(key=>layout[key].some(item=>item.id===id));if(!column)return layout;
 const index=layout[column].findIndex(item=>item.id===id),target=index+direction;if(target<0||target>=layout[column].length)return layout;
 const list=[...layout[column]];[list[index],list[target]]=[list[target],list[index]];return {...layout,[column]:list};
}
export function alignCardSlot(layout,id,align){if(!CARD_ALIGNMENTS.includes(align))return layout;return {...layout,...Object.fromEntries(CARD_COLUMNS.map(column=>[column,layout[column].map(item=>item.id===id?{...item,align}:item)]))};}
export function sizeCardImage(layout,id,changes){return {...layout,...Object.fromEntries(CARD_COLUMNS.map(column=>[column,layout[column].map(item=>item.id===id?{...item,...changes}:item)]))};}
export function keyboardCardSlot(layout,id,key){if(key==='ArrowUp'||key==='ArrowDown')return stepCardSlot(layout,id,key==='ArrowUp'?-1:1);if(key==='ArrowLeft'||key==='ArrowRight')return moveCardSlot(layout,id,{column:key==='ArrowLeft'?'left':'right'});return layout;}
export function updateCardLayout(content,page,id,change){
 const panel=content.panelLayout?.panels.find(panel=>panel.id===id);if(!panel||panel.locked||panel.removed||!cardSlots(page,panel).length)return content;
 const before=cardLayoutOf(content,page,panel),next=typeof change==='function'?change(before):change;
 const cardLayouts={...content.cardLayouts};if(next===undefined)delete cardLayouts[id];else cardLayouts[id]=next;
 validateCardLayouts(page,content.panelLayout,cardLayouts);return {...content,cardLayouts};
}


// Vertical placement belongs to the whole column, including its text and actions.
// Older saved image-level alignment remains readable until explicitly changed.
export function cardColumnVertical(layout,column){return layout.vertical?.[column]||layout[column]?.find(item=>item.vertical)?.vertical||'center';}
export function alignCardColumn(layout,column,vertical){if(!CARD_COLUMNS.includes(column)||!['top','center','bottom'].includes(vertical))return layout;return {...layout,vertical:{...layout.vertical,[column]:vertical}};}

// Apply one image editor draft without moving the item to the end merely
// because its size, alignment or shape changed in the same column.
export function applyCardImageSettings(layout,id,settings){
 const column=CARD_COLUMNS.find(key=>layout[key].some(item=>item.id===id));
 if(!column||!CARD_COLUMNS.includes(settings.column))return layout;
 const placed=settings.column===column?layout:moveCardSlot(layout,id,{column:settings.column});
 return sizeCardImage(alignCardSlot(placed,id,settings.align),id,{...(settings.width?{width:settings.width}:{}),...(settings.aspect?{aspect:settings.aspect}:{})});
}
