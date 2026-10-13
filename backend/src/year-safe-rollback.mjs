// Recovery entry only. The normal site-worker remains the configured entry.
// Retain the migration-aware API while serving the separately preserved prior UI.
import site from './site-worker.mjs';
export function yearSafeRollback(runtime=site){return {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')){
   const signOut=url.pathname==='/api/auth/sign-out'&&request.method==='POST';
   if((!['GET','HEAD','OPTIONS'].includes(request.method)&&!signOut)||(url.pathname.startsWith('/api/auth/')&&!signOut))return Response.json({error:'Family changes are paused during recovery. Please try again later.'},{status:503,headers:{'Cache-Control':'no-store'}});
   // Earlier clients omit the year. Always show the legacy reunion during
   // recovery, even if a newer year is active or explicitly requested.
   url.searchParams.set('reunionId','legacy');
   request=new Request(url,request);
  }
  return runtime.fetch(request,{...env,FAMILY_INVITATIONS_ENABLED:'false',LAUNCH_PROVISIONAL_READ_ENABLED:'false'},ctx);
 },
 scheduled(){/* Recovery freezes scheduled mutations and delivery. */}
}}
export default yearSafeRollback();
