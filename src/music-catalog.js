import {safeWebUrl,themeSongInfo} from './profile-model.js';

const cache=new Map();
const CACHE_MS=10*60*1000;
const TIMEOUT_MS=9000;
export function normalizeThemeSongLink(value){
 const url=safeWebUrl(typeof value==='string'?value.trim():'');if(!url)return null;
 if(url.hostname==='open.spotify.com')url.pathname=url.pathname.replace(/^\/intl-[a-z]{2}\//i,'/');
 if(url.hostname==='itunes.apple.com')url.hostname='music.apple.com';
 return themeSongInfo(url.href)?.url||null;
}
export function appleSongLookup(value){
 const url=safeWebUrl(value);if(!url||url.hostname!=='music.apple.com')return null;
 const match=/^\/([a-z]{2})\/song\/[^/]+\/(\d+)\/?$/.exec(url.pathname);return match?{country:match[1],id:match[2]}:null;
}
export function catalogSong(result){
 if(result?.kind!=='song'||!/^\d+$/.test(String(result.trackId||''))||typeof result.trackName!=='string'||typeof result.artistName!=='string')return null;
 const url=normalizeThemeSongLink(result.trackViewUrl);if(!url||!url.startsWith('https://music.apple.com/'))return null;
 const art=safeWebUrl(result.artworkUrl100||result.artworkUrl60),artwork=art&&/(^|\.)mzstatic\.com$/.test(art.hostname)?art.href:'';
 return {id:String(result.trackId),title:result.trackName,artist:result.artistName,album:String(result.collectionName||''),url,artwork,storeUrl:url.replace('https://music.apple.com/','https://itunes.apple.com/')+'&app=itunes',service:'Apple Music'};
}
export function catalogSearchUrl(query,{country='US'}={}){
 const term=String(query||'').trim().slice(0,120),url=new URL('https://itunes.apple.com/search');
 url.search=new URLSearchParams({term,country:/^[a-z]{2}$/i.test(country)?country.toUpperCase():'US',media:'music',entity:'song',limit:'8'}).toString();return url.href;
}
async function requestCatalog(url,{signal,fetchImpl=globalThis.fetch}={}){
 const cached=cache.get(url);if(cached&&Date.now()-cached.at<CACHE_MS)return cached.songs;
 const controller=new AbortController(),onAbort=()=>controller.abort();if(signal?.aborted)throw new DOMException('Search canceled','AbortError');signal?.addEventListener('abort',onAbort,{once:true});
 const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
 try{
  const response=await fetchImpl(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw Error('Catalog unavailable');
  const data=await response.json();if(!Array.isArray(data.results))throw Error('Catalog unavailable');
  const seen=new Set(),songs=data.results.map(catalogSong).filter(song=>song&&!seen.has(song.id)&&seen.add(song.id));
  if(cache.size>=24)cache.delete(cache.keys().next().value);cache.set(url,{at:Date.now(),songs});return songs;
 }catch(error){if(signal?.aborted)throw new DOMException('Search canceled','AbortError');throw Error('Song search is unavailable right now. Try again or paste a song link.')}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort)}
}
export async function searchThemeSongs(query,options={}){if(String(query||'').trim().length<2)return [];return requestCatalog(catalogSearchUrl(query,options),options)}
export async function resolveThemeSongLink(value,options={}){
 const normalized=normalizeThemeSongLink(value);if(normalized)return {url:normalized};
 const lookup=appleSongLookup(String(value||'').trim());if(!lookup)throw Error('Paste a Spotify track or Apple Music song link. Album and playlist links won’t work.');
 const url=new URL('https://itunes.apple.com/lookup');url.search=new URLSearchParams({id:lookup.id,country:lookup.country,entity:'song'}).toString();
 const songs=await requestCatalog(url.href,options),song=songs.find(song=>song.id===lookup.id);if(!song)throw Error('That song couldn’t be found. Try another song link.');return song;
}
export async function lookupThemeSong(value,options={}){
 const normalized=normalizeThemeSongLink(value);if(!normalized)return null;const link=new URL(normalized);if(link.hostname!=='music.apple.com')return null;
 const id=link.searchParams.get('i'),country=link.pathname.split('/')[1],url=new URL('https://itunes.apple.com/lookup');url.search=new URLSearchParams({id,country,entity:'song'}).toString();
 const songs=await requestCatalog(url.href,options);return songs.find(song=>song.id===id)||null;
}
