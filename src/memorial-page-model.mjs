import {isMemberView,isPreviewLeader} from './member-view-model.js';
export function memorialYears(person){
 const year=value=>/^\d{4}$/.test(String(value||''))?String(value):'';
 const born=year(person.birthYear),died=year(person.deathYear);
 return born&&died?`${born} – ${died}`:born?`Born ${born}`:died?`Remembered · ${died}`:'';
}
export function memorialClaims(state,id){return (state.households||[]).filter(h=>(h.heritage||[]).some(e=>e.personKind==='ancestor'&&e.personId===id));}
export function memorialMemories(state,person){
 const ids=new Set([person.id,person.sourceMemberId].filter(Boolean));
 return (state.memories||[]).filter(m=>!m.deletedAt&&!m.deleted_at&&((m.memberIds||[]).some(id=>ids.has(id))||(m.ancestorIds||[]).includes(person.id)));
}
export function mayEditMemorial(state,person){
 return !isMemberView(state)&&!!((state.memorialAccess?.canCreate||isPreviewLeader(state)||(state.mode==='preview'&&memorialClaims(state,person.id).some(h=>h.headIds?.includes(state.selfId))))&&(isPreviewLeader(state)||person.canEdit||person.createdBy===state.selfId||memorialClaims(state,person.id).some(h=>h.canManage)));
}
