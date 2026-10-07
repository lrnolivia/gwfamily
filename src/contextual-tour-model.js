// The tour only identifies public controls. Never persist rendered content, names,
// conversation IDs, contact details, or a route to a private resource.
export const contextualTourVersion=1;
export const contextualTourSteps=Object.freeze([
 {id:'home',target:'nav-home',route:{type:'home'},title:'Catch up with family',body:'Choose Home to find the family feed. Open a post when you want to read its conversation, reply, or react.',instruction:'The highlighted Home button brings you back here.'},
 {id:'compose',target:'compose',route:{type:'home'},title:'Share an update',body:'The plus button opens a new family post. Write your update, choose any photos or poll, and review it before you send.',instruction:'Opening the composer doesn’t publish a post.'},
 {id:'messages',target:'messages',route:{type:'home'},title:'Find your private conversations',body:'Use Messages for direct chats, groups, and invitations. Choose who joins a new conversation before sending anything.',instruction:'This guide points to Messages without opening a conversation.',requires:'messages'},
 {id:'notifications',target:'notifications',route:{type:'home'},title:'Check your family updates',body:'The bell opens your activity. Notification choices live in You, where you can choose following, replies, and tags.',instruction:'Continuing the guide doesn’t mark updates read or change your choices.',requires:'notifications'},
 {id:'reunion',target:'nav-reunion',route:{type:'reunion'},title:'Get ready for the reunion',body:'Choose Reunion for the current details, plans, and calendar. Your RSVP, merchandise, and fees have their own pages in You.',instruction:'Review a form before saving. The guide won’t submit one.'},
 {id:'family',target:'family-people',route:{type:'family',tab:'people'},title:'Explore your family',body:'People lists family profiles. The other tabs bring together memories and the family tree.',instruction:'Select a tab when you want to explore. The guide doesn’t open private contact cards.'},
 {id:'you',target:'you-guide',route:{type:'you'},title:'Come back whenever you need',body:'You brings together your profile, household, plans, and preferences. Quick guide is here when you want to resume or replay these steps.',instruction:'Leader Tools appear only for accounts with the relevant access. This guide never opens them.'}
]);
const targets=Object.freeze({
 'nav-home':['[data-gw-tour="nav-home"]'],compose:['[data-gw-tour="compose"]'],
 messages:['[data-gw-tour="messages"]','.messages-entry'],notifications:['[data-gw-tour="notifications"]','.notification-entry'],
 'nav-reunion':['[data-gw-tour="nav-reunion"]'],'family-people':['[data-gw-tour="family-people"]'],
 'you-guide':['[data-gw-tour="you-guide"]']
});
export function tourTargetSelectors(target){return targets[target]||[]}
export function tourAccount(state={}){
 if(state.mode==='preview')return 'preview';
 if(state.mode==='live'&&typeof state.selfId==='string'&&state.selfId)return 'live:'+state.selfId;
 return null;
}
export function availableTourSteps({messages=true,notifications=true}={}){
 return contextualTourSteps.filter(step=>!step.requires||({messages,notifications})[step.requires]);
}
export function tourProgressKey(account){return account?`gw-contextual-tour:v${contextualTourVersion}:${encodeURIComponent(account)}`:null}
const validStep=id=>contextualTourSteps.some(step=>step.id===id);
const validStatus=status=>['started','paused','skipped','completed'].includes(status);
const emptyProgress=()=>({version:contextualTourVersion,step:'home',status:'new'});
export function readTourProgress(storage,account){
 const key=tourProgressKey(account);if(!key)return emptyProgress();
 try{const value=JSON.parse(storage?.getItem(key));if(value?.version===contextualTourVersion&&validStep(value.step)&&validStatus(value.status))return {version:contextualTourVersion,step:value.step,status:value.status}}catch{}
 return emptyProgress();
}
export function saveTourProgress(storage,account,value={}){
 const key=tourProgressKey(account);if(!key)return false;
 const next={version:contextualTourVersion,step:validStep(value.step)?value.step:'home',status:validStatus(value.status)?value.status:'started'};
 try{if(!storage?.setItem)return false;storage.setItem(key,JSON.stringify(next));return true}catch{return false}
}
export function resumeTourIndex(steps,progress,restart=false){
 if(restart||!progress||['new','completed'].includes(progress.status))return 0;
 return Math.max(0,steps.findIndex(step=>step.id===progress.step));
}
const clamp=(value,min,max)=>Math.max(min,Math.min(value,Math.max(min,max)));
const number=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
export function tourViewport(viewport={}){
 return {left:number(viewport.offsetLeft??viewport.left),top:number(viewport.offsetTop??viewport.top),width:Math.max(1,number(viewport.width,320)),height:Math.max(1,number(viewport.height,640))};
}
// Coordinates are in the layout viewport, matching getBoundingClientRect and
// fixed positioning. Respect visualViewport offsets when zoomed or the keyboard
// reduces the visible area. The coach is placed in a free region, not on top of
// the highlighted control; its copy scrolls when that region is short.
export function positionTour(targetRect,coachSize={},rawViewport={}){
 const viewport=tourViewport(rawViewport),margin=12,gap=16,pad=7;
 const left=viewport.left+Math.min(margin,viewport.width/4),top=viewport.top+Math.min(margin,viewport.height/4),right=viewport.left+viewport.width-(left-viewport.left),bottom=viewport.top+viewport.height-(top-viewport.top);
 const width=Math.min(Math.max(1,number(coachSize.width,356)),Math.max(1,right-left));
 const desiredHeight=Math.max(1,number(coachSize.height,300));
 if(!targetRect){const height=Math.min(desiredHeight,bottom-top);return {viewport,hole:null,coach:{left:left+(right-left-width)/2,top:top+(bottom-top-height)/2,width,maxHeight:height},arrow:null,placement:'center'}}
 const holeLeft=clamp(number(targetRect.left)-pad,viewport.left,viewport.left+viewport.width),holeTop=clamp(number(targetRect.top)-pad,viewport.top,viewport.top+viewport.height);
 const holeRight=clamp(number(targetRect.right,number(targetRect.left)+number(targetRect.width))+pad,holeLeft,viewport.left+viewport.width),holeBottom=clamp(number(targetRect.bottom,number(targetRect.top)+number(targetRect.height))+pad,holeTop,viewport.top+viewport.height);
 const hole={left:holeLeft,top:holeTop,right:holeRight,bottom:holeBottom,width:holeRight-holeLeft,height:holeBottom-holeTop};
 const cx=(hole.left+hole.right)/2,cy=(hole.top+hole.bottom)/2;
 const regions=[
  {side:'below',left,top:Math.max(top,hole.bottom+gap),right,bottom},
  {side:'above',left,top,right,bottom:Math.min(bottom,hole.top-gap)},
  {side:'right',left:Math.max(left,hole.right+gap),top,right,bottom},
  {side:'left',left,top,right:Math.min(right,hole.left-gap),bottom}
 ].map(region=>({...region,width:Math.max(0,region.right-region.left),height:Math.max(0,region.bottom-region.top)}));
 let region=regions.find(region=>region.width>=width&&region.height>=desiredHeight);
 if(!region)region=regions.filter(region=>region.width>=Math.min(width,240)).sort((a,b)=>Math.min(b.height,desiredHeight)-Math.min(a.height,desiredHeight))[0];
 if(!region)region=regions.sort((a,b)=>b.width*b.height-a.width*a.height)[0];
 if(region.width<180||region.height<140){return {...positionTour(null,coachSize,rawViewport),reason:'viewport-too-small'}}
 const panelWidth=Math.max(1,Math.min(width,region.width)),height=Math.max(1,Math.min(desiredHeight,region.height));
 const x=clamp(cx-panelWidth/2,region.left,region.right-panelWidth),y=['above','below'].includes(region.side)?(region.side==='above'?region.bottom-height:region.top):clamp(cy-height/2,region.top,region.bottom-height);
 const coach={left:x,top:y,width:panelWidth,maxHeight:height};
 let start,end;
 if(region.side==='below'){start={x:clamp(cx,x+Math.min(20,panelWidth/2),x+panelWidth-Math.min(20,panelWidth/2)),y};end={x:cx,y:hole.bottom+3}}
 else if(region.side==='above'){start={x:clamp(cx,x+Math.min(20,panelWidth/2),x+panelWidth-Math.min(20,panelWidth/2)),y:y+height};end={x:cx,y:hole.top-3}}
 else if(region.side==='right'){start={x,y:clamp(cy,y+Math.min(20,height/2),y+height-Math.min(20,height/2))};end={x:hole.right+3,y:cy}}
 else{start={x:x+panelWidth,y:clamp(cy,y+Math.min(20,height/2),y+height-Math.min(20,height/2))};end={x:hole.left-3,y:cy}}
 return {viewport,hole,coach,arrow:{start,end},placement:region.side};
}
export function tourShadeRegions({viewport,hole}){
 const {left,top,width,height}=viewport,right=left+width,bottom=top+height;
 if(!hole)return [{left,top,width,height}];
 return [
  {left,top,width,height:Math.max(0,hole.top-top)},
  {left,top:hole.top,width:Math.max(0,hole.left-left),height:hole.height},
  {left:hole.right,top:hole.top,width:Math.max(0,right-hole.right),height:hole.height},
  {left,top:hole.bottom,width,height:Math.max(0,bottom-hole.bottom)}
 ];
}
