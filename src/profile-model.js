const rgb=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16));
export function luminance(hex){return rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)}
export function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('');
const vibrantAccent=(color,dark)=>{const values=rgb(color),hi=Math.max(...values),lo=Math.min(...values),spread=hi-lo;if(spread<24||values[1]===hi&&values[0]<values[1])return color;const gain=dark?1.22:1.18,center=(hi+lo)/2;return '#'+values.map(v=>Math.round(Math.max(0,Math.min(255,center+(v-center)*gain))).toString(16).padStart(2,'0')).join('')};
const warmGold=color=>{const [r,g,b]=rgb(color),spread=Math.max(r,g,b)-Math.min(r,g,b);if((b<70&&g/r>.7)||spread<40||r<=g||g<=b||g-r*.65<0||b/r>.65)return color;return '#'+[r,Math.round(g*.75+(r+b)*.125),Math.round(b*.65)].map(v=>v.toString(16).padStart(2,'0')).join('')};
const textOn=bg=>{const candidates=['#fffaf0','#171714'];const preferred=candidates.sort((a,b)=>contrast(bg,b)-contrast(bg,a))[0];return contrast(bg,preferred)>=4.5?preferred:contrast(bg,'#fffaf0')>=contrast(bg,'#000000')?'#fffaf0':'#171714'};
const accentShadow=color=>{const core=color.toLowerCase()==='#ec9d00'?'#714300':mix(color,'#000000',.62),channels=rgb(core).join(',');return {'--accent-shadow-color':core,'--accent-label-glow':`0 0 2px rgba(${channels},.1),0 0 8px rgba(${channels},.1),0 0 16px rgba(${channels},.1)`,'--accent-label-glow-core':core};};
// Accent controls use white. The approved yellow keeps its hue with a warm text glow.
export function controlPalette(surface,color='#4f996c',dark=true){
 if(!/^#[0-9a-f]{6}$/i.test(color))color='#4f996c';
 if(color.toLowerCase()==='#ec9d00')return {'--control':'#ec9d00','--control-text':'#fffaf0','--control-edge':'#ec9d00',...accentShadow(color)};
 let fill=color,found=false;
 for(let i=0;i<=100&&!found;i++)for(const target of ['#000000','#fffaf0']){
  const candidate=mix(color,target,i/100);
  if(contrast(candidate,'#fffaf0')>=4.5&&contrast(candidate,surface)>=3){fill=candidate;found=true;break}
 }
 if(!found)for(let i=0;i<=100;i++){fill=mix(color,'#000000',i/100);if(contrast(fill,'#fffaf0')>=4.5)break}
 return {'--control':fill,'--control-text':'#fffaf0','--control-edge':fill,...accentShadow(fill)};
}
export function sendControlPalette(surface,color='#4f996c',dark=true){
 const palette=controlPalette(surface,color,dark);
 return {'--send-active':palette['--control'],'--send-text':palette['--control-text'],'--send-edge':palette['--control-text']};
}
function controlBoundary(surface,fill){if(fill.toLowerCase()==='#ec9d00'||contrast(surface,fill)>=3)return {'--control-separation':'inset 0 0 0 0 transparent'};const target=textOn(surface);for(let i=1;i<=100;i++){const edge=mix(fill,target,i/100);if(contrast(surface,edge)>=3)return {'--control-edge':edge,'--control-separation':`inset 0 0 0 1px ${edge}`};}return {};}
export const DEFAULT_GREEN='#387b51';
export const DEFAULT_SURFACES=Object.freeze({
 dark:Object.freeze({'--bg':'#091f17','--surface':'#102d21','--raised':'#1a3c2a','--nav':'#10291e','--soft':'#224b31','--text':'#f5eedc','--muted':'#c8bea9','--line':'#2c5039'}),
 light:Object.freeze({'--bg':'#e7efdf','--surface':'#f1f5e9','--raised':'#fafbf2','--nav':'#f1f5e9','--soft':'#d2e6c8','--text':'#4b382b','--muted':'#715b49','--line':'#cbd9c3'})
});
function hueAndSaturation(color){const [r,g,b]=rgb(color).map(v=>v/255),hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,l=(hi+lo)/2;if(!d)return {h:0,s:0,l};return {h:((hi===r?(g-b)/d+(g<b?6:0):hi===g?(b-r)/d+2:(r-g)/d+4)/6),s:d/(1-Math.abs(2*l-1)),l};}
function fromHsl(h,s,l){const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))))};return '#'+[f(0),f(8),f(4)].map(v=>v.toString(16).padStart(2,'0')).join('');}
function matchingSurfaceTone(reference,color){const tone=hueAndSaturation(reference),accent=hueAndSaturation(color),seed=fromHsl(accent.h,tone.s*Math.min(1,accent.s/.25),tone.l),target=luminance(reference),end=luminance(seed)>target?'#000000':'#fffaf0';let lo=0,hi=1,best=seed;for(let i=0;i<24;i++){const mid=(lo+hi)/2,candidate=mix(seed,end,mid);if(Math.abs(luminance(candidate)-target)<Math.abs(luminance(best)-target))best=candidate;if((luminance(candidate)<target)===(end==='#fffaf0'))lo=mid;else hi=mid;}return best;}
export function themedSurfaces(color,theme='dark'){const defaults=DEFAULT_SURFACES[theme==='light'?'light':'dark'],hue=hueAndSaturation(color).h*360,blue=hue>=190&&hue<=245;return Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,key==='--text'?(blue?(theme==='light'?'#3d444c':'#f8f3e8'):value):key==='--muted'?(blue?(theme==='light'?'#59616a':'#d0c8b9'):value):matchingSurfaceTone(value,color)]));}
export function wordmarkPalette(color,theme='dark'){
 const dark=theme!=='light',green=['#387b51','#36a267','#4f996c'].includes(color.toLowerCase()),accent=green?DEFAULT_GREEN:color,bg=green?DEFAULT_SURFACES[dark?'dark':'light']['--bg']:themedSurfaces(color,theme)['--bg'];
 const readable=seed=>{const end=dark?'#fff7e5':'#17100b';for(let i=0;i<=100;i++){const value=mix(seed,end,i/100);if(contrast(value,bg)>=4.5)return value;}return end;};
 const hue=hueAndSaturation(accent),saturation=Math.max(.55,Math.min(.82,hue.s));let lightness=.44;while(lightness>.12&&contrast(fromHsl(hue.h,saturation,lightness),bg)<4.5)lightness-=.005;const first=dark?'#f6edcf':fromHsl(hue.h,saturation,lightness),second=dark?readable(mix(accent,'#f5f0d8',.55)):fromHsl(hue.h,saturation,lightness*.76),third=dark?readable(accent):fromHsl(hue.h,saturation,lightness*.51);
 return {'--wordmark-green':first,'--wordmark-amp':first,'--wordmark-white':second,'--wordmark-family':third};
}
export function profilePalette(color='#4f996c',theme='dark'){
 if(!/^#[0-9a-f]{6}$/i.test(color))color='#4f996c';
 if(['#387b51','#36a267','#4f996c'].includes(color.toLowerCase())){const controls={'--control':DEFAULT_GREEN,'--control-text':'#fffaf0','--control-edge':DEFAULT_GREEN,...accentShadow(DEFAULT_GREEN)};return {...wordmarkPalette(DEFAULT_GREEN,theme),...controls,'--send-active':DEFAULT_GREEN,'--send-text':'#fffaf0','--send-edge':'#fffaf0',...DEFAULT_SURFACES[theme==='light'?'light':'dark'],'--accent':DEFAULT_GREEN,'--ink':'#fffaf0','--profile-color':DEFAULT_GREEN,...controlBoundary(DEFAULT_SURFACES[theme==='light'?'light':'dark']['--surface'],DEFAULT_GREEN)};}
 const dark=theme==='dark',vividPreset={'#3985e6':'#477ac6','#ed8b32':'#c94f00','#ff7a00':'#c94f00','#f08091':'#d43662','#ff6685':'#d43662'}[color.toLowerCase()],vibrant=vividPreset||(color.toLowerCase()==='#ec9d00'?color:vibrantAccent(color,dark)),paletteColor=color.toLowerCase()==='#ec9d00'?color:dark?vibrant:warmGold(vibrant),gold=!dark&&paletteColor!==vibrant,base=dark?'#111111':'#fffdf8',surface=mix(paletteColor,base,dark?.94:gold?.94:.96),raised=mix(paletteColor,base,dark?.88:gold?.86:.90),controls=controlPalette(surface,paletteColor,dark),accent=controls['--control'];
 return {...wordmarkPalette(paletteColor,theme),...controls,...sendControlPalette(surface,paletteColor,dark),'--bg':mix(paletteColor,base,gold?.96:.98),'--surface':surface,'--nav':surface,'--raised':raised,'--soft':raised,'--text':textOn(surface),'--muted':textOn(surface),'--accent':accent,'--ink':controls['--control-text'],'--line':mix(surface,textOn(surface),.4),'--profile-color':color,...themedSurfaces(paletteColor,theme),...controlBoundary(themedSurfaces(paletteColor,theme)['--surface'],accent)};
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
