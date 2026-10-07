const rgb=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16));
export function luminance(hex){return rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)}
export function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('');
const vibrantAccent=(color,dark)=>{const values=rgb(color),hi=Math.max(...values),lo=Math.min(...values),spread=hi-lo;if(spread<24||values[1]===hi&&values[0]<values[1])return color;const gain=dark?1.22:1.18,center=(hi+lo)/2;return '#'+values.map(v=>Math.round(Math.max(0,Math.min(255,center+(v-center)*gain))).toString(16).padStart(2,'0')).join('')};
const warmGold=color=>{const [r,g,b]=rgb(color),spread=Math.max(r,g,b)-Math.min(r,g,b);if((b<70&&g/r>.7)||spread<40||r<=g||g<=b||g-r*.65<0||b/r>.65)return color;return '#'+[r,Math.round(g*.75+(r+b)*.125),Math.round(b*.65)].map(v=>v.toString(16).padStart(2,'0')).join('')};
const textOn=bg=>{const candidates=['#fffaf0','#171714'];const preferred=candidates.sort((a,b)=>contrast(bg,b)-contrast(bg,a))[0];return contrast(bg,preferred)>=4.5?preferred:contrast(bg,'#ffffff')>=contrast(bg,'#000000')?'#ffffff':'#000000'};
// Accent controls use white. The approved yellow keeps its hue with a warm text glow.
export function controlPalette(surface,color='#4f996c',dark=true){
 if(!/^#[0-9a-f]{6}$/i.test(color))color='#4f996c';
 if(color.toLowerCase()==='#ec9d00')return {'--control':'#ec9d00','--control-text':'#ffffff','--control-edge':dark?'#f5f1df':'#714300','--accent-label-glow':'0 0 1px rgba(113,67,0,.1),0 0 5px rgba(113,67,0,.1),0 0 10px rgba(113,67,0,.1)','--accent-label-glow-core':'#714300'};
 let fill=color,found=false;
 for(let i=0;i<=100&&!found;i++)for(const target of ['#000000','#ffffff']){
  const candidate=mix(color,target,i/100);
  if(contrast(candidate,'#ffffff')>=4.5&&contrast(candidate,surface)>=3){fill=candidate;found=true;break}
 }
 if(!found)for(let i=0;i<=100;i++){fill=mix(color,'#000000',i/100);if(contrast(fill,'#ffffff')>=4.5)break}
 return {'--control':fill,'--control-text':'#ffffff','--control-edge':fill,'--accent-label-glow':'none'};
}
export function sendControlPalette(surface,color='#4f996c',dark=true){
 const palette=controlPalette(surface,color,dark);
 return {'--send-active':palette['--control'],'--send-text':palette['--control-text'],'--send-edge':palette['--control-text']};
}
export function profilePalette(color='#4f996c',theme='dark'){
 if(!/^#[0-9a-f]{6}$/i.test(color))color='#4f996c';
 const dark=theme==='dark',vividPreset={'#ed8b32':'#c94f00','#ff7a00':'#c94f00','#f08091':'#d43662','#ff6685':'#d43662'}[color.toLowerCase()],vibrant=vividPreset||(color.toLowerCase()==='#ec9d00'?color:vibrantAccent(color,dark)),paletteColor=color.toLowerCase()==='#ec9d00'?color:dark?vibrant:warmGold(vibrant),gold=!dark&&paletteColor!==vibrant,base=dark?'#111111':'#fffdf8',surface=mix(paletteColor,base,dark?.94:gold?.94:.96),raised=mix(paletteColor,base,dark?.88:gold?.86:.90),controls=controlPalette(surface,paletteColor,dark),accent=controls['--control'];
 return {...controls,...sendControlPalette(surface,paletteColor,dark),'--bg':mix(paletteColor,base,gold?.96:.98),'--surface':surface,'--nav':surface,'--raised':raised,'--soft':raised,'--text':textOn(surface),'--muted':textOn(surface),'--accent':accent,'--ink':controls['--control-text'],'--line':mix(surface,textOn(surface),.4),'--profile-color':color};
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
