// Newly reconstructed hosted-only fixture. Browser results are unverified until
// the authorized hosted lane runs this exact source with the real dependencies.
// Fictional accounts and public synthetic routes only: no app API, real content,
// sends, permissions, subscription, service-worker install, or OS installation.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {contextualTourSteps,tourProgressKey} from '../src/contextual-tour-model.js';
import {installGuideAssets} from '../src/install-guide-assets.js';

if(!process.env.CI&&process.env.GW_HOSTED_BROWSER_QA!=='1')throw new Error('Help browser QA runs only in the authorized hosted CI environment.');
const root=fileURLToPath(new URL('../',import.meta.url));
const FIXTURE_URL='https://gw-help-fixture.invalid/__review/help/';
const SYNTHETIC_DRAFT='An unsent synthetic update';
const ASSET_ALLOWLIST=Object.freeze([
 'ios-safari-compact.svg','ios-safari-direct-share.svg','ipados-safari-share.svg',
 'ios-safari-share-sheet.svg','ios-safari-add-screen.svg',
 'android-chrome-more.svg','android-chrome-install-option.svg','android-chrome-confirm.svg',
 'macos-safari-file-menu.svg','macos-safari-add-dialog.svg','macos-spotlight-open.svg',
 'desktop-chrome-install-menu.svg','desktop-chrome-confirm.svg',
 'windows-chrome-apps-open.svg','chromeos-launcher-open.svg','windows-edge-install-menu.svg'
]);
const HOSTED_PLAN=Object.freeze([
 'narrow and roomy viewports','Glass and Flat materials','light and dark themes',
 'fullpage install Back','glyph-led OS and Safari tabs','all sixteen SVGs load',
 'seven visible native anchors','Next Back Skip Finish and replay',
 'keyboard focus wrapping and arrow shortcuts','200 percent text zoom',
 'protected native-dialog interruption','readonly route interruption',
 'account-scoped progress and drafts','pending-state controls',
 'mock-only dismissed and failed install prompts','unsent draft preservation'
]);
const fixture=String.raw`import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AppContext,ActionRow,Button,Control,Glyph,GlassSystem,Sheet} from './src/ui-core.jsx';
import {InstallGuide} from './src/install.jsx';
import {Tutorial,TutorialProvider} from './src/tutorial.jsx';
import {ViewSwitcher} from './src/view-switcher.jsx';
import {profilePalette} from './src/profile-model.js';
const publicRoutes=new Set(['home','reunion','family','you','tutorial','install','messages','notifications']);
const safeRoute=next=>{if(!next||!publicRoutes.has(next.type)||next.id||next.section)throw Error('Fixture allows public synthetic routes only');return {...next}};
function Fixture(){
 const [route,setRoute]=useState({type:'home'}),[account,setAccount]=useState('fixture-a'),[platform,setPlatform]=useState('ios'),[pending,setPending]=useState(false),[sheet,setSheet]=useState(null),[drafts,setDrafts]=useState({'fixture-a':'An unsent synthetic update','fixture-b':'A separate unsent synthetic draft'}),[familyTab,setFamilyTab]=useState('people');
 const history=useRef([]),audit=useRef({routeReplacements:[],nativeActivations:[],mockPromptCalls:0,interruptionClosed:0});
 const go=next=>{history.current.push({...route});setSheet(null);setRoute(safeRoute(next))};
 const replaceRoute=next=>{const value=safeRoute(next);audit.current.routeReplacements.push(value);setRoute(value);if(value.type==='family')setFamilyTab(value.tab||'people')};
 const goBack=()=>{setSheet(null);setRoute(history.current.pop()||{type:'home'})};
 const activate=(name,callback)=>{audit.current.nativeActivations.push(name);callback()};
 const setTheme=(theme,color='#627bf0')=>{document.documentElement.dataset.theme=theme;for(const [key,value] of Object.entries(profilePalette(color,theme)))document.documentElement.style.setProperty(key,value)};
 useEffect(()=>{setTheme('dark')},[]);
 useEffect(()=>{
  window.fixture={
   account:setAccount,pending:setPending,navigate:go,
   theme:setTheme,material:value=>{if(!['ios','android'].includes(value))throw Error('Unknown synthetic material');document.documentElement.dataset.platform=value;setPlatform(value)},
   textZoom:value=>{if(![100,200].includes(value))throw Error('Unsupported text zoom');document.documentElement.style.fontSize=value+'%';document.documentElement.dataset.fixtureTextZoom=String(value)},
   interrupt:()=>setSheet('interruption'),
   mockInstallPrompt:mode=>{if(!['dismissed','failure'].includes(mode))throw Error('Only mock dismissed/failure outcomes are allowed');const event=new Event('beforeinstallprompt',{cancelable:true});event.fixtureMockOnly=true;event.prompt=async()=>{audit.current.mockPromptCalls++;if(mode==='failure')throw Error('Synthetic mock prompt failure')};event.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(event)},
   snapshot:()=>({route:{...route},account,pending,draft:drafts[account],...audit.current})
  };
 },[route,account,platform,pending,sheet,drafts]);
 const app={platform,state:{mode:'live',selfId:account},route,data:{pending},messaging:{synthetic:true},notifications:{synthetic:true},openSheet:setSheet,go,replaceRoute,goBack};
 const closeSheet=()=>{if(sheet==='interruption')audit.current.interruptionClosed++;setSheet(null)};
 const draft=drafts[account]||'';
 return <AppContext.Provider value={app}>{platform==='ios'&&<GlassSystem/>}<TutorialProvider>
  <div className="fixture-shell">
   <header className="fixture-header"><p className="fixture-safety">Hosted synthetic component fixture. Fictional accounts only. Mock install prompt only; no device installation or notification delivery is performed.</p><div className="fixture-help-actions"><Button onClick={()=>go({type:'install'})}>Install help</Button><Button onClick={()=>go({type:'tutorial'})}>Quick guide</Button></div></header>
   <nav className="fixture-navigation" aria-label="Synthetic app navigation">
    <Control className="button fixture-native-target" data-gw-tour="nav-home" onClick={()=>activate('nav-home',()=>go({type:'home'}))}><Glyph name="home"/>Home</Control>
    <Control className="button fixture-native-target" data-gw-tour="nav-reunion" onClick={()=>activate('nav-reunion',()=>go({type:'reunion'}))}><Glyph name="calendar"/>Reunion</Control>
    <Control className="button" onClick={()=>go({type:'family',tab:'people'})}><Glyph name="people"/>Family</Control>
    <Control className="button" onClick={()=>go({type:'you'})}><Glyph name="user"/>You</Control>
   </nav>
   <main className="fixture-page" data-route={route.type}>
    {route.type==='home'&&<><h1>Synthetic public feed</h1><p>A fictional public update for fixture review.</p><div className="fixture-home-controls"><Control className="icon-button fixture-native-target" aria-label="Create synthetic post" data-gw-tour="compose" onClick={()=>activate('compose',()=>setSheet('composer'))}><Glyph name="plus"/></Control><Control className="button messages-entry fixture-native-target" data-gw-tour="messages" onClick={()=>activate('messages',()=>go({type:'messages'}))}><Glyph name="chat"/>Messages</Control><Control className="button notification-entry fixture-native-target" data-gw-tour="notifications" onClick={()=>activate('notifications',()=>go({type:'notifications'}))}><Glyph name="bell"/>Notifications</Control></div></>}
    {route.type==='reunion'&&<><h1>Synthetic reunion reference</h1><p>Fictional plans. This route has no RSVP or payment action.</p></>}
    {route.type==='family'&&<><h1>Synthetic family reference</h1><ViewSwitcher label="Family views" value={familyTab} onChange={value=>activate('family-people',()=>setFamilyTab(value))} tourTargets={{people:'family-people'}} options={[{value:'people',label:'People',icon:'people'},{value:'memories',label:'Memories',icon:'image'},{value:'tree',label:'Tree',icon:'tree'}]}/><p>A fictional public reference list with no member identities.</p></>}
    {route.type==='you'&&<><h1>Synthetic account reference</h1><ActionRow icon="help" title="Quick guide" detail="Resume or replay the real contextual guide" tourTarget="you-guide" onClick={()=>activate('you-guide',()=>go({type:'tutorial'}))}/></>}
    {route.type==='tutorial'&&<><Control className="text-button fixture-page-back" onClick={goBack}>Back</Control><Tutorial/></>}
    {route.type==='install'&&<><h1>Install help</h1><InstallGuide/></>}
    {['messages','notifications'].includes(route.type)&&<><h1>Synthetic readonly reference</h1><p>No conversations, recipients, notifications or API calls are connected.</p><Control className="text-button" onClick={goBack}>Back</Control></>}
   </main>
   <section className="fixture-draft"><label htmlFor="fixture-draft">Preserved synthetic draft</label><textarea id="fixture-draft" value={draft} onChange={event=>setDrafts(previous=>({...previous,[account]:event.target.value}))}/><p>Unsent local fixture text. No publish or send control exists.</p></section>
  </div>
  {sheet&&<Sheet title={sheet==='composer'?'Synthetic unsent composer':'Synthetic protected interruption'} onClose={closeSheet}><p>{sheet==='composer'?'This mock composer cannot publish. Its draft stays in local component state.':'This native dialog must stay open until explicitly closed.'}</p>{sheet==='composer'&&<textarea aria-label="Mock composer draft" value={draft} onChange={event=>setDrafts(previous=>({...previous,[account]:event.target.value}))}/>}</Sheet>}
 </TutorialProvider></AppContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);`;

