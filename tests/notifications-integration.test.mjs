import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
test('notice navigation honors newer navigation intent and detail hydration release',async()=>{const app=await readFile(new URL('../src/react-app.jsx',import.meta.url),'utf8');assert.match(app,/navigationVersion:\(\)=>navigationIntent\.current/);assert.match(app,/function go\(next\)\{navigationIntent\.current\+\+;if\(data\.defer/);assert.match(app,/<Notifications active=\{notices\}\/>/);assert.match(app,/releaseNotificationResource\?\.\(route\)/)});
test('linked comment anchors are focusable and household requests remain reachable by invited members',async()=>{const conversation=await readFile(new URL('../src/conversation.jsx',import.meta.url),'utf8');assert.match(conversation,/data-comment-id=\{comment.id\} tabIndex=\{-1\}/);const household=await readFile(new URL('../src/households.jsx',import.meta.url),'utf8');assert.match(household,/<HouseholdRequests householdId=\{h.id\}\/>\{own&&/);assert.match(household,/section==='email-invitation'/)});
test('hosted help and notification fixtures require explicit hosted context',async()=>{for(const name of ['install-tutorial-browser.mjs','notifications-browser.mjs']){const file=await readFile(new URL(name,import.meta.url),'utf8');assert.match(file,/GW_HOSTED_BROWSER_QA/);assert.match(file,/process\.env\.CI/);assert.ok(file.indexOf('GW_HOSTED_BROWSER_QA')<file.indexOf('.launch('))}});
test('hosted controlled-settings checks use real clicks and verify pending, committed, and rejected server states',async()=>{
 const file=await readFile(new URL('notifications-browser.mjs',import.meta.url),'utf8');
 const settings=file.slice(file.indexOf("await check('settings preserve Following"),file.indexOf("await check('read-all"));
 const accountSwitch=file.slice(file.indexOf("await check('account switch"),file.indexOf("await check('notification controls fit"));
 assert.doesNotMatch(settings+accountSwitch,/\.uncheck\(|\.check\(|force\s*:\s*true|waitForTimeout|setTimeout/);
 for(const required of [
  'await replies.click();await expect.poll(()=>started).toBe(true)',
  'await expect(saving).toBeVisible();await expect(replies).toBeDisabled();await expect(replies).toBeChecked()',
  'await expect(replies).not.toBeChecked();await expect(replies).toBeEnabled();await expect(saving).toBeHidden()',
  "{expectedAccountId:'alice',revision:previous.revision,categories:{replies:false}}",
  "{expectedAccountId:'alice',revision:previous.revision+1,categories:{replies:true}}",
  'assert.deepEqual(accounts.alice.settings,{...previous,revision:previous.revision+2})',
  "assert.equal(accounts.alice.settings.scope,'loved_ones')",
 ])assert.ok(settings.includes(required),required);
 for(const required of [
  "viewer.id='bob';await reactions.click()",
  'await expect(reactions).toBeEnabled();await expect(reactions).toBeChecked()',
  "{viewer:'bob',payload:{expectedAccountId:'alice',revision:oldSettings.revision,categories:{reactions:false}}}",
  'assert.deepEqual(accounts.alice.settings,oldSettings);assert.deepEqual(accounts.bob.settings,previous)',
  "await expect(panel(alice).locator('[data-notice-id^=\"alice-\"]')).toHaveCount(0)",
  "await expect(panel(alice).locator('[data-notice-id^=\"bob-\"]')).toHaveCount(2)",
 ])assert.ok(accountSwitch.includes(required),required);
 assert.match(file,/async function chooseRadio\(radio\)\{await expect\(radio\)\.toBeEnabled\(\);await radio\.locator\('\.\.'\)\.click\(\);await expect\(radio\)\.toBeChecked\(\);await expect\(radio\)\.toBeEnabled\(\);\}/);
});
