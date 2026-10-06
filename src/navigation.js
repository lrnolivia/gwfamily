import {useEffect,useState} from 'react';
export const mainPages=new Set(['home','reunion','family','you']);
const pages=new Set([...mainPages,'profile','post','memory','group','shop','planner','leader-tools','household','household-manage','household-invite','edit-profile','contact','birthdays','inbox','chat','chat-new','chat-settings']);
export function routeFromHash(hash){try{const [path,query='']=String(hash||'').replace(/^#\/?/,'').split('?'),[type,id]=path.split('/');if(!pages.has(type))return {type:'home'};const p=new URLSearchParams(query);return {type,...(id?{id:decodeURIComponent(id)}:{}),...(p.get('section')?{section:p.get('section')}:{}),...(p.get('tab')?{tab:p.get('tab')}:{} )}}catch{return {type:'home'}}}
export function routeHash(route){const q=new URLSearchParams();for(const key of ['tab','section'])if(route[key])q.set(key,route[key]);return '#/'+encodeURIComponent(route.type)+(route.id?'/'+encodeURIComponent(route.id):'')+(q.size?'?'+q:'')}
export function useFamilyNavigation(){
 const [route,setRoute]=useState(()=>history.state?.gwRoute||routeFromHash(location.hash));
 useEffect(()=>{if(!history.state?.gwRoute)history.replaceState({...history.state,gwRoute:route,gwDepth:0},'',routeHash(route));const pop=()=>{setRoute(history.state?.gwRoute||routeFromHash(location.hash));requestAnimationFrame(()=>window.scrollTo(0,history.state?.gwScroll||0))};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[]);
 const go=next=>{if(JSON.stringify(next)===JSON.stringify(route)){window.scrollTo(0,0);return}history.replaceState({...history.state,gwRoute:route,gwScroll:window.scrollY},'');history.pushState({gwRoute:next,gwDepth:(history.state?.gwDepth||0)+1,gwScroll:0},'',routeHash(next));setRoute(next);window.scrollTo(0,0)};
 const replace=next=>{history.replaceState({...history.state,gwRoute:next},'',routeHash(next));setRoute(next)};
 const back=()=>{if(history.state?.gwDepth>0)history.back();else go({type:'home'})};return {route,go,replace,back};
}
