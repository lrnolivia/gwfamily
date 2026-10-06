import api from './worker.mjs';
export default {
 async fetch(request,env,ctx){const path=new URL(request.url).pathname;if(path.startsWith('/api/')||path==='/health')return api.fetch(request,env,ctx);const response=await env.ASSETS.fetch(request);const headers=new Headers(response.headers);headers.set('Cache-Control','no-store, max-age=0');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})},
 scheduled(controller,env,ctx){return api.scheduled(controller,env,ctx)}
};
