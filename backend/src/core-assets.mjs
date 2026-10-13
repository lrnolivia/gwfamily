// Ordinary version uploads can carry the exact core frontend as source-owned
// modules. Unchanged images and other assets still use the existing ASSETS
// binding. The normal Wrangler path also works when no map is injected.
export const CORE_ASSET_PATHS=['/','/index.html','/react-app.js','/react-app.css','/build.json','/sw.js'];
const compressedBlobs=new WeakMap();
const embedded=typeof __GW_CORE_ASSETS__==='undefined'?{}:__GW_CORE_ASSETS__;
export async function coreAssetResponse(request,assets=embedded){
 const path=new URL(request.url).pathname,name=path==='/'?'index.html':path.slice(1);
 if(!CORE_ASSET_PATHS.includes(path)||!Object.hasOwn(assets,name))return null;
 const headers={'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Type':assets[name].type,...(path==='/sw.js'?{'Service-Worker-Allowed':'/'}:{})};
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET, HEAD'}});
 if(request.method==='HEAD')return new Response(null,{headers});
 const item=assets[name];let cached=compressedBlobs.get(item);
 if(!cached||cached.gzip!==item.gzip){const bytes=Uint8Array.from(atob(item.gzip),value=>value.charCodeAt(0));cached={gzip:item.gzip,blob:new Blob([bytes])};compressedBlobs.set(item,cached);}
 return new Response(cached.blob.stream().pipeThrough(new DecompressionStream('gzip')),{headers});
}
