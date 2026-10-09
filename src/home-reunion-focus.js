// Resize may reparent the source-owned Home panel. Restore only focus that
// belonged to it; never steal focus from a sheet, editor, or unrelated control.
export function focusHomeReunionPlan(root=document){
 const panel=root.querySelector('.react-home [data-panel-id="native-reunion"]');
 const target=panel?.querySelector('.home-reunion-plan, .planning-checklist button');
 target?.focus();
}
export function preserveHomeReunionFocus(){
 const active=document.activeElement;
 if(!active?.closest?.('.react-home [data-panel-id="native-reunion"]')||active.closest('dialog'))return;
 requestAnimationFrame(()=>{if(!active.isConnected||!active.getClientRects().length)focusHomeReunionPlan()});
}