const stylesToLoad=[
 'dist/style.css','dist/review.css','dist/liquid-glass-core.css','dist/ui-pass.css','dist/react-ui.css',
 'src/choice-control.css','src/help.css','src/install-guide-visuals.css','src/view-switcher.css','src/tutorial.css','src/sheet-geometry.css'
];
const fixtureCSS=`.fixture-shell{max-width:960px;margin:auto;padding:20px;min-width:0}.fixture-header{display:grid;gap:12px}.fixture-safety{font:400 .8125rem/1.5 system-ui;color:var(--muted);margin:0}.fixture-help-actions,.fixture-home-controls{display:flex;gap:12px;flex-wrap:wrap}.fixture-navigation{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:24px 0}.fixture-navigation .button{min-width:0;min-height:48px;display:flex;flex-direction:column;padding:10px 4px;font-size:.875rem}.fixture-page{padding:12px 0 24px;min-width:0}.fixture-page h1{overflow-wrap:anywhere}.fixture-draft{display:grid;gap:8px;max-width:680px;margin-top:24px}.fixture-draft textarea{width:100%;min-width:0;min-height:100px;font:inherit}.fixture-draft p{font-size:.8125rem}.fixture-page-back{margin-bottom:16px}.fixture-home-controls .icon-button{width:52px;min-height:52px}.fixture-home-controls .button{min-height:48px}@media(max-width:380px){.fixture-shell{padding:12px}.fixture-navigation{gap:4px}.fixture-help-actions .button{font-size:.875rem}}`;
const output=root+'docs/help-qa';
const results=[],errors=[],writes=[],consoleErrors=[],failedRequests=[],deniedRequests=[],assetLoads=new Set();
let browser=null,lastPage=null,phase='bundle bootstrap',failure=null;
await mkdir(output,{recursive:true});
try{
 const {build}=await import('esbuild');
 const {chromium,webkit,expect}=await import('@playwright/test');
 assert.equal(ASSET_ALLOWLIST.length,16);
 assert.deepEqual([...Object.values(installGuideAssets).map(asset=>asset.file)].sort(),[...ASSET_ALLOWLIST].sort(),'Exact recovered sixteen-SVG asset contract');
 const bundle=await build({stdin:{contents:fixture,loader:'jsx',resolveDir:root},bundle:true,jsx:'automatic',format:'iife',write:false,outfile:'fixture.js',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}});
 const styles=(await Promise.all(stylesToLoad.map(file=>readFile(root+file,'utf8')))).join('\n');
 const html='<!doctype html><html data-theme="dark" data-platform="ios" data-device-os="apple" data-font="serif"><head><meta charset="utf-8"><title>GW synthetic help fixture</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'\n'+fixtureCSS+'</style></head><body><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script></body></html>';
 browser=await(process.env.GW_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
 for(const width of [320,1280])for(const material of ['ios','android'])for(const theme of ['light','dark']){
  const caseLabel=width+'-'+material+'-'+theme;
  phase='fixture bootstrap '+caseLabel;
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block',permissions:[],acceptDownloads:false});
  const page=await context.newPage();lastPage=page;page.setDefaultTimeout(12000);
  // Capture failures before navigation or any locator wait.
  page.on('pageerror',error=>{if(errors.length<40)errors.push({phase,message:error.message,stack:String(error.stack||'').slice(0,2500)})});
  page.on('console',message=>{if(message.type()==='error'&&consoleErrors.length<40)consoleErrors.push({phase,text:message.text().slice(0,1000)})});
  page.on('requestfailed',request=>{if(failedRequests.length<60)failedRequests.push({phase,url:request.url(),error:request.failure()?.errorText})});
  page.on('dialog',dialog=>{errors.push({phase,message:'Unexpected browser dialog: '+dialog.type()});void dialog.dismiss()});
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.method()!=='GET'){writes.push({phase,method:request.method(),url:request.url()});return route.abort()}
   if(request.url()===FIXTURE_URL)return route.fulfill({contentType:'text/html',body:html});
   if(url.origin===new URL(FIXTURE_URL).origin&&url.pathname==='/__review/help/tree-artwork.png')return route.fulfill({contentType:'image/png',body:await readFile(root+'dist/tree-artwork.png')});
   const asset=ASSET_ALLOWLIST.find(file=>url.origin===new URL(FIXTURE_URL).origin&&url.pathname==='/__review/help/install-guide/'+file);
   if(asset){assetLoads.add(asset);return route.fulfill({contentType:'image/svg+xml',body:await readFile(root+'dist/install-guide/'+asset)})}
   if(url.origin===new URL(FIXTURE_URL).origin&&url.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
   deniedRequests.push({phase,url:request.url()});return route.abort();
  });
  await page.goto(FIXTURE_URL);
  await expect(page.getByRole('button',{name:'Install help',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>!!window.fixture)).toBe(true);
  await page.evaluate(({material,theme})=>{window.fixture.material(material);window.fixture.theme(theme)},{material,theme});
  await expect(page.getByLabel('Preserved synthetic draft',{exact:true})).toHaveValue(SYNTHETIC_DRAFT);

  phase='fullpage install '+caseLabel;
  await page.getByRole('button',{name:'Install help',exact:true}).click();
  await expect(page.locator('.fixture-page[data-route="install"]')).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const osTabs=page.getByRole('tablist',{name:'Instructions for',exact:true});
  await expect(osTabs.getByRole('tab')).toHaveCount(6);
  await expect(osTabs.locator('.glyph')).toHaveCount(6);
  for(const [name,assetCount] of [['iPhone / iPad',3],['Android',3],['macOS',3],['Windows',4],['ChromeOS',3],['Other browser',0]]){
   await chooseTab(osTabs.getByRole('tab',{name,exact:true}),expect);
   await expect(page.locator('.install-steps>li')).toHaveCount(name==='Other browser'?2:3);
   await expect(page.locator('.install-native-frame img')).toHaveCount(assetCount);
   if(assetCount)await expect.poll(()=>page.locator('.install-native-frame img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
   await assertNoOverflow(page,name);
  }
  await chooseTab(osTabs.getByRole('tab',{name:'iPhone / iPad',exact:true}),expect);
  await expect(page.locator('.install-steps')).toContainText('Page Menu');
  await expect(page.locator('.install-steps')).toContainText('if that switch appears');
  const safariTabs=page.getByRole('tablist',{name:'Safari example',exact:true});
  for(const [name,id] of [['iPhone: Compact','ios-safari-compact'],['iPhone: Top / Bottom','ios-safari-direct-share'],['iPad','ipados-safari-share']]){
   await chooseTab(safariTabs.getByRole('tab',{name,exact:true}),expect);
   const image=page.locator('[data-asset-id="'+id+'"] img');await expect(image).toBeVisible();
   await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  }
  // The recovered ViewSwitcher owns tab semantics and native arrow/Home/End keys.
  await safariTabs.getByRole('tab',{name:'iPhone: Compact',exact:true}).focus();
  await page.keyboard.press('ArrowRight');await expect(safariTabs.getByRole('tab',{name:'iPhone: Top / Bottom',exact:true})).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('End');await expect(safariTabs.getByRole('tab',{name:'iPad',exact:true})).toBeFocused();
  await page.keyboard.press('Home');await expect(safariTabs.getByRole('tab',{name:'iPhone: Compact',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByText('Mock install prompt only; no device installation or notification delivery is performed.',{exact:false})).toBeVisible();
  await page.evaluate(()=>window.fixture.mockInstallPrompt('dismissed'));
  await page.getByRole('button',{name:'Install Green & White',exact:true}).click();
  await expect(page.locator('.install-guide [role="status"]')).toContainText('install later');
  assert.equal((await page.evaluate(()=>window.fixture.snapshot())).mockPromptCalls,1);
  await expect(page.getByRole('button',{name:'Install Green & White',exact:true})).toHaveCount(0);
  await page.evaluate(()=>window.fixture.mockInstallPrompt('failure'));
  await page.getByRole('button',{name:'Install Green & White',exact:true}).click();
  await expect(page.locator('.install-guide [role="status"]')).toContainText('could not open');
  assert.equal((await page.evaluate(()=>window.fixture.snapshot())).mockPromptCalls,2);
  await page.screenshot({path:output+'/install-'+caseLabel+'.png',fullPage:true});
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.locator('.fixture-page[data-route="home"]')).toBeVisible();
  await expect(page.getByLabel('Preserved synthetic draft',{exact:true})).toHaveValue(SYNTHETIC_DRAFT);

  phase='seven-control contextual tour '+caseLabel;
  await openGuide(page,expect);
  await expect(page.getByRole('tablist',{name:'Explore a topic',exact:true}).getByRole('tab')).toHaveCount(4);
  await chooseTab(page.getByRole('tablist',{name:'Explore a topic',exact:true}).getByRole('tab',{name:'Messages',exact:true}),expect);
  await expect(page.locator('.tutorial-topic')).toContainText('Start a private conversation');
  await page.getByRole('button',{name:'Start guide',exact:true}).click();
  await expectStep(page,contextualTourSteps[0],material,expect);
  await expect(page.locator('.tour-back')).toBeDisabled();
  await page.locator('.tour-coach').focus();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Skip guide',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Next',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('[data-gw-tour="nav-home"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');await expect(page.locator('.contextual-tour')).toHaveAttribute('data-tour-step','home');
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Skip guide',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowRight');await expectStep(page,contextualTourSteps[1],material,expect);
  await page.locator('.tour-coach').focus();await page.keyboard.press('ArrowLeft');await expectStep(page,contextualTourSteps[0],material,expect);
  for(let index=0;index<contextualTourSteps.length;index++){
   await expectStep(page,contextualTourSteps[index],material,expect);
   await expect(page.locator('.tour-progress')).toHaveText('Step '+(index+1)+' of 7');
   if(index===2){await page.getByRole('button',{name:'Back',exact:true}).click();await expectStep(page,contextualTourSteps[1],material,expect);await page.getByRole('button',{name:'Next',exact:true}).click();await expectStep(page,contextualTourSteps[2],material,expect)}
   if(index===1){await page.evaluate(()=>window.fixture.pending(true));await expect(page.locator('.tour-next')).toBeDisabled();await expect(page.locator('.tour-back')).toBeDisabled();await page.evaluate(()=>window.fixture.pending(false));await expect(page.locator('.tour-next')).toBeEnabled()}
   await page.screenshot({path:output+'/tour-'+caseLabel+'-'+contextualTourSteps[index].id+'.png',fullPage:true});
   await page.getByRole('button',{name:index===6?'Finish guide':'Next',exact:true}).click();
  }
  await expect(page.locator('.contextual-tour')).toHaveCount(0);
  await expect(page.locator('.fixture-page[data-route="tutorial"]')).toBeVisible();
  await expect(page.getByRole('button',{name:'Replay guide',exact:true})).toBeVisible();
  assert.equal((await page.evaluate(()=>window.fixture.snapshot())).nativeActivations.length,0,'Traversal never activates highlighted native controls');
  await assertProgress(page,'fixture-a',{version:1,step:'you',status:'completed'});
  await page.getByRole('button',{name:'Replay guide',exact:true}).click();await expectStep(page,contextualTourSteps[0],material,expect);
  await page.getByRole('button',{name:'Skip guide',exact:true}).click();await expect(page.locator('.fixture-page[data-route="tutorial"]')).toBeVisible();
  await expect(page.getByRole('button',{name:'Resume guide',exact:true})).toBeFocused();

  phase='text zoom and native-control pause '+caseLabel;
  await page.evaluate(()=>window.fixture.textZoom(200));
  await page.getByRole('button',{name:'Start over',exact:true}).click();
  await expectStep(page,contextualTourSteps[0],material,expect);await assertNoOverflow(page,'200 percent contextual text');
  await page.screenshot({path:output+'/tour-text-200-'+caseLabel+'.png',fullPage:true});
  await page.keyboard.press('Escape');await expect(page.locator('.contextual-tour')).toHaveCount(0);
  await page.evaluate(()=>window.fixture.textZoom(100));
  await page.getByRole('button',{name:'Start over',exact:true}).click();await expectStep(page,contextualTourSteps[0],material,expect);
  await page.getByRole('button',{name:'Next',exact:true}).click();await expectStep(page,contextualTourSteps[1],material,expect);
  await page.locator('[data-gw-tour="compose"]').focus();await page.keyboard.press('Enter');
  await expect(page.locator('.contextual-tour')).toHaveCount(0);
  await expect(page.getByRole('dialog',{name:'Synthetic unsent composer',exact:true})).toBeVisible();
  await expect(page.getByLabel('Mock composer draft',{exact:true})).toHaveValue(SYNTHETIC_DRAFT);
  assert.deepEqual((await page.evaluate(()=>window.fixture.snapshot())).nativeActivations,['compose']);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await openGuide(page,expect);await page.getByRole('button',{name:'Resume guide',exact:true}).click();await expectStep(page,contextualTourSteps[1],material,expect);

  phase='protected interruption '+caseLabel;
  await page.evaluate(()=>window.fixture.interrupt());
  await expect(page.getByRole('dialog',{name:'Synthetic protected interruption',exact:true})).toBeVisible();
  await expect(page.locator('.contextual-tour')).toHaveCount(0);
  assert.equal((await page.evaluate(()=>window.fixture.snapshot())).interruptionClosed,0,'Guide must not close a native modal');
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await openGuide(page,expect);await page.getByRole('button',{name:'Resume guide',exact:true}).click();await expectStep(page,contextualTourSteps[1],material,expect);
  await page.evaluate(()=>window.fixture.navigate({type:'reunion'}));await expect(page.locator('.contextual-tour')).toHaveCount(0);
  await expect(page.locator('.fixture-page[data-route="reunion"]')).toBeVisible();

  phase='account progress and draft isolation '+caseLabel;
  await expect(page.getByLabel('Preserved synthetic draft',{exact:true})).toHaveValue(SYNTHETIC_DRAFT);
  await page.getByLabel('Preserved synthetic draft',{exact:true}).fill(SYNTHETIC_DRAFT+' after interruption');
  await openGuide(page,expect);await page.getByRole('button',{name:'Resume guide',exact:true}).click();await expectStep(page,contextualTourSteps[1],material,expect);
  await page.getByRole('button',{name:'Next',exact:true}).click();await expectStep(page,contextualTourSteps[2],material,expect);
  await page.evaluate(()=>window.fixture.account('fixture-b'));await expect(page.locator('.contextual-tour')).toHaveCount(0);
  await expect(page.getByLabel('Preserved synthetic draft',{exact:true})).toHaveValue('A separate unsent synthetic draft');
  await openGuide(page,expect);await expect(page.getByRole('button',{name:'Start guide',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Start guide',exact:true}).click();await expectStep(page,contextualTourSteps[0],material,expect);
  await page.keyboard.press('Escape');await assertProgress(page,'fixture-b',{version:1,step:'home',status:'skipped'});
  await page.evaluate(()=>window.fixture.account('fixture-a'));
  await expect(page.getByLabel('Preserved synthetic draft',{exact:true})).toHaveValue(SYNTHETIC_DRAFT+' after interruption');
  await expect(page.getByRole('button',{name:'Resume guide',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Resume guide',exact:true}).click();await expectStep(page,contextualTourSteps[2],material,expect);
  await page.keyboard.press('Escape');await assertProgress(page,'fixture-a',{version:1,step:'messages',status:'skipped'});
  const snapshot=await page.evaluate(()=>window.fixture.snapshot());
  assert.ok(snapshot.routeReplacements.every(route=>!route.id&&!route.section&&['home','reunion','family','you','tutorial'].includes(route.type)),'Tour replaces public routes only');
  assert.equal(snapshot.draft,SYNTHETIC_DRAFT+' after interruption');
  await assertNoOverflow(page,'final state');
  results.push({width,material,theme,result:'passed',steps:7,textZoomPercent:200,accounts:['fixture-a','fixture-b'],installation:'mock-only; not performed',notificationDelivery:false});
  await context.close();
 }
 assert.deepEqual([...assetLoads].sort(),[...ASSET_ALLOWLIST].sort(),'Every allowlisted SVG was actually requested');
 assert.deepEqual(errors,[],'No browser runtime errors');assert.deepEqual(consoleErrors,[],'No browser console errors');
 assert.deepEqual(writes,[],'No fixture network writes');assert.deepEqual(deniedRequests,[],'No requests outside the exact synthetic asset allowlist');
 assert.deepEqual(failedRequests,[],'No fixture asset-load failures');
 console.log('Help hosted fixture passed',results);
}catch(error){
 failure=error;
 const diagnostics={phase,error:String(error.stack||error.message),errors,consoleErrors,failedRequests,deniedRequests};
 if(lastPage&&!lastPage.isClosed()){
  diagnostics.dom=await bounded(lastPage.evaluate(()=>({url:location.href,readyState:document.readyState,title:document.title,rootChildren:document.getElementById('root')?.childElementCount,bodyText:document.body.innerText.slice(0,4000),tourStep:document.querySelector('.contextual-tour')?.dataset.tourStep,dialogs:[...document.querySelectorAll('dialog')].map(el=>({open:el.open,label:el.getAttribute('aria-labelledby')})),buttons:[...document.querySelectorAll('button')].slice(0,40).map(el=>({text:el.textContent.slice(0,100),label:el.getAttribute('aria-label'),disabled:el.disabled}))})).catch(e=>({error:e.message})),2500);
  await lastPage.screenshot({path:output+'/'+(process.env.GW_BROWSER||'chromium')+'-failure.png',fullPage:true,timeout:4000}).catch(()=>{});
 }
 await writeFile(output+'/'+(process.env.GW_BROWSER||'chromium')+'-failure.json',JSON.stringify(diagnostics,null,2));
 console.error(JSON.stringify(diagnostics,null,2));
 console.log('::error title=GW help '+phase+'::'+String(error.stack||error.message).replaceAll('%','%25').replaceAll('\n','%0A').replaceAll('\r','%0D'));
}finally{
 await writeFile(output+'/results.json',JSON.stringify({reconstruction:'newly reconstructed',browser:process.env.GW_BROWSER||'chromium',plan:HOSTED_PLAN,results,errors,writes,consoleErrors,failedRequests,deniedRequests,assetLoads:[...assetLoads].sort(),failure:failure?{phase,message:failure.message}:null,physicalDeviceValidation:false,actualInstallation:false,notificationDelivery:false},null,2));
 await browser?.close();
}
if(failure)throw failure;

async function chooseTab(tab,expect){await expect(tab).toBeVisible();await expect(tab).toBeEnabled();await tab.click();await expect(tab).toHaveAttribute('aria-selected','true')}
async function openGuide(page,expect){await page.getByRole('button',{name:'Quick guide',exact:true}).click();await expect(page.locator('.fixture-page[data-route="tutorial"]')).toBeVisible();await expect(page.locator('dialog[open]')).toHaveCount(0)}
async function expectStep(page,step,material,expect){
 await expect(page.locator('.contextual-tour')).toHaveAttribute('data-tour-step',step.id);
 const coach=page.locator('.tour-coach'),target=page.locator('[data-gw-tour="'+step.target+'"]');
 await expect(coach).toBeVisible();await expect(coach).toHaveAttribute('aria-modal','false');await expect(target).toBeVisible();await expect(target).toBeEnabled();
 await expect(page.locator('.tour-next')).toBeEnabled();
 assert.equal(await target.evaluate(node=>node.tagName),'BUTTON','Highlight is a real native button');
 const description=await coach.getAttribute('aria-describedby');await expect(target).toHaveAttribute('aria-describedby',new RegExp(description));
 await expect(coach.locator(material==='ios'?'.tour-card.liquid-glass':'.tour-card-flat')).toBeVisible();
 const geometry=await page.evaluate(targetName=>{const panel=document.querySelector('.tour-coach').getBoundingClientRect(),node=document.querySelector('[data-gw-tour="'+targetName+'"]'),r=node.getBoundingClientRect(),hole=document.querySelector('.tour-spotlight');return {panel:{left:panel.left,top:panel.top,right:panel.right,bottom:panel.bottom},target:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},hasHole:!!hole,width:innerWidth,height:innerHeight,actualTarget:!node.closest('.contextual-tour')&&!node.closest('[inert]')}},step.target);
 assert.ok(geometry.actualTarget,'Target stays interactive outside the coach');
 assert.ok(geometry.panel.left>=0&&geometry.panel.top>=0&&geometry.panel.right<=geometry.width+1&&geometry.panel.bottom<=geometry.height+1,'Coach fits visible viewport');
 if(geometry.hasHole)assert.ok(geometry.panel.right<=geometry.target.left||geometry.panel.left>=geometry.target.right||geometry.panel.bottom<=geometry.target.top||geometry.panel.top>=geometry.target.bottom,'Coach does not cover highlighted native control');
 await assertNoOverflow(page,'tour '+step.id);
}
async function assertProgress(page,account,expected){const value=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),tourProgressKey('live:'+account));assert.deepEqual(value,expected);assert.deepEqual(Object.keys(value),['version','step','status'],'Progress never stores draft or content')}
async function assertNoOverflow(page,label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow: '+label)}
async function bounded(promise,ms){let timer;try{return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve({error:'Diagnostic timed out'}),ms)})])}finally{clearTimeout(timer)}}
