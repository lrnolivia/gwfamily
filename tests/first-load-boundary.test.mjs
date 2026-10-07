import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=process.env.GW_FIRST_LOAD_INTEGRATION_ROOT||fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(resolve(root,path),'utf8');
test('shared enrollment form and rehearsal have no network, storage, auth or live adapter boundary',()=>{
 for(const path of ['src/enrollment-form.jsx','src/first-load.jsx','src/first-load-model.js']){
  const source=read(path);
  assert.doesNotMatch(source,/\b(?:fetch|api|localStorage|sessionStorage|sendCommand|readPreviewFile|enterPreview|resetPreview|signOut)\s*(?:\(|\.)/);
  assert.doesNotMatch(source,/from ['"]\.\/(?:live-adapter|data-adapter|sign-in|push-client|push-device|notifications|messaging)\./);
  assert.doesNotMatch(source,/\/(?:api\/|auth\/)|location\.(?:assign|replace)|requestPermission|serviceWorker|pushManager/);
 }
 const rehearsal=read('src/first-load.jsx');assert.match(rehearsal,/useMemo\(\(\)=>\(\{platform,data:\{pending:false\},setPreviewColor\}\)/);assert.doesNotMatch(rehearsal,/\.\.\.\s*(?:app|data|state|context)/);
 assert.match(rehearsal,/saveLabel="Save rehearsal draft"/);assert.match(rehearsal,/Rehearsal finished\./);assert.match(rehearsal,/Return to GW/);assert.match(rehearsal,/e\.key==='Escape'/);
});
test('the live wrapper preserves enrollment before optional upload and refreshes through the quiet entry callback',()=>{
 const signIn=read('src/sign-in.jsx'),enrollment=signIn.slice(signIn.indexOf('export function Enrollment(){'),signIn.indexOf('export function WaitingForApproval(){'));
 assert.match(enrollment,/onSave=\{saveProfile\}/);assert.ok(enrollment.indexOf("api('/api/enroll'")<enrollment.indexOf("api('/api/onboarding/photo'"));
 assert.match(enrollment,/if\(values\.file\)/);assert.match(enrollment,/await \(refreshEntry\|\|data\.refresh\)\(\)/);
 assert.doesNotMatch(enrollment,/canRehearseFirstLoad|rehearsal|roles|BOOTSTRAP_OWNER_EMAIL/);
 assert.match(signIn,/email,otp:code\}\)\}\);await \(refreshEntry\|\|data\.refresh\)\(\)/);
});
test('loading is outside Onboarding and the App sandbox neither resets data nor changes the real route',()=>{
 const app=read('src/react-app.jsx'),onboarding=app.slice(app.indexOf('function Onboarding(){'),app.indexOf('function Home(){'));
 assert.doesNotMatch(onboarding,/Getting things ready|data\.loading\?/);
 assert.match(app,/firstLoadView\(data,state,entryReview,entryLoading\)/);assert.match(app,/openFirstLoad:canFreshStart\?openFirstLoad:null/);
 assert.match(app,/rehearsing\?<FirstLoadRehearsal/);assert.match(app,/showFirstLoad\?<FirstLoad busy=\{entryBusy\}/);assert.match(app,/!rehearsing&&<PushLifecycle\/>/);
 const callbacks=app.slice(app.indexOf('async function refreshEntry(){'),app.indexOf('const actualNeedsEntry=',app.indexOf('async function refreshEntry(){')));
 assert.doesNotMatch(callbacks,/dispatch\(|resetPreview|resetPageContentPreview|navigation\.(?:go|replace|back)|localStorage|sessionStorage/);
 assert.match(callbacks,/entryOrigin\.current=\{focus:document\.activeElement,scroll:window\.scrollY\}/);assert.match(callbacks,/top:origin\.scroll/);
 assert.match(app,/entryReview&&!entryReviewCurrent/);assert.match(app,/<PageContentProvider enabled=\{!actualNeedsEntry\}>/);assert.match(app,/const needsEntry=actualNeedsEntry\|\|Boolean\(entryReviewCurrent\)/);assert.match(app,/<main id="main" tabIndex=\{-1\}>/);
});
test('session capability uses verified server session and leaves the enrollment authority gate unchanged',()=>{
 const routes=read('backend/src/routes.mjs'),session=routes.slice(routes.indexOf("app.get('/api/session'"),routes.indexOf("app.post('/api/enroll'"));
 assert.match(session,/canRehearseFirstLoad:canRehearseFirstLoad\(e,session,member\)/);assert.match(session,/SELECT status,removed_at FROM members WHERE id=\?/);assert.doesNotMatch(session,/batch\(|INSERT|UPDATE|DELETE|roles|is_leader/);
 assert.equal((session.match(/canRehearseFirstLoad:false/g)||[]).length,3);
 assert.match(routes,/const owner=Boolean\(e\.BOOTSTRAP_OWNER_EMAIL\)&&e\.BOOTSTRAP_OWNER_EMAIL\.toLowerCase\(\)===session\.user\.email\.toLowerCase\(\)/);
 for(const path of ['src/first-load.jsx','src/first-load-model.js','src/enrollment-form.jsx'])assert.doesNotMatch(read(path),/lrnwhite|icloud\.com|BOOTSTRAP_OWNER_EMAIL/);
});
test('photo selection is local, bounded and cleaned up; saves are explicit and locked',()=>{
 const form=read('src/enrollment-form.jsx');assert.match(form,/URL\.createObjectURL\(next\)/);assert.match(form,/URL\.revokeObjectURL\(photo\)/);assert.match(form,/next\.size>10\*1024\*1024/);
 assert.match(form,/if\(saveLock\.current\)return/);assert.match(form,/await onSave\(\{name,birthday,privacyAccepted/);assert.match(form,/file:appearance\?file:null/);assert.match(form,/profileColor:appearance\?color:'#4f996c'/);
 assert.match(form,/disabled=\{busy\}/);assert.match(form,/onColor=\{setColor\}/);assert.match(form,/onRemove=\{\(\)=>\{setFile\(null\);setPhoto\(null\)\}\}/);
});

test('unverified state names email verification without changing status refresh, exit or inventing a resend API',()=>{
 const signIn=read('src/sign-in.jsx'),waiting=signIn.slice(signIn.indexOf('export function WaitingForApproval(){'));
 assert.match(waiting,/unverified=data\.session\?\.status==='unverified'\|\|data\.session\?\.verified===false/);
 assert.match(waiting,/Email verification is pending\./);assert.match(waiting,/Your email is still awaiting verification/);
 assert.match(waiting,/await data\.refresh\(\)/);assert.match(waiting,/<SignOutControl\/>/);assert.match(read('src/account-actions.jsx'),/await data\.signOut\(\)/);assert.doesNotMatch(waiting,/api\(|resend|send-verification|provider/);
});
