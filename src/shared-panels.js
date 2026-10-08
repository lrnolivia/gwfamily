import {validatePageElements,elementPayload} from './page-elements-model.js';
import {cardSlots,cardLayoutOf} from './card-content-layout-model.js';
import {photoFramePayload} from './photo-framing-model.js';
// Shared presentation only. Native slots contain allowlisted layout identities,
// never operational/private records, component names, member IDs or URLs.
export const PANEL_LIMITS=Object.freeze({maxPanels:48,maxCustomPanels:23,maxTitle:160,maxBody:1500});
export const PANEL_PRESETS=Object.freeze([
 {id:'text',label:'Text',description:'A heading and one clear message'},
 {id:'columns',label:'Two columns',description:'Two pieces of copy, side by side'},
 {id:'photo',label:'Photo above',description:'One photo above your message'},
 {id:'feature',label:'Photo beside',description:'One photo alongside your message'}
]);
export const PANEL_PAGES=Object.freeze(['home','reunion','reunion-plans','reunion-calendar','family','people','memories','tree','birthdays','shop','inbox','you','leader-calendar']);
export const HERO_FIELDS=Object.freeze({home:['heroEyebrow','heroTitle','heroBodyFallback'],reunion:['heroEyebrow','heroTitle','dateFallback','locationFallback','pricingNote'],memories:['heroEyebrow','heroTitle','heroBody'],tree:['heroTitle','heroBody']});
const clone=value=>JSON.parse(JSON.stringify(value));
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function keys(value,allowed){if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw Error('Unsupported panel fields');}
// Source-owned slots render their existing authorized components. Saved content
// can reorder these identities; it cannot replace their data or permissions.
export const NATIVE_PANEL_DEFINITIONS=Object.freeze({
 'leader-calendar':[['calendar-events','Reunion events','main',[]],['calendar-settings','Calendar settings','side',[]]],
 home:[['feed','Family feed','main',['feedTitle']],['reunion','Your reunion','side',['reunionTitle','nextRsvpTitle','nextRsvpBody','nextShirtsTitle','nextShirtsBody','nextFeesTitle','nextFeesBody']]],
 'reunion-plans':[['rsvp','RSVP','main',['rsvpTitle']],['merchandise','Merchandise','main',['merchandiseTitle']],['fees','Reunion fees','main',['feesTitle']],['checklist','Your reunion','side',['checklistTitle']],['history','Saved records','side',[]]],
 'reunion-calendar':[['events','Reunion events','main',[]],['birthdays','Family birthdays','side',[]]],
 reunion:[['plans','Your reunion','main',['plansTitle']],['schedule','Reunion schedule','side',['weekendTitle','weekendEmptyTitle','weekendEmptyBody']],['clarity','A little clarity','side',['clarityTitle','clarityBody']]],
 people:[['directory','Our people','main',['peopleTitle','noResults']],['profiles','Your family profiles','side',['profilesTitle']],['contact','Address book','side',['heading','intro','sharingNote','emptyTitle','emptyBody']],['shared-contacts','Shared contact cards','main',['sharedTitle','sharedEmptyBody']]],
 memories:[['gallery','Shared memories','main',['listTitle','emptyBody']]],
 tree:[['founders','Family founders','side',[]],['memorials','Held in our hearts','main',['memorialsTitle']],['connections','Family connections','side',['connectionsTitle','connectionsBody']]],
 birthdays:[['calendar','Family birthdays','main',['monthTitle','emptyBody','privacyNote']]],
 shop:[['products','Merchandise','main',['heading','emptyBody']],['order','Your order','side',[]]],
 inbox:[['invitations','Conversation invitations','side',['invitationsTitle']],['conversations','Conversations','main',['emptyTitle','emptyBody','caughtUpTitle','caughtUpBody']]],
 you:[['profile','Your profile','side',[]],['family','Your family','main',[]],['plans','Reunion plans','main',[]],['preferences','Preferences','main',[]],['help','Help','main',[]],['leader-tools','Leader tools','side',['toolsTitle']]]
});
export const nativePanelDefinition=(page,id)=>(NATIVE_PANEL_DEFINITIONS[page]||[]).find(([key])=>'native-'+key===id);
export function sharedPanelTitle(page,panel,content,records={}){
 if(panel.kind==='hero')return content?.text?.heroTitle||'Page photo or video';
 if(panel.kind!=='native')return panel.title||'Untitled panel';
 const sharedHeading=page==='reunion-calendar'&&panel.id==='native-birthdays'?records.birthdays:page==='reunion'&&panel.id==='native-plans'?records.home:null;
 if(sharedHeading){const value=(sharedHeading.draft||sharedHeading.content)?.text?.[page==='reunion'?'reunionTitle':'monthTitle'];if(typeof value==='string'&&value.trim())return value;}
 const definition=nativePanelDefinition(page,panel.id),field=definition?.[3]?.find(key=>/Title$|^heading$|^monthTitle$/.test(key)),heading=field&&content?.text?.[field];
 return typeof heading==='string'&&heading.trim()?heading:definition?.[1]||'Page panel';
}
export const REUNION_PANEL_PAGES=Object.freeze(['reunion','reunion-plans','reunion-calendar']);
export function activePanelPage(page,tab){
 return page==='family'?(tab||'people'):page==='reunion'?tab==='plans'?'reunion-plans':tab==='weekend'?'reunion-calendar':'reunion':page;
}
const nativeDefaults=page=>(NATIVE_PANEL_DEFINITIONS[page]||[]).map(([id,,zone])=>({id:'native-'+id,kind:'native',zone,locked:false,removed:false}));
export function defaultPanelLayout(page){const panels=PANEL_PAGES.includes(page)?[{id:'hero',kind:'hero',zone:'main',locked:true,removed:false},...nativeDefaults(page)]:[];return {version:2,panels,desktopOrder:panels.map(p=>p.id),mobileOrder:panels.map(p=>p.id)};}
export function migratePanelLayout(page,layout){
 if(!layout)return defaultPanelLayout(page);
 if(layout.version!==1)return layout;
 const missing=nativeDefaults(page).filter(panel=>!layout.panels.some(p=>p.id===panel.id&&p.kind==='native'));
 const append=key=>{const order=[...layout[key]];for(const panel of missing){if(page==='reunion'&&panel.id==='native-plans'){const hero=order.indexOf('hero');order.splice(hero<0?order.length:hero+1,0,panel.id);}else order.push(panel.id);}return order;};
 return {...layout,version:2,panels:[...layout.panels,...missing],desktopOrder:append('desktopOrder'),mobileOrder:append('mobileOrder')};
}
export function panelLayoutOf(content,page){return migratePanelLayout(page,content.panelLayout);}
export function panelPayload(layout){return {...layout,panels:layout.panels.map(panel=>({...panel,...(panel.media?{media:panel.media.map(({id,alt='',frame})=>({id,alt,...photoFramePayload(frame)}))}:{}),...(panel.elements?{elements:panel.elements.map(elementPayload)}:{})}))};}
export function validatePanelLayout(page,value,cleanText){
 if(value===undefined)return defaultPanelLayout(page);
 keys(value,['version','panels','desktopOrder','mobileOrder']);
 if(![1,2].includes(value.version)||!Array.isArray(value.panels)||value.panels.length>PANEL_LIMITS.maxPanels)throw Error('Use a supported panel layout within the panel limit');
 if(!PANEL_PAGES.includes(page)&&value.panels.length)throw Error('Panels are only available on shared family pages');
 const ids=new Set();
 const panels=value.panels.map(panel=>{
  keys(panel,panel.kind!=='content'?['id','kind','zone','locked','removed','fullWidth','hero','elements']:['id','kind','zone','locked','removed','fullWidth','hero','layout','title','body','secondary','media','elements']);
  if(typeof panel.id!=='string'||!/^(?:hero|native-[a-z-]{1,40}|panel-[A-Za-z0-9_-]{1,80})$/.test(panel.id)||ids.has(panel.id))throw Error('Use distinct shared panel IDs');ids.add(panel.id);
  if(!['main','side'].includes(panel.zone)||typeof panel.locked!=='boolean'||typeof panel.removed!=='boolean')throw Error('Use a valid panel location and lock state');
  const elements=validatePageElements(panel.elements,cleanText),base={id:panel.id,kind:panel.kind,zone:panel.zone,locked:panel.locked,removed:panel.removed,...(elements?{elements}:{})};if(panel.kind==='native'&&elements?.length)throw Error('Add content elements to a hero or custom content panel');
  for(const flag of ['fullWidth','hero'])if(panel[flag]!==undefined){if(typeof panel[flag]!=='boolean')throw Error('Use a valid panel '+flag+' setting');base[flag]=panel[flag];}
  if(panel.kind==='native'){if(!nativePanelDefinition(page,panel.id))throw Error('Choose a built-in panel from this page');return base;}
  if(panel.kind==='hero'){if(panel.id!=='hero')throw Error('The primary hero has a fixed identity');return base;}
  if(panel.kind!=='content'||!panel.id.startsWith('panel-')||!PANEL_PRESETS.some(p=>p.id===panel.layout))throw Error('Choose a premade shared panel layout');
  if(!Array.isArray(panel.media)||panel.media.length>1||!['photo','feature'].includes(panel.layout)&&panel.media.length)throw Error('This layout accepts at most one photo');
  return {...base,layout:panel.layout,title:cleanText(panel.title,PANEL_LIMITS.maxTitle),body:cleanText(panel.body,PANEL_LIMITS.maxBody,true),secondary:cleanText(panel.secondary,PANEL_LIMITS.maxBody,true),media:panel.media.map(file=>{keys(file,['id','alt','frame']);if(typeof file.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(file.id))throw Error('Choose an uploaded panel photo');return {id:file.id,alt:cleanText(file.alt??'',240),...photoFramePayload(file.frame)};})};
 });
 if(PANEL_PAGES.includes(page)&&!panels.some(p=>p.id==='hero'))throw Error('Keep the primary hero record; remove it recoverably instead');
 if(panels.filter(isHeroPanel).length>1)throw Error('Choose at most one hero per page');
 const visible=panels.filter(p=>!p.removed).map(p=>p.id);
 const order=name=>{const list=value[name];if(!Array.isArray(list)||list.length!==visible.length||new Set(list).size!==list.length||list.some(id=>!visible.includes(id)))throw Error('Include every visible panel once in each order');return [...list];};
 if(panels.filter(p=>p.kind==='content').length>PANEL_LIMITS.maxCustomPanels)throw Error('Use up to 23 custom panels, including removed panels');
 const layout=migratePanelLayout(page,{version:value.version,panels,desktopOrder:order('desktopOrder'),mobileOrder:order('mobileOrder')});
 if(nativeDefaults(page).some(panel=>!layout.panels.some(p=>p.id===panel.id&&p.kind==='native')))throw Error('Keep built-in panels recoverable; remove them instead');
 return layout;
}
export function sharedPageMedia(content,{includeRemoved=false}={}){
 const layout=content.panelLayout,hero=layout?.panels.find(p=>p.id==='hero');
 return [...(!hero?.removed||includeRemoved?content.hero.media.map(file=>({...file,mediaMode:content.hero.mode})):[]),...(layout?.panels||[]).filter(p=>p.kind==='content'&&(!p.removed||includeRemoved)).flatMap(p=>p.media.map(file=>({...file,mediaMode:'image'}))),...(layout?.panels||[]).filter(p=>!p.removed||includeRemoved).flatMap(p=>(p.elements||[]).flatMap(element=>(element.media||[]).map(file=>({...file,mediaMode:'image'}))))];
}
export function validatePanelTransition(page,before,after){
 const previous=panelLayoutOf(before,page),next=panelLayoutOf(after,page);
 for(const panel of previous.panels){
  const replacement=next.panels.find(p=>p.id===panel.id);
  if(!replacement)throw Error('Keep removed panels recoverable; use Remove panel');
  if(panel.locked&&replacement.locked&&JSON.stringify(panel)!==JSON.stringify(replacement))throw Error('Unlock the panel before changing it');
  if(panel.locked&&replacement.locked&&cardSlots(page,panel).length&&JSON.stringify(cardLayoutOf(before,page,panel))!==JSON.stringify(cardLayoutOf(after,page,replacement)))throw Error('Unlock the panel before arranging its content');
  if(panel.locked&&replacement.locked&&!panel.removed){
   for(const key of ['desktopOrder','mobileOrder']){
    const peers=previous.panels.filter(other=>other.id!==panel.id&&!other.removed&&next.panels.some(p=>p.id===other.id&&!p.removed)&&(key==='mobileOrder'||panel.fullWidth||other.fullWidth||other.zone===panel.zone&&next.panels.find(p=>p.id===other.id)?.zone===panel.zone));
    if(peers.some(other=>(previous[key].indexOf(other.id)<previous[key].indexOf(panel.id))!==(next[key].indexOf(other.id)<next[key].indexOf(panel.id))))throw Error('Unlock the panel before moving another panel across it');
   }
  }
  if(panel.kind==='native'&&panel.locked&&replacement.locked&&(nativePanelDefinition(page,panel.id)?.[3]||[]).some(field=>before.text[field]!==after.text[field]||before.bodyFormats?.[field]!==after.bodyFormats?.[field]))throw Error('Unlock the panel before changing its text');
  if(panel.id==='hero'&&panel.locked&&replacement.locked){
   if(JSON.stringify(before.hero)!==JSON.stringify(after.hero)||(HERO_FIELDS[page]||[]).some(field=>before.text[field]!==after.text[field]||before.bodyFormats?.[field]!==after.bodyFormats?.[field]))throw Error('Unlock the primary hero before changing it');
  }
 }
}
export function createSharedPanel(id,zone,layout){
 if(!/^panel-[A-Za-z0-9_-]{1,80}$/.test(id)||!['main','side'].includes(zone)||!PANEL_PRESETS.some(p=>p.id===layout))throw Error('Choose a supported panel');
 return {id,kind:'content',zone,layout,locked:false,removed:false,title:'New panel',body:'',secondary:'',media:[]};
}
export function addSharedPanel(layout,panel){
 if(layout.panels.length>=PANEL_LIMITS.maxPanels||layout.panels.filter(p=>p.kind==='content').length>=PANEL_LIMITS.maxCustomPanels||layout.panels.some(p=>p.id===panel.id))throw Error('This page has reached its panel limit. Restore an earlier version or reuse a panel.');
 return {...layout,panels:[...layout.panels,panel],desktopOrder:[...layout.desktopOrder,panel.id],mobileOrder:[...layout.mobileOrder,panel.id]};
}
export function changeSharedPanel(layout,id,change){const before=layout.panels.find(p=>p.id===id);if(!before||before.locked&&Object.keys(change).some(key=>key!=='locked'))return layout;return {...layout,panels:layout.panels.map(p=>p.id===id?{...p,...change}:p)};}
// A presentation role never changes a source-owned panel's identity, content,
// permissions or operational data. Width and hero prominence are independent.
export const isHeroPanel=panel=>!panel.removed&&(panel.hero??panel.kind==='hero');
export function setSharedPanelHero(layout,id,hero=true){
 const panel=layout.panels.find(p=>p.id===id);if(!panel||panel.removed||panel.locked)return layout;
 const previous=layout.panels.find(p=>p.id!==id&&isHeroPanel(p));if(hero&&previous?.locked)return layout;
 const next={...layout,panels:layout.panels.map(p=>p.id===id?{...p,hero}:hero&&isHeroPanel(p)?{...p,hero:false}:p)};
 return lockedOrderValid(layout,next)?next:layout;
}
export function panelLayoutBands(panels){
 const bands=[];let columns=[];
 for(const panel of panels){if(panel.fullWidth){if(columns.length)bands.push({columns});bands.push({full:panel});columns=[]}else columns.push(panel)}
 if(columns.length)bands.push({columns});return bands;
}
export function removeSharedPanel(layout,id){const panel=layout.panels.find(p=>p.id===id);if(!panel||panel.locked)return layout;return {...changeSharedPanel(layout,id,{removed:true}),desktopOrder:layout.desktopOrder.filter(key=>key!==id),mobileOrder:layout.mobileOrder.filter(key=>key!==id)};}
export function restoreSharedPanel(layout,id,placement){const panel=layout.panels.find(p=>p.id===id);if(!panel?.removed)return layout;const insert=(key,index)=>{const order=layout[key].filter(key=>key!==id);order.splice(Number.isInteger(index)?Math.min(Math.max(index,0),order.length):order.length,0,id);return order;};return {...layout,panels:layout.panels.map(p=>p.id===id?{...p,removed:false,...((p.hero??p.kind==='hero')&&layout.panels.some(isHeroPanel)?{hero:false}:{})}:p),desktopOrder:insert('desktopOrder',placement?.desktop),mobileOrder:insert('mobileOrder',placement?.mobile)};}
export function moveSharedPanel(layout,id,{zone,beforeId=null,mobile=false}={}){
 const panel=layout.panels.find(p=>p.id===id);if(!panel||panel.locked||panel.removed||beforeId===id)return layout;
 const full=zone==='full';if(!mobile&&!full&&!['main','side'].includes(zone))return layout;
 if(beforeId!==null){const target=layout.panels.find(p=>p.id===beforeId&&!p.removed);if(!target||!mobile&&!full&&target.zone!==zone&&!target.fullWidth)return layout;}
 const key=mobile?'mobileOrder':'desktopOrder',order=layout[key].filter(key=>key!==id),at=beforeId===null?order.length:order.indexOf(beforeId);if(at<0)return layout;
 order.splice(at,0,id);const next={...layout,panels:mobile?layout.panels:layout.panels.map(p=>p.id===id?{...p,zone:full?p.zone:zone,...(full||p.fullWidth?{fullWidth:full}:{})}:p),[key]:order};return lockedOrderValid(layout,next)?next:layout;
}
export function stepSharedPanel(layout,id,direction,mobile=false){const panel=layout.panels.find(p=>p.id===id),key=mobile?'mobileOrder':'desktopOrder',order=layout[key].filter(key=>mobile||layout.panels.find(p=>p.id===key)?.zone===panel?.zone),index=order.indexOf(id),nextIndex=index+direction;if(!panel||panel.locked||nextIndex<0||nextIndex>=order.length)return layout;const all=[...layout[key]],a=all.indexOf(id),b=all.indexOf(order[nextIndex]);[all[a],all[b]]=[all[b],all[a]];const next={...layout,[key]:all};return lockedOrderValid(layout,next)?next:layout;}
export function normalizePanelContent(page,content){return {...clone(content),bodyFormats:{...content.bodyFormats},cardLayouts:{...content.cardLayouts},panelLayout:panelLayoutOf(content,page)};}

function lockedOrderValid(before,after){try{validatePanelTransition('global',{text:{},hero:{mode:'default',media:[]},panelLayout:before},{text:{},hero:{mode:'default',media:[]},panelLayout:after});return true}catch{return false}}

export function canRelockPanel(page,before,after,id){const panel=after.panelLayout?.panels.find(p=>p.id===id);if(!panel||panel.locked)return true;const next={...after,panelLayout:{...after.panelLayout,panels:after.panelLayout.panels.map(p=>p.id===id?{...p,locked:true}:p)}};try{validatePanelTransition(page,before,next);return true}catch{return false}}

// The same move/lock validation serves pointer drops, buttons and keyboard.
export function keyboardSharedPanel(layout,id,key,mobile=false){
 if(key==='ArrowUp'||key==='ArrowDown')return stepSharedPanel(layout,id,key==='ArrowUp'?-1:1,mobile);
 if(!mobile&&(key==='ArrowLeft'||key==='ArrowRight'))return moveSharedPanel(layout,id,{zone:key==='ArrowLeft'?'main':'side'});
 return layout;
}
