// Page reads cannot outlive the document or signed-in account that owns them.
// This scope never owns writes; revisioned saves retain their existing rules.
export function pageReadLifecycle(){
 const controllers=new Set();let suspended=false;
 return {
  begin(){if(suspended)return null;const controller=new AbortController();controllers.add(controller);return controller},
  finish(controller){controllers.delete(controller)},
  cancel(){for(const controller of controllers)controller.abort();controllers.clear()},
  suspend(){suspended=true;this.cancel()},
  resume(){suspended=false},
  get suspended(){return suspended}
 };
}
