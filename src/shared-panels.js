// Shared presentation only. No component names, member IDs, URLs, HTML or scripts
// are accepted. Operational/private cards never enter this registry.
export const PANEL_LIMITS=Object.freeze({maxPanels:24,maxTitle:160,maxBody:1500});
export const PANEL_PRESETS=Object.freeze([
 {id:'text',label:'Text',description:'A heading and one clear message'},
 {id:'columns',label:'Two columns',description:'Two pieces of copy, side by side'},
 {id:'photo',label:'Photo above',description:'One photo above your message'},
 {id:'feature',label:'Photo beside',description:'One photo alongside your message'}
]);
export const PANEL_PAGES=Object.freeze(['home','reunion','family','people','memories','tree','birthdays','shop','inbox','you']);
export const HERO_FIELDS=Object.freeze({home:['heroEyebrow','heroTitle','heroBodyFallback'],reunion:['heroEyebrow','heroTitle','dateFallback','locationFallback','pricingNote'],memories:['heroEyebrow','heroTitle','heroBody'],tree:['heroTitle','heroBody']});
const clone=value=>JSON.parse(JSON.stringify(value));
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function keys(value,allowed){if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw Error('Unsupported panel fields');}
export function defaultPanelLayout(page){return {version:1,panels:PANEL_PAGES.includes(page)?[{id:'hero',kind:'hero',zone:'main',locked:true,removed:false}]:[],desktopOrder:PANEL_PAGES.includes(page)?['hero']:[],mobileOrder:PANEL_PAGES.includes(page)?['hero']:[]};}
export function panelLayoutOf(content,page){return content.panelLayout||defaultPanelLayout(page);}
export function panelPayload(layout){return {...layout,panels:layout.panels.map(panel=>panel.kind==='hero'?{...panel}:{...panel,media:panel.media.map(({id,alt=''})=>({id,alt}))})};}
export function validatePanelLayout(page,value,cleanText){
 if(value===undefined)return defaultPanelLayout(page);
 keys(value,['version','panels','desktopOrder','mobileOrder']);
 if(value.version!==1||!Array.isArray(value.panels)||value.panels.length>PANEL_LIMITS.maxPanels)throw Error('Use a supported panel layout with up to 24 panels, including removed panels');
 if(!PANEL_PAGES.includes(page)&&value.panels.length)throw Error('Panels are only available on shared family pages');
 const ids=new Set();
 const panels=value.panels.map(panel=>{
  keys(panel,panel.kind==='hero'?['id','kind','zone','locked','removed']:['id','kind','zone','locked','removed','layout','title','body','secondary','media']);
  if(typeof panel.id!=='string'||!/^(?:hero|panel-[A-Za-z0-9_-]{1,80})$/.test(panel.id)||ids.has(panel.id))throw Error('Use distinct shared panel IDs');ids.add(panel.id);
  if(!['main','side'].includes(panel.zone)||typeof panel.locked!=='boolean'||typeof panel.removed!=='boolean')throw Error('Use a valid panel location and lock state');
  const base={id:panel.id,kind:panel.kind,zone:panel.zone,locked:panel.locked,removed:panel.removed};
  if(panel.kind==='hero'){if(panel.id!=='hero')throw Error('The primary hero has a fixed identity');return base;}
  if(panel.kind!=='content'||panel.id==='hero'||!PANEL_PRESETS.some(p=>p.id===panel.layout))throw Error('Choose a premade shared panel layout');
  if(!Array.isArray(panel.media)||panel.media.length>1||!['photo','feature'].includes(panel.layout)&&panel.media.length)throw Error('This layout accepts at most one photo');
  return {...base,layout:panel.layout,title:cleanText(panel.title,PANEL_LIMITS.maxTitle),body:cleanText(panel.body,PANEL_LIMITS.maxBody,true),secondary:cleanText(panel.secondary,PANEL_LIMITS.maxBody,true),media:panel.media.map(file=>{keys(file,['id','alt']);if(typeof file.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(file.id))throw Error('Choose an uploaded panel photo');return {id:file.id,alt:cleanText(file.alt??'',240)};})};
 });
 if(PANEL_PAGES.includes(page)&&!panels.some(p=>p.id==='hero'))throw Error('Keep the primary hero record; remove it recoverably instead');
 const visible=panels.filter(p=>!p.removed).map(p=>p.id);
 const order=name=>{const list=value[name];if(!Array.isArray(list)||list.length!==visible.length||new Set(list).size!==list.length||list.some(id=>!visible.includes(id)))throw Error('Include every visible panel once in each order');return [...list];};
 return {version:1,panels,desktopOrder:order('desktopOrder'),mobileOrder:order('mobileOrder')};
}
export function sharedPageMedia(content,{includeRemoved=false}={}){
 const layout=content.panelLayout,hero=layout?.panels.find(p=>p.id==='hero');
 return [...(!hero?.removed||includeRemoved?content.hero.media.map(file=>({...file,mediaMode:content.hero.mode})):[]),...(layout?.panels||[]).filter(p=>p.kind==='content'&&(!p.removed||includeRemoved)).flatMap(p=>p.media.map(file=>({...file,mediaMode:'image'})))];
}
export function validatePanelTransition(page,before,after){
 const previous=panelLayoutOf(before,page),next=panelLayoutOf(after,page);
 for(const panel of previous.panels){
  const replacement=next.panels.find(p=>p.id===panel.id);
  if(!replacement)throw Error('Keep removed panels recoverable; use Remove panel');
  if(panel.locked&&replacement.locked&&JSON.stringify(panel)!==JSON.stringify(replacement))throw Error('Unlock the panel before changing it');
  if(panel.locked&&replacement.locked&&!panel.removed){
   for(const key of ['desktopOrder','mobileOrder']){
    const peers=previous.panels.filter(other=>other.id!==panel.id&&!other.removed&&next.panels.some(p=>p.id===other.id&&!p.removed)&&(key==='mobileOrder'||other.zone===panel.zone&&next.panels.find(p=>p.id===other.id)?.zone===panel.zone));
    if(peers.some(other=>(previous[key].indexOf(other.id)<previous[key].indexOf(panel.id))!==(next[key].indexOf(other.id)<next[key].indexOf(panel.id))))throw Error('Unlock the panel before moving another panel across it');
   }
  }
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
 if(layout.panels.length>=PANEL_LIMITS.maxPanels||layout.panels.some(p=>p.id===panel.id))throw Error('This page has reached its panel limit. Restore an earlier version or reuse a panel.');
 return {...layout,panels:[...layout.panels,panel],desktopOrder:[...layout.desktopOrder,panel.id],mobileOrder:[...layout.mobileOrder,panel.id]};
}
export function changeSharedPanel(layout,id,change){const before=layout.panels.find(p=>p.id===id);if(!before||before.locked&&Object.keys(change).some(key=>key!=='locked'))return layout;return {...layout,panels:layout.panels.map(p=>p.id===id?{...p,...change}:p)};}
export function removeSharedPanel(layout,id){const panel=layout.panels.find(p=>p.id===id);if(!panel||panel.locked)return layout;return {...changeSharedPanel(layout,id,{removed:true}),desktopOrder:layout.desktopOrder.filter(key=>key!==id),mobileOrder:layout.mobileOrder.filter(key=>key!==id)};}
export function restoreSharedPanel(layout,id,placement){const panel=layout.panels.find(p=>p.id===id);if(!panel?.removed)return layout;const insert=(key,index)=>{const order=layout[key].filter(key=>key!==id);order.splice(Number.isInteger(index)?Math.min(Math.max(index,0),order.length):order.length,0,id);return order;};return {...layout,panels:layout.panels.map(p=>p.id===id?{...p,removed:false}:p),desktopOrder:insert('desktopOrder',placement?.desktop),mobileOrder:insert('mobileOrder',placement?.mobile)};}
export function moveSharedPanel(layout,id,{zone,beforeId=null,mobile=false}={}){
 const panel=layout.panels.find(p=>p.id===id);if(!panel||panel.locked||panel.removed||beforeId===id)return layout;
 if(!mobile&&!['main','side'].includes(zone))return layout;
 const key=mobile?'mobileOrder':'desktopOrder',order=layout[key].filter(key=>key!==id),at=beforeId===null?order.length:order.indexOf(beforeId);if(at<0)return layout;
 order.splice(at,0,id);const next={...layout,panels:mobile?layout.panels:layout.panels.map(p=>p.id===id?{...p,zone}:p),[key]:order};return lockedOrderValid(layout,next)?next:layout;
}
export function stepSharedPanel(layout,id,direction,mobile=false){const panel=layout.panels.find(p=>p.id===id),key=mobile?'mobileOrder':'desktopOrder',order=layout[key].filter(key=>mobile||layout.panels.find(p=>p.id===key)?.zone===panel?.zone),index=order.indexOf(id),nextIndex=index+direction;if(!panel||panel.locked||nextIndex<0||nextIndex>=order.length)return layout;const all=[...layout[key]],a=all.indexOf(id),b=all.indexOf(order[nextIndex]);[all[a],all[b]]=[all[b],all[a]];const next={...layout,[key]:all};return lockedOrderValid(layout,next)?next:layout;}
export function normalizePanelContent(page,content){return {...clone(content),bodyFormats:{...content.bodyFormats},panelLayout:panelLayoutOf(content,page)};}

function lockedOrderValid(before,after){try{validatePanelTransition('global',{text:{},hero:{mode:'default',media:[]},panelLayout:before},{text:{},hero:{mode:'default',media:[]},panelLayout:after});return true}catch{return false}}

export function canRelockPanel(page,before,after,id){const panel=after.panelLayout?.panels.find(p=>p.id===id);if(!panel||panel.locked)return true;const next={...after,panelLayout:{...after.panelLayout,panels:after.panelLayout.panels.map(p=>p.id===id?{...p,locked:true}:p)}};try{validatePanelTransition(page,before,next);return true}catch{return false}}
