import api from './worker.mjs';
export default {
 async fetch(request,env,ctx){const path=new URL(request.url).pathname;if(path.startsWith('/api/')||path==='/health')return api.fetch(request,env,ctx);return env.ASSETS.fetch(request)},
 scheduled(controller,env,ctx){return api.scheduled(controller,env,ctx)}
};
