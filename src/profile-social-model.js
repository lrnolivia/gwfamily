import {safeWebUrl,socialInfo} from './profile-model.js';

export const profileSocialServices=[
 {name:'Instagram',icon:'instagram',prefix:'instagram.com/',example:'yourname',maxLength:30},
 {name:'Facebook',icon:'facebook',prefix:'facebook.com/',example:'your.name',maxLength:100},
 {name:'YouTube',icon:'youtube',prefix:'youtube.com/@',example:'yourchannel',maxLength:100},
 {name:'TikTok',icon:'tiktok',prefix:'tiktok.com/@',example:'yourname',maxLength:24},
 {name:'Bluesky',icon:'bluesky',prefix:'bsky.app/profile/',example:'yourname.bsky.social',maxLength:253},
 {name:'LinkedIn',icon:'linkedin',prefix:'linkedin.com/in/',example:'your-name',maxLength:100},
];
const serviceFor=name=>profileSocialServices.find(service=>service.name===name);

export function socialHandle(name,value){
 const url=safeWebUrl(value),service=serviceFor(name);if(!url||!service||socialInfo(value)?.name!==name)return null;
 if(url.search||url.hash)return null;
 let path;try{path=decodeURIComponent(url.pathname).replace(/\/$/,'')}catch{return null}
 const match=name==='LinkedIn'?/^\/in\/([^/]+)$/.exec(path):name==='Bluesky'?/^\/profile\/([^/]+)$/.exec(path):['YouTube','TikTok'].includes(name)?/^\/@([^/]+)$/.exec(path):/^\/([^/]+)$/.exec(path);
 return match?match[1]:null;
}
export function socialUrlFromHandle(name,value){
 const service=serviceFor(name);if(!service||typeof value!=='string')return null;
 let handle=value.trim().replace(/^@/,'');if(!handle)return '';
 // Accept a pasted profile link, but show the editable handle after pasting.
 if(/^https?:\/\//i.test(handle)){const extracted=socialHandle(name,handle);if(!extracted)return null;handle=extracted}
 if(name==='Bluesky'&&!handle.includes('.'))handle+='.bsky.social';
 if(handle.length>service.maxLength||/[\s/?#:@\\%]/u.test(handle))return null;
 const valid=name==='Bluesky'?/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(handle):name==='YouTube'?/^[\p{L}\p{N}._-]+$/u.test(handle):name==='LinkedIn'?/^[a-z0-9_-]+$/i.test(handle):name==='Facebook'?/^[a-z0-9.]+$/i.test(handle):/^[a-z0-9._]+$/i.test(handle);
 if(!valid)return null;
 return 'https://'+service.prefix+encodeURIComponent(handle);
}
export function socialDrafts(saved={}){
 return Object.fromEntries(profileSocialServices.filter(s=>saved[s.name]).map(s=>{const original=saved[s.name],handle=socialHandle(s.name,original);return [s.name,{handle:handle??'',original,initialHandle:handle??'',legacy:handle===null}]}));
}
export function serializeSocialDrafts(drafts){
 const socials={},errors={};
 for(const [name,entry] of Object.entries(drafts)){
  if(!serviceFor(name))continue;
  if(entry.original&&entry.handle===entry.initialHandle&&socialInfo(entry.original)){socials[name]=entry.original;continue}
  const url=socialUrlFromHandle(name,entry.handle);if(url===null)errors[name]=`Enter your ${name==='Bluesky'?'Bluesky handle, such as yourname.bsky.social':name+' username, without spaces or a link'}.`;else if(url)socials[name]=url;
 }
 return {socials,errors};
}
