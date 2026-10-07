// Presentation identities only. Nodes, actions, URLs and data stay source-owned.
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
 if(panel?.kind==='hero')return HERO_CARD_SLOTS[page]||(MEDIA_ONLY_PAGES.has(page)?[slot('media','Photo or video','image','left','stretch')]:[]);
 if(panel?.kind!=='content')return [];
 return [...(panel.layout==='photo'?[slot('media','Photo','image','left','stretch')]:[]),slot('title','Panel heading','text'),slot('body','Body text','text'),...(panel.layout==='columns'?[slot('secondary','Second text','text','right')]:[]),...(panel.layout==='feature'?[media]:[])];
}
export function defaultCardLayout(page,panel){const slots=cardSlots(page,panel);return {version:1,...Object.fromEntries(CARD_COLUMNS.map(column=>[column,slots.filter(slot=>slot.column===column).map(({id,align})=>({id,align}))]))};}
export function cardLayoutOf(content,page,panel){return content.cardLayouts?.[panel.id]||defaultCardLayout(page,panel);}
export function validateCardLayouts(page,panelLayout,value){
 if(value===undefined)return {};
 const panels=panelLayout.panels.filter(panel=>cardSlots(page,panel).length),allowed=panels.map(panel=>panel.id);
 keys(value,allowed);
 return Object.fromEntries(Object.entries(value).map(([id,layout])=>{
  keys(layout,['version','left','right']);if(layout.version!==1)throw Error('Choose a supported card content layout');
  const slots=cardSlots(page,panels.find(panel=>panel.id===id)),seen=new Set();
  const columns=Object.fromEntries(CARD_COLUMNS.map(column=>{
   if(!Array.isArray(layout[column])||layout[column].length>slots.length)throw Error('Use valid card content columns');
   return [column,layout[column].map(item=>{
    keys(item,['id','align','width','vertical','aspect']);if(!slots.some(slot=>slot.id===item.id)||seen.has(item.id)||!CARD_ALIGNMENTS.includes(item.align))throw Error('Use each allowed card content item once with a supported alignment');
    const image=slots.find(slot=>slot.id===item.id)?.role==='image';if((item.width!==undefined||item.vertical!==undefined||item.aspect!==undefined)&&!image)throw Error('Only images have size and vertical alignment');if(item.width!==undefined&&(!Number.isInteger(item.width)||item.width<25||item.width>100))throw Error('Choose an image width from 25 to 100 percent');if(item.vertical!==undefined&&!['top','center','bottom'].includes(item.vertical))throw Error('Choose a supported vertical alignment');if(item.aspect!==undefined&&!['original','landscape','portrait','square'].includes(item.aspect))throw Error('Choose a supported image aspect ratio');seen.add(item.id);return {id:item.id,align:item.align,...(item.width!==undefined?{width:item.width}:{}),...(item.vertical!==undefined?{vertical:item.vertical}:{}),...(item.aspect!==undefined?{aspect:item.aspect}:{})};
   })];
  }));
  if(seen.size!==slots.length)throw Error('Keep every card content item in the layout');
  return [id,{version:1,...columns}];
 }));
}
export function cardLayoutsPayload(layouts={}){return Object.fromEntries(Object.entries(layouts).map(([id,layout])=>[id,{version:layout.version,...Object.fromEntries(CARD_COLUMNS.map(column=>[column,layout[column].map(item=>({...item}))]))}]));}
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
