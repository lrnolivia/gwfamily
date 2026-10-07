import api from './worker.mjs';
import {coreAssetResponse} from './core-assets.mjs';
export default {
 async fetch(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/')||path==='/health')return api.fetch(request,env,ctx);
  const core=await coreAssetResponse(request);if(core)return core;
  const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
  headers.set('Cache-Control','no-store, max-age=0');headers.set('X-Content-Type-Options','nosniff');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 },
 scheduled(controller,env,ctx){return api.scheduled(controller,env,ctx)}
};
