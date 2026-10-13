import './offline-test-guard.mjs';
// New post-reset coverage. These are offline source contracts and pure models,
// not JSX rendering, browser interaction, Node 22, or release acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {imageFileError,claimLines,claimDate,imageTypes} from '../src/form-consumer-model.js';
import {readPreviewFile,MAX_PREVIEW_FILE_BYTES} from '../src/uploads.js';
import {heritageRoles} from '../src/household-heritage.js';
const source=file=>fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
const households=source('households.jsx'),merchandise=source('merchandise-manager.jsx'),css=source('form-consumers.css'),family=source('family.jsx'),profile=source('profiles.jsx'),picker=source('image-upload-control.jsx'),layout=source('form-layout.css'),identity=source('person-identity.jsx');
const block=(text,start,end)=>text.slice(text.indexOf(start),text.indexOf(end,text.indexOf(start)+start.length));

test('guard is active before source/model checks and rejects network and child processes',async()=>{
 assert.throws(()=>fetch('https://example.invalid'),/Recovery checks prohibit/);
 const {spawnSync}=await import('node:child_process');assert.throws(()=>spawnSync('node',['--version']),/Recovery checks prohibit/);
 const {createServer}=await import('node:http');assert.throws(()=>createServer(),/Recovery checks prohibit/);
});
test('compact household appearance contains its editable name instead of a duplicate static preview',()=>{
 const appearance=block(households,"{tab==='appearance'?",":tab==='members'?");
 assert.match(appearance,/<ProfileStyleEditor[\s\S]*?photoLabel="Household photo"[\s\S]*?showColors=\{false\}/);
 assert.match(appearance,/<ProfileStyleEditor[^>]*>[\s\S]*<label>Household name<input[\s\S]*<\/ProfileStyleEditor>/);
 assert.equal((appearance.match(/<label>Household name/g)||[]).length,1);
 assert.ok(appearance.indexOf('</ProfileStyleEditor>')<appearance.indexOf('Use each viewer’s personal color'));
 assert.ok(appearance.indexOf('Use each viewer’s personal color')<appearance.indexOf('<ProfileColorEditor'));
 assert.match(profile,/children\|\|<div className="profile-style-copy"/);
 assert.match(appearance,/error=\{photoError\}/);assert.match(appearance,/disabled=\{photoBusy\|\|busy\}/);
});
test('household photos preserve validated upload, pending guard, retry errors and stale-scope suppression',()=>{
 const upload=block(households,' async function uploadPhoto(', '\n return <section className="stack household-page"><h1>Manage');
 assert.match(upload,/if\(photoLock.current\|\|busy\)return/);
 assert.match(upload,/imageFileError\(file,'household photo'\)/);
 assert.match(upload,/await readPreviewFile\(file,state.mode\)/);
 assert.match(upload,/version===photoVersion.current/);
 assert.match(upload,/setPhotoError\(e.message\|\|/);
 assert.match(households,/return\(\)=>\{photoVersion.current\+\+\}/);
 assert.match(picker,/event.currentTarget.value=''/);
});
test('private child records mount only in the full-page destination with an optional standard Back',()=>{
 assert.equal((households.match(/<PrivateChildren\/>/g)||[]).length,1);
 const page=block(households,'export function HouseholdChildrenPage(', '// One bounded person task');
 assert.match(page,/showBack=true/);assert.match(page,/className="page-back"/);assert.match(page,/<h1>Children’s private records<\/h1>/);
 assert.match(households,/go\(\{type:'household-children',id:householdId\}\)/);
 assert.match(family,/state.members.filter\(m=>m.managedBy===state.selfId\)/);
 assert.doesNotMatch(households,/<details\b|<summary\b/);
});
test('bounded member and membership task components preserve founding heads and exact commands',()=>{
 const task=block(households,'export function HouseholdMemberTask(', 'export function HouseholdMembershipTask(');
 assert.match(task,/!h\?\.canManage\|\|!m\|\|!h.memberIds.includes\(m.id\)\|\|m.id===h.founderId/);
 assert.match(task,/!h.headIds.includes\(m.id\)/);assert.match(task,/state.selfId===h.founderId\?'Approve as account head':'Request as account head'/);
 assert.match(task,/act\('REQUEST_HOUSEHOLD_HEAD'\)/);assert.match(task,/act\('REMOVE_HOUSEHOLD_MEMBER'\)/);
 const membership=block(households,'export function HouseholdMembershipTask(', 'export function HouseholdRequests(');
 assert.match(membership,/!h.memberIds.includes\(state.selfId\)\|\|h.canManage/);assert.match(membership,/type:'LEAVE_HOUSEHOLD',householdId:h.id/);
 for(const task of [membership,block(households,'export function HouseholdMemberTask(','export function HouseholdMembershipTask(')]){assert.match(task,/lock.current/);assert.match(task,/role="alert"/);assert.match(task,/disabled=\{busy\}/)}
});
test('request consent, actor authorization and preview simulation are retained with authorized identity',()=>{
 const requests=block(households,'export function HouseholdRequests(', 'export function HouseholdManager(');
 assert.match(requests,/canResolve=r.kind==='join'\?h\?\.headIds.includes\(state.selfId\):r.recipientId===state.selfId/);
 assert.match(requests,/memberId=\{r.kind==='invite'\?r.recipientId:r.requesterId\}/);
 assert.match(requests,/state.mode==='preview'&&<Button/);assert.match(requests,/Simulate acceptance in preview/);
 assert.match(requests,/type:'RESOLVE_HOUSEHOLD_REQUEST',id:r.id,accept/);
 assert.match(identity,/<Avatar member=\{person\}/);assert.match(identity,/member&&<MemberBadges member=\{member\}/);
});
test('email invitations explicitly send on submission, retain recipient-only link and truthful preview/sent status',()=>{
 assert.match(households,/<input required type="email" autoComplete="email" disabled=\{busy\}/);
 assert.match(households,/JSON.stringify\(\{householdId:h.id,email,sendEmail:true\}\)/);
 assert.match(households,/Send invitation/);assert.match(households,/No email or real link was sent/);
 assert.match(households,/invite.emailSent\?'Invitation email sent.':'Invitation link ready.'/);
 assert.match(households,/Private invitation link<input readOnly value=\{invite.url\}/);
 assert.match(households,/Valid for seven days, for this recipient only/);
});
test('actual two heritage roles and three titles remain required Guide radio choices, adults/ancestors stay distinct',()=>{
 assert.equal(Object.keys(heritageRoles).length,2);for(const role of Object.values(heritageRoles))assert.equal(role.titles.length,3);
 assert.match(households,/<ChoiceControl required label="Role"/);
 assert.match(households,/<ChoiceControl required label="Commemorative title" value=\{title\}/);
 assert.match(households,/purpose=\{role==='ancestral-head'\?'ancestral-head':'member'\}/);
 assert.match(households,/These commemorative titles don’t grant account access or household management/);
 assert.match(source('choice-control.jsx'),/variant==='auto'&&choices.length<=4/);
});
test('household content/management and order filtering are real view switches rather than form radio choices',()=>{
 for(const label of ['Household content','Household management'])assert.match(households,new RegExp('<ViewSwitcher label="'+label+'"'));
 assert.match(merchandise,/<ViewSwitcher label="Order filter"/);assert.doesNotMatch(merchandise,/ChoiceControl[^>]*label="Order filter"/);
 assert.match(source('view-switcher.jsx'),/role="tablist"/);assert.match(source('view-switcher.jsx'),/ArrowLeft/);
});
test('merchandise image leads two wider initial fields and later content is full width',()=>{
 const intro=block(merchandise,'<div className="form-image-intro">','<label>Description');
 assert.match(intro,/<ImageUploadControl label="Item photo"/);assert.match(intro,/form-image-fields/);
 assert.equal((intro.match(/<label>/g)||[]).length,2);assert.match(intro,/<label>Name<input required maxLength="100"/);
 assert.match(intro,/Price or contribution note<input type="text" maxLength="60"/);
 assert.match(merchandise,/<label>Description<textarea maxLength="1000" rows="3"/);
 assert.doesNotMatch(merchandise,/type="file"|merch-item-image/);
 assert.match(layout,/grid-template-columns:136px minmax\(0,1fr\)/);assert.match(layout,/@container gw-form \(min-width:25rem\)/);
});
test('merchandise arbitrary price, comma choices and independent availability remain unchanged truths',()=>{
 assert.match(merchandise,/value=\{editing.price\}/);assert.doesNotMatch(merchandise,/type="number"|currency|parseFloat/);
 assert.match(merchandise,/values:event.target.value.split\(','\)/);assert.match(merchandise,/editing.options.length<3/);
 assert.match(merchandise,/checked=\{editing.active!==false\}/);
 assert.doesNotMatch(merchandise,/values:\['XS','S','M'/); // Opening Edit must not invent an option group.
 assert.match(merchandise,/Payments are arranged separately/);
});
test('item upload/save maintain immediate locks, confirmed URL, scope checks and retry errors',()=>{
 assert.match(merchandise,/if\(uploading.current\|\|saving.current\)return/);assert.match(merchandise,/const upload=await readPreviewFile\(file,state.mode\)/);
 assert.match(merchandise,/mounted.current&&version===generation.current\)setEditing\(value=>value\?\(\{\.\.\.value,photo:upload.url,photoFrame:undefined\}\):value\)/);
 assert.match(merchandise,/if\(saving.current\|\|uploading.current\|\|!editing\)return/);
 assert.match(merchandise,/disabled=\{busy\|\|photoBusy\|\|archived\}/);assert.match(merchandise,/setPhotoError\(e.message\|\|/);
 assert.match(merchandise,/const account=accountGeneration.current/);assert.match(merchandise,/account===accountGeneration.current/);
});
test('claim identities use the exact API member_id; five fulfillment statuses remain searchable',()=>{
 assert.match(merchandise,/<PersonIdentity memberId=\{order.member_id\} displayName=\{order.name\}/);
 assert.match(merchandise,/<ChoiceControl required variant="search" label="Fulfillment"/);
 for(const status of ['claimed','ordered','ready','shipped','delivered'])assert.match(merchandise,new RegExp("\\['"+status+"'"));
 assert.match(merchandise,/type:'UPDATE_CLAIM',id:order.id,status/);
 assert.doesNotMatch(merchandise,/personId|allocation|coveredMember|assignedMember/);
});
test('compact CSS is scoped and retains the incumbent material, personal accents and system typography',()=>{
 assert.doesNotMatch(css,/#(?:[a-f0-9]{3,8})\b|backdrop-filter|font-family|--accent:|!important.*(?:color|background)/i);
 assert.match(css,/min-height:44px/);assert.match(css,/merchandise-item-form .merch-option-group\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/overflow-wrap:anywhere/);assert.doesNotMatch(css,/display:none|opacity|transform|animation/);
});
test('photo validation accepts only supported images and preserves the live API ceiling',()=>{
 assert.deepEqual(imageTypes,['image/png','image/jpeg','image/webp','image/gif']);
 for(const type of imageTypes)assert.equal(imageFileError({type,size:10},'item photo'),'');
 for(const file of [null,{type:'video/mp4',size:10},{type:'image/png',size:0},{type:'image/png',size:Infinity},{type:'image/png',size:20*1024*1024+1}])assert.ok(imageFileError(file,'item photo'));
 assert.equal(imageFileError({type:'image/png',size:20*1024*1024},'item photo'),'');
});
test('exact original preview uploader retains 2 MB local-only behavior and can retry a failed file read',async()=>{
 assert.equal(MAX_PREVIEW_FILE_BYTES,2*1024*1024);
 await assert.rejects(()=>readPreviewFile({size:MAX_PREVIEW_FILE_BYTES+1,type:'image/png'},'preview'),/Nothing was uploaded/);
 const previous=globalThis.FileReader;let fail=true,calls=0;
 globalThis.FileReader=class{readAsDataURL(){calls++;if(fail){this.onerror();return}this.result='data:image/png;base64,synthetic-test';this.onload()}};
 try{const file={name:'Synthetic test photo',size:1,type:'image/png'};await assert.rejects(()=>readPreviewFile(file,'preview'),/Could not read/);fail=false;assert.deepEqual(await readPreviewFile(file,'preview'),{name:file.name,type:file.type,url:'data:image/png;base64,synthetic-test'});assert.equal(calls,2)}finally{if(previous===undefined)delete globalThis.FileReader;else globalThis.FileReader=previous}
});
test('saved claim lines retain quantities and free price notes without inferring person allocations',()=>{
 const line={name:'Synthetic shirt',productId:'test-product',size:'XS',quantity:3,price:'pay at pickup'};
 assert.deepEqual(claimLines({lines_json:JSON.stringify([line])}),{lines:[line],error:''});
 assert.deepEqual(Object.keys(claimLines({lines_json:JSON.stringify([line])}).lines[0]),Object.keys(line));
 for(const raw of ['bad','null','{}','[null]','[[1]]']){const result=claimLines({lines_json:raw});assert.deepEqual(result.lines,[]);assert.match(result.error,/Refresh/)}
 assert.deepEqual(claimLines(null).lines,[]);assert.equal(claimDate(''), '');assert.equal(claimDate('bad-date'),'');assert.equal(claimDate('2026-10-06 12:00:00'),claimDate('2026-10-06T12:00:00Z'));
});
