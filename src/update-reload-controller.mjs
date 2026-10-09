export const RELOAD_KEY = 'gw-auto-reloaded-build-v1';
export function isEditing(documentRef) {
 const active=documentRef?.activeElement;
 return !!active?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]');
}
export function mayAutoReload(s) {
 return Boolean(s.ready && s.visible && s.online && !s.pending && !s.drafts && s.storageSafe && !s.editing && !s.dialogOpen && s.idleMs>=8000);
}
export function createReloadController({read,reload,prepare=()=>true,storage,now=()=>Date.now()}) {
 let lastActivity=now(),attempted=null;
 const activity=()=>{lastActivity=now()};
 function run(manual=false) {
  const s=read();
  if(!s.ready || s.pending || !s.storageSafe || s.drafts)return false;
  if(!manual && !mayAutoReload({...s,idleMs:now()-lastActivity}))return false;
  if(attempted===s.ready)return false;
  if(!manual) {
   try { if(!storage || storage.getItem(RELOAD_KEY)===s.ready)return false; } catch { return false; }
  }
  if(prepare()===false)return false;
  if(!manual) { try { storage.setItem(RELOAD_KEY,s.ready); } catch { return false; } }
  attempted=s.ready;
  reload();return true;
 }
 return {activity,tick:()=>run(false),manual:()=>run(true)};
}
