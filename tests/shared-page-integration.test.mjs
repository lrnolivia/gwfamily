import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SHARED_PAGE_SCHEMA} from '../src/shared-content-schema.js';
const names=['react-app.jsx','features.jsx','family.jsx','memories.jsx','contact-directory.jsx','messaging.jsx','reunion-plans.jsx','calendar-events.jsx'];
const files=Object.fromEntries(names.map(name=>[name,fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8')]));
const source=Object.values(files).join('\n');
test('shared copy fields remain rendered except intentionally retired redundant heading fields',()=>{
 const retiredHeadings=new Set(['reunion-plans.heading','reunion-calendar.heading','reunion.plansTitle']);
 const pairs=new Set([...source.matchAll(/<EditableText\s+page="([^"]+)"\s+field="([^"]+)"/g)].map(([,page,field])=>page+'.'+field));
 for(const field of ['nextRsvpTitle','nextRsvpBody','nextShirtsTitle','nextShirtsBody','nextFeesTitle','nextFeesBody'])pairs.add('home.'+field);
 for(const field of ['emptyTitle','emptyBody','caughtUpTitle','caughtUpBody'])pairs.add('inbox.'+field);
 assert.match(files['reunion-plans.jsx'],/page='home',field='reunionTitle'/);
 pairs.add('home.reunionTitle');pairs.add('reunion-plans.checklistTitle');
 // The invitations card is a native panel on Family and You; its copy follows the page it renders on.
 const invitations=fs.readFileSync(new URL('../src/family-invitations.jsx',import.meta.url),'utf8');
 assert.match(invitations,/<EditableText page=\{page\} field="inviteTitle"/);assert.match(invitations,/<EditableText page=\{page\} field="inviteBody"/);
 for(const page of ['family','you']){assert.match(files['react-app.jsx'],new RegExp("'native-invitations':invitationsAvailable\\(state,data\\)&&<InvitationCard page=\""+page+"\"/>"));pairs.add(page+'.inviteTitle');pairs.add(page+'.inviteBody');}
 for(const key of retiredHeadings){assert.equal(pairs.has(key),false);const [page,field]=key.split('.');assert.ok(Object.hasOwn(SHARED_PAGE_SCHEMA[page].fields,field),'Existing saved heading data remains recoverable')}
 for(const [page,schema]of Object.entries(SHARED_PAGE_SCHEMA)){
  for(const field of Object.keys(schema.fields))assert.ok(pairs.has(page+'.'+field)||retiredHeadings.has(page+'.'+field),page+'.'+field+' is reachable in page content');
  if(schema.hero)assert.ok(source.includes('<EditableMedia page="'+page+'" field="hero"'),page+' has an editable hero slot');
 }
});
test('public entry, personal profiles, posts, menus and structured values retain separate boundaries',()=>{
 assert.match(files['react-app.jsx'],/<PageContentProvider enabled=\{!actualNeedsEntry\}>/);
 // Owner rehearsal hides the app visually while preserving its existing draft provider.
 // Real loading, unauthenticated/pending sessions and incomplete profiles still disable it.
 assert.match(files['react-app.jsx'],/const actualNeedsEntry=data\.loading\|\|entryLoading\|\|entryHydrating\|\|state\.onboarding!=='done'/);
 assert.match(files['react-app.jsx'],/data\.session\?\.status!=='active'/);
 assert.match(files['react-app.jsx'],/state\.mode==='live'&&!state\.profileComplete/);
 assert.match(files['react-app.jsx'],/<footer>\{needsEntry\?<p>Green/);
 assert.match(files['react-app.jsx'],/state.details.date\|\|<EditableText page="home" field="heroBodyFallback"/);
 assert.match(files['react-app.jsx'],/relatedPages=\{route.type==='family'\?\['people','memories','tree'\]/);
 for(const name of ['profiles.jsx','conversation.jsx','households.jsx'])assert.doesNotMatch(fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8'),/EditableText|EditableMedia/);
 const menu=files['react-app.jsx'].slice(files['react-app.jsx'].indexOf('function ProfileMenuContent'),files['react-app.jsx'].indexOf('function TextSizeControls'));
 assert.doesNotMatch(menu,/EditableText|EditableMedia/);
});
test('update reload includes shared-page writes, drafts and safe recovery checks',()=>{
 const notice=fs.readFileSync(new URL('../src/update-toast.jsx',import.meta.url),'utf8');
 assert.match(notice,/pending:!!\(data.pending\|\|page.pending\)/);
 assert.match(notice,/page.hasUnsavedDrafts/);
 assert.match(notice,/page.storageSafe!==false/);
 assert.match(files['react-app.jsx'],/resetPreview\(\);resetPageContentPreview\(\)/);
});


test('birthday page renders its registered native calendar slot',async()=>{
 const {NATIVE_PANEL_DEFINITIONS}=await import('../src/shared-panels.js');
 const section=files['react-app.jsx'].split("route.type==='birthdays'?")[1]?.split("route.type==='contact'?")[0];
 assert.ok(section,'Birthday route exists');
 for(const [id] of NATIVE_PANEL_DEFINITIONS.birthdays)assert.ok(section.includes("'native-"+id+"':<Birthdays/>"),'Registered birthday panel is rendered');
});
