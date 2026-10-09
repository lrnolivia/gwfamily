// Usage (repo root, after npm run build): node scripts/contrast-audit.mjs [outDir] [ios|android]
// Loads key screens and sheets in every interface preset x light/dark and flags
// text below WCAG AA against its real background. Preview data only, writes
// blocked. Dev tool; not part of CI.
import {webkit} from '@playwright/test';
import {createServer} from 'node:http';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,extname} from 'node:path';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
import {THEME_PRESETS} from '../src/theme-presets.js';
const root=resolve('dist'),out=resolve(process.argv[2]||'docs/contrast-audit'),platform=process.argv[3]||'ios';await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://x').pathname.replace(/\/$/,'/index.html'));res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream');res.end(await readFile(p))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const state={...initialState(),onboarding:'done',previewRoleView:'leader'};
state.households=[{id:'fx-home',name:'Fixture Hearth',color:null,colorMode:'inherit',photo:null,founderId:state.selfId,memberIds:[state.selfId,'monique'],headIds:[state.selfId],canManage:true,heritage:[]},{id:'fx-two',name:'Juniper House',color:null,colorMode:'inherit',photo:null,founderId:'monique',memberIds:['monique',state.selfId],headIds:['monique'],canManage:false,heritage:[]}];
state.householdIds=['fx-home','fx-two'];state.householdId='fx-home';state.branches=[{id:'fx-branch',name:'Quill Branch',createdBy:state.selfId,householdIds:['fx-home']}];
// [route, optional button to open a sheet/surface]
const views=[['/'],['/#/reunion'],['/#/family?tab=people'],['/#/family-calendar'],['/#/family-calendar','Add family event'],['/#/you'],['/#/family-setup'],['/#/family-setup','Quill Branch'],['/#/household/fx-home'],['/#/notification-settings'],['/#/appearance'],['/#/tutorial','Replay the welcome'],['/#/profile/'+state.selfId],['/#/household-children','Add a child'],['/#/leader-tools?section=members']];
const browser=await webkit.launch(),results=[];
for(const preset of THEME_PRESETS)for(const theme of ['light','dark']){
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||!['GET','HEAD'].includes(r.request().method()))return r.abort();if(u.pathname==='/api/config')return r.fulfill({json:{configured:false}});if(u.pathname==='/api/session')return r.fulfill({json:{signedIn:false,configured:false}});if(u.pathname.startsWith('/api/'))return r.abort();return r.continue()});
 await ctx.addInitScript(({k,s,p,t,a})=>{localStorage.setItem(k,JSON.stringify({schema:2,mode:'preview',state:s}));localStorage.setItem('gw-platform',p);localStorage.setItem('gw-theme',t);localStorage.setItem('gw-interface-accent:v1',JSON.stringify({mode:'custom',color:a}));localStorage.setItem('gw-install-dismissed','true');localStorage.setItem('gw-preview-notice:v1','seen')},{k:PREVIEW_KEY,s:state,p:platform,t:theme,a:preset.color});
 const page=await ctx.newPage();page.setDefaultTimeout(4000);
 for(const [route,open] of views){
  try{
   await page.goto(base+route);await page.waitForTimeout(600);
   if(open){await page.getByRole('button',{name:new RegExp('^'+open)}).first().click();await page.waitForTimeout(700)}
   const found=await page.evaluate(()=>{
    const cv=document.createElement('canvas');cv.width=cv.height=1;const cx=cv.getContext('2d',{willReadFrequently:true});
    const rgba=c=>{cx.clearRect(0,0,1,1);cx.fillStyle='#000';cx.fillStyle=c;cx.fillRect(0,0,1,1);const d=cx.getImageData(0,0,1,1).data;return [d[0],d[1],d[2],d[3]/255]};
    const over=(top,bottom)=>{const a=top[3]+bottom[3]*(1-top[3]);if(!a)return [0,0,0,0];return [0,1,2].map(i=>(top[i]*top[3]+bottom[i]*bottom[3]*(1-top[3]))/a).concat(a)};
    const lum=c=>{const [r,g,b]=c.slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
    const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05)};
    const scope=document.querySelector('dialog[open]')||document.querySelector('main')||document.body;
    const bgAt=el=>{let layers=[];for(let n=el;n;n=n.parentElement){const s=getComputedStyle(n);if(s.backgroundImage&&s.backgroundImage.includes('url('))return null;const c=rgba(s.backgroundColor);if(c[3]>0)layers.push(c);if(c[3]>=.999)break;if(n.tagName==='DIALOG'&&n.open)break}let acc=[255,255,255,1];if(document.documentElement.dataset.theme==='dark'||matchMedia('(prefers-color-scheme: dark)').matches)acc=rgba(getComputedStyle(document.body).backgroundColor);for(const l of layers.reverse())acc=over(l,acc);return acc};
    const out=[];
    for(const el of scope.querySelectorAll('*')){
     if(!el.childNodes.length||![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;
     const r=el.getBoundingClientRect(),s=getComputedStyle(el);if(!r.width||!r.height||s.visibility==='hidden'||+s.opacity===0||r.bottom<0||r.top>innerHeight)continue;
     if(el.closest('[aria-hidden=true],.visually-hidden,.sr-only,[disabled],:disabled,[aria-disabled=true]'))continue;
     const bg=bgAt(el);if(!bg)continue;const fg=over(rgba(s.color),bg),c=ratio(fg,bg),size=parseFloat(s.fontSize),bold=+s.fontWeight>=700;
     const need=size>=24||(size>=18.66&&bold)?3:4.5;
     if(c<need)out.push({text:[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').slice(0,50),cls:(el.className&&typeof el.className==='string'?el.className:el.tagName).slice(0,60),ratio:+c.toFixed(2),need,fg:s.color,size});
    }
    return out;
   });
   for(const f of found)results.push({preset:preset.label,theme,view:route+(open?' > '+open:''),...f});
   if(found.length)await page.screenshot({path:`${out}/${preset.label.replace(/\s/g,'-')}-${theme}-${(route+(open||'')).replace(/[^a-z0-9]+/gi,'-').slice(0,40)}.png`});
  }catch(e){results.push({preset:preset.label,theme,view:route+(open?' > '+open:''),error:e.message.slice(0,100)})}
 }
 await ctx.close();
}
await writeFile(out+'/results.json',JSON.stringify(results,null,1));
console.log('low-contrast findings',results.filter(r=>!r.error).length,'errors',results.filter(r=>r.error).length);
await browser.close();server.close();
