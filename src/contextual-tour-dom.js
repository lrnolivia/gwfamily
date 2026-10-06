import {tourTargetSelectors} from './contextual-tour-model.js';
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
