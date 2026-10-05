const rgb=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16));
export function luminance(hex){return rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)}
export function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('');
const textOn=bg=>{const candidates=['#fffaf0','#10251a'];const preferred=candidates.sort((a,b)=>contrast(bg,b)-contrast(bg,a))[0];return contrast(bg,preferred)>=4.5?preferred:contrast(bg,'#ffffff')>=contrast(bg,'#000000')?'#ffffff':'#000000'};
export function profilePalette(color='#4f996c',theme='dark'){
 if(!/^#[0-9a-f]{6}$/i.test(color))color='#4f996c';
 const dark=theme==='dark',base=dark?'#07130d':'#fffdf6',surface=mix(color,base,dark?.82:.93),raised=mix(color,base,dark?.7:.84),accent=mix(color,dark?'#ffffff':'#000000',dark?.48:.24);
 return {'--bg':mix(color,base,.95),'--surface':surface,'--raised':raised,'--soft':raised,'--text':textOn(surface),'--muted':textOn(surface),'--accent':accent,'--ink':textOn(accent),'--line':mix(surface,textOn(surface),.4),'--profile-color':color};
}
export function safeWebUrl(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;return u}catch{return null}}
export function themeSongInfo(value){const u=safeWebUrl(value);if(!u)return null;
 if(u.hostname==='open.spotify.com'&&/^\/track\/[a-zA-Z0-9]{22}\/?$/.test(u.pathname)){const id=u.pathname.split('/')[2];return {service:'Spotify',url:`https://open.spotify.com/track/${id}`,embed:`https://open.spotify.com/embed/track/${id}?utm_source=generator`}}
 if(u.hostname==='music.apple.com'&&/^\/[a-z]{2}\/album\/[^/]+\/\d+$/.test(u.pathname)&&/^\d+$/.test(u.searchParams.get('i')||'')){const path=u.pathname+'?i='+u.searchParams.get('i');return {service:'Apple Music',url:'https://music.apple.com'+path,embed:'https://embed.music.apple.com'+path}}
 return null;
}
export const socialServices=[['Instagram','instagram.com'],['Facebook','facebook.com'],['YouTube','youtube.com'],['TikTok','tiktok.com'],['Bluesky','bsky.app'],['LinkedIn','linkedin.com']];
export function socialInfo(value){const u=safeWebUrl(value);if(!u)return null;const host=u.hostname.replace(/^www\./,'');const match=socialServices.find(([,h])=>host===h);return match?{name:match[0],url:u.href}:null}
export function hasPostMedia(post){return !!(post.image||post.backgroundMedia||post.files?.some(f=>/^(image|video|audio)\//.test(f.type)))}
