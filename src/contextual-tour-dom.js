import {tourTargetSelectors,tourViewport} from './contextual-tour-model.js';
const rectValues=rect=>rect?[rect.left,rect.top,rect.right,rect.bottom]:[];
// Readiness belongs to one mounted step. Compare actual applied rectangles,
// viewport and content size across frames, including smooth scroll/reflow.
// A target being visible does not mean React has applied its coach placement.
export function createTourGeometryTracker(){
 let previous=null,stableFrames=0;
 return {sample(position,targetRect,coachRect,size,rawViewport){
  const viewport=tourViewport(rawViewport),snapshot=[!!targetRect,...rectValues(targetRect),...rectValues(coachRect),size.width,size.height,viewport.left,viewport.top,viewport.width,viewport.height];
  const stable=previous&&previous.length===snapshot.length&&snapshot.every((value,index)=>typeof value==='boolean'?value===previous[index]:Number.isFinite(value)&&Math.abs(value-previous[index])<=.25);
  stableFrames=stable?stableFrames+1:0;previous=snapshot;
  const coach=position.coach,right=viewport.left+viewport.width,bottom=viewport.top+viewport.height;
  const applied=coachRect&&Math.abs(coachRect.left-coach.left)<=1&&Math.abs(coachRect.top-coach.top)<=1&&Math.abs(coachRect.right-coachRect.left-coach.width)<=1&&coachRect.bottom-coachRect.top>0&&coachRect.bottom-coachRect.top<=coach.maxHeight+1;
  const fits=applied&&coachRect.left>=viewport.left&&coachRect.top>=viewport.top&&coachRect.right<=right+1&&coachRect.bottom<=bottom+1;
  const clear=!position.hole||(coachRect&&(coachRect.right<=position.hole.left||coachRect.left>=position.hole.right||coachRect.bottom<=position.hole.top||coachRect.top>=position.hole.bottom));
  return {ready:!!(stableFrames>=2&&fits&&clear),stableFrames};
 }};
}
export function findTourTarget(root,target){
 for(const selector of tourTargetSelectors(target))for(const node of root?.querySelectorAll(selector)||[]){
  if(node.isConnected===false||node.hidden||node.disabled||node.getClientRects?.().length===0)continue;
  const rect=node.getBoundingClientRect?.();if(rect?.width>0&&rect?.height>0)return node;
 }
 return null;
}
// Keep the coach and the real highlighted control available to keyboard and
// assistive technology. All temporary DOM attributes have exact rollback.
export function isolateTourBranches(root,coach,target){
 const changed=[];
 const visit=node=>{
  if(node===coach||node===target)return;
  if(node.contains?.(coach)||node.contains?.(target)){for(const child of node.children||[])visit(child);return}
  if(!node.setAttribute||['SCRIPT','STYLE','LINK'].includes(node.tagName))return;
  changed.push([node,node.hasAttribute('inert'),node.getAttribute('inert')]);node.setAttribute('inert','');
 };
 for(const node of root?.children||[])visit(node);
 return ()=>{for(const [node,existed,value] of changed){if(existed)node.setAttribute('inert',value??'');else node.removeAttribute('inert')}};
}
export function describeTourTarget(target,descriptionId){
 if(!target?.setAttribute)return ()=>{};
 const original=target.getAttribute('aria-describedby'),ids=new Set((original||'').split(/\s+/).filter(Boolean));ids.add(descriptionId);target.setAttribute('aria-describedby',[...ids].join(' '));
 return ()=>{if(original===null)target.removeAttribute('aria-describedby');else target.setAttribute('aria-describedby',original)};
}
export function tourFocusable(panel,target){
 const controls=Array.from(panel?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')||[]).filter(node=>!node.hidden&&node.getClientRects?.().length!==0);
 if(target&&!target.disabled&&target.isConnected!==false)controls.push(target);
 return controls;
}
export function cycleTourFocus(event,controls,current){
 if(event.key!=='Tab'||!controls.length)return false;
 const index=controls.indexOf(current),next=event.shiftKey?(index<=0?controls.length-1:index-1):(index<0||index===controls.length-1?0:index+1);
 event.preventDefault();controls[next]?.focus?.({preventScroll:true});return true;
}
