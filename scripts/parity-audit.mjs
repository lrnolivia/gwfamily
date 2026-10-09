// Usage (repo root, after npm run build): node scripts/parity-audit.mjs [outDir] [ios|android] [light|dark]
// Writes results.json + one screenshot per surface. Dev tool only; not part of CI.
// Rendered parity audit: open every reachable sheet/popover/menu in the preview
// app and check it against Lauren's standard. Fictional preview data, writes blocked.
import {webkit} from '@playwright/test';
import {createServer} from 'node:http';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,extname} from 'node:path';
import {initialState,PREVIEW_KEY} from '../src/data-adapter.js';
const root=resolve('dist'),out=resolve(process.argv[2]||'docs/parity-audit'),platform=process.argv[3]||'ios',theme=process.argv[4]||'light';
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://x').pathname.replace(/\/$/,'/index.html'));res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream');res.end(await readFile(p))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const state={...initialState(),onboarding:'done',previewRoleView:'leader'};
state.households=[{id:'fx-home',name:'Fixture Hearth',color:null,colorMode:'inherit',photo:null,founderId:state.selfId,memberIds:[state.selfId,'monique'],headIds:[state.selfId],canManage:true,heritage:[]}];
state.householdIds=['fx-home'];state.householdId='fx-home';state.branches=[{id:'fx-branch',name:'Quill Branch',createdBy:state.selfId,householdIds:['fx-home']}];
const routes=['/','/#/reunion','/#/reunion?tab=details','/#/reunion?tab=plans','/#/reunion?tab=weekend','/#/family','/#/family?tab=people','/#/family?tab=memories','/#/family?tab=tree','/#/family-calendar','/#/you','/#/household','/#/household/fx-home','/#/household-manage/fx-home','/#/household-children','/#/family-setup','/#/edit-profile','/#/contact','/#/notification-settings','/#/appearance','/#/inbox','/#/chat-new','/#/invitations','/#/tutorial','/#/family-checklist','/#/planning-history','/#/leader-tools?section=overview','/#/leader-tools?section=members','/#/leader-tools?section=calendar','/#/leader-tools?section=details','/#/leader-tools?section=fees','/#/leader-tools?section=shirts','/#/birthdays','/#/rsvp','/#/shop','/#/about','/#/profile/'+state.selfId,'/#/profile/monique','/#/memorial/lloyd','/#/memory/memory-generations','/#/post/post-generations'];
const browser=await webkit.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base||!['GET','HEAD'].includes(r.request().method()))return r.abort();if(u.pathname==='/api/config')return r.fulfill({json:{configured:false}});if(u.pathname==='/api/session')return r.fulfill({json:{signedIn:false,configured:false}});if(u.pathname.startsWith('/api/'))return r.abort();return r.continue()});
await ctx.addInitScript(({k,s,p,t})=>{localStorage.setItem(k,JSON.stringify({schema:2,mode:'preview',state:s}));localStorage.setItem('gw-platform',p);localStorage.setItem('gw-theme',t);localStorage.setItem('gw-install-dismissed','true');localStorage.setItem('gw-preview-notice:v1','seen')},{k:PREVIEW_KEY,s:state,p:platform,t:theme});
const page=await ctx.newPage();page.setDefaultTimeout(4000);
// Candidate controls: visible buttons outside the global nav/header (header once, from Home).
const tagCandidates=includeHeader=>page.evaluate(includeHeader=>{const els=[...document.querySelectorAll('button,[role=button],a.button')].filter(el=>{const r=el.getBoundingClientRect();if(!r.width||!r.height||el.disabled)return false;if(el.closest('nav,.page-navigation-header,.contextual-tour,.toast-layer,.tour-coach'))return false;if(!includeHeader&&el.closest('.app-header'))return false;return true});els.forEach((el,i)=>el.dataset.crawl=String(i));return els.map(el=>(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,60))},includeHeader);
const surfaceInfo=()=>page.evaluate(()=>{
 const vis=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
 const cands=[...document.querySelectorAll('dialog[open],[role=menu],[role=listbox],[popover],.popover,.choice-popover,.gw-glass-menu,.member-mini-pop')].filter(vis);
 if(!cands.length)return null;
 // Innermost visible surface wins (nested dialog/menu).
 const S=cands.sort((a,b)=>b.compareDocumentPosition(a)&Node.DOCUMENT_POSITION_FOLLOWING?1:-1).at(-1);
 const bgOf=el=>{for(let n=el;n;n=n.parentElement){const c=getComputedStyle(n).backgroundColor;if(c&&c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c}return 'none'};
 const sbg=bgOf(S.querySelector('#sheet-body')||S),rect=S.getBoundingClientRect();
 const title=(S.querySelector('h2,h1,[id$=-title]')?.textContent||S.getAttribute('aria-label')||'').trim().slice(0,70);
 const kind=S.id==='sheet'?'sheet':S.tagName==='DIALOG'?'dialog:'+(S.className||'').split(' ')[0]:(S.getAttribute('role')||S.className.split(' ')[0]);
 const findings=[];
 // Scrolling surfaces must be sheets.
 const scrollers=[S,...S.querySelectorAll('*')].filter(n=>{const s=getComputedStyle(n);return /(auto|scroll)/.test(s.overflowY)&&n.scrollHeight>n.clientHeight+4});
 if(scrollers.length&&kind!=='sheet'&&!kind.startsWith('dialog'))findings.push('scrolling popover/menu (should be a sheet)');
 // Header: close left, confirm right.
 const head=S.querySelector('.sheet-head,.welcome-head,.page-object-tools-heading');
 if(kind==='sheet'||kind.startsWith('dialog')){
  if(!head)findings.push('no standard header (close left / confirm right)');
  else{const close=head.querySelector('[aria-label*=Close i],[aria-label*="Not now"],.sheet-close'),done=head.querySelector('.sheet-complete,.welcome-complete,[aria-label*=Done],[aria-label*=Save]');const hr=head.getBoundingClientRect();
   if(!close)findings.push('header has no close control');else if(close.getBoundingClientRect().left>hr.left+hr.width/2)findings.push('close control is not on the left');
   if(done&&close&&done.getBoundingClientRect().left<close.getBoundingClientRect().left)findings.push('confirm control is left of close');}
 }
 const inHead=el=>head&&head.contains(el);
 const buttons=[...S.querySelectorAll('button,[role=button],a.button,input[type=submit]')].filter(b=>vis(b)&&!inHead(b));
 const onPlatter=el=>{for(let n=el.parentElement;n&&n!==S;n=n.parentElement){const c=getComputedStyle(n).backgroundColor;if(c&&c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'&&c!==sbg)return true;if(n.matches('.sheet-footer,.list-row,.choice-chips,.choice-control,.view-switcher,.segmented,[role=tablist],[role=menu],[role=listbox],.membership-chips,.image-upload-control,.tour-controls,.welcome-footer'))return true}return false};
 const label=b=>(b.getAttribute('aria-label')||b.textContent||'').trim().replace(/\s+/g,' ').slice(0,40);
 const primary=buttons.filter(b=>b.type==='submit'||b.dataset.buttonLevel==='primary'||(b.classList.contains('button')&&!b.classList.contains('secondary')&&!b.dataset.destructive));
 for(const b of primary)if(!b.closest('.sheet-footer,.welcome-footer,.tour-controls,.page-edit-toolbar')&&(kind==='sheet'||kind.startsWith('dialog')))findings.push('primary action outside sticky footer: '+label(b));
 const destructive=buttons.filter(b=>/^(remove|delete|leave|discard|decline|archive|clear|cancel invitation|revoke|report)/i.test(label(b)));
 for(const b of destructive){const c=getComputedStyle(b).color,bg=getComputedStyle(b).backgroundColor;const red=/rgb\((1[5-9]\d|2\d\d), ?([0-9]{1,2}|1[0-2]\d), ?([0-9]{1,2}|1[0-2]\d)\)/;if(!red.test(c)&&!red.test(bg))findings.push('destructive not on danger surface: '+label(b))}
 for(const b of buttons)if(!onPlatter(b)&&!b.closest('.sheet-footer,.welcome-footer'))findings.push('loose control (no platter): '+label(b));
 const inputs=[...S.querySelectorAll('input[type=checkbox],input[type=radio],select,input[type=text],input[type=search],input[type=email],input[type=date],input[type=time],textarea,input:not([type])')].filter(vis);
 for(const i of inputs){const l=i.closest('label')||i;if(!onPlatter(l)&&getComputedStyle(i).backgroundColor===sbg&&i.type&&/checkbox|radio/.test(i.type))findings.push('option without platter: '+label(i.closest('label')||i))}
 return {kind,title,findings:[...new Set(findings)],width:Math.round(rect.width),height:Math.round(rect.height),scrolls:scrollers.length>0};
});
const results=[],seen=new Set();let shot=0;
for(const route of routes){
 let names;try{await page.goto(base+route);await page.waitForTimeout(700);names=await tagCandidates(route==='/')}catch(e){results.push({route,error:e.message.slice(0,120)});continue}
 for(let i=0;i<names.length;i++){
  if(/^(Back|Home|Reunion|Family|You)$/.test(names[i]))continue;
  try{
   await page.goto(base+route);await page.waitForTimeout(500);await tagCandidates(route==='/');
   const before=page.url(),el=page.locator(`[data-crawl="${i}"]`);if(!(await el.count()))continue;
   await el.first().click({timeout:2500});await page.waitForTimeout(600);
   const info=await surfaceInfo();if(!info)continue;
   const key=info.kind+'|'+info.title;if(seen.has(key))continue;seen.add(key);
   const file=`${out}/${String(++shot).padStart(3,'0')}.png`;await page.screenshot({path:file});
   results.push({route,trigger:names[i],...info,shot:file,navigated:page.url()!==before});
  }catch(e){}
 }
}
await writeFile(out+'/results.json',JSON.stringify(results,null,1));
console.log('surfaces',results.filter(r=>!r.error).length,'with findings',results.filter(r=>r.findings?.length).length,'route errors',results.filter(r=>r.error).length);
await browser.close();server.close();
