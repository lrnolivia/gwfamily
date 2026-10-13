import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('required markers stay visible but do not duplicate native required semantics in choice names',()=>{
 const control=source('src/choice-control.jsx');
 assert.equal((control.match(/<span className="choice-required" aria-hidden="true">Required<\/span>/g)||[]).length,2);
 assert.match(control,/<legend id=\{labelId\}>\{label\}/);assert.match(control,/<label id=\{labelId\} htmlFor=\{id\}>\{label\}/);
 assert.match(control,/type="radio"[^>]*required=\{required\}/);assert.match(control,/aria-required=\{required\|\|undefined\} required=\{required\}/);
 assert.doesNotMatch(control,/<input[^>]*aria-hidden=/);
});
test('all required recovery choice queries map to the actual conditional native controls',()=>{
 const app=source('src/react-app.jsx'),member=source('src/family.jsx'),recovery=source('tests/recovery-browser.mjs');
 assert.match(app,/GW_HEADING_FONTS.map/);assert.match(app,/role="group" aria-label="GW heading fonts"/);assert.match(app,/aria-pressed=\{headingFont===font.value\}/);
 assert.match(app,/<ChoiceControl label="Interface style"[^>]*required options=\{\[\{value:'ios',label:'Glass'\},\{value:'android',label:'Flat'\}\]\}/);
 const contact=source('src/profiles.jsx');assert.match(contact,/<ChoiceControl label="Who can see your details\?" variant="chips" required value=\{contact.visibility\}/);
 assert.match(member,/<ChoiceControl label=\{child\?'Gender':'Gender · optional'\} variant="search" required=\{child\}/);
 assert.match(recovery,/const appearance=page\.locator\('\.appearance-page'\)/);
 assert.match(recovery,/appearance\.getByRole\('group',\{name:'GW heading fonts',exact:true\}\)/);
 assert.match(recovery,/themeAppearance\.getByRole\('group',\{name:'Interface style',exact:true\}\)/);
 assert.match(recovery,/getByRole\('combobox',\{name:'Gender',exact:true\}\)/);
});
test('Appearance is a full page with Back; repeated composer Escape assertions remain',()=>{
 const app=source('src/react-app.jsx'),recovery=source('tests/recovery-browser.mjs');
 assert.match(app,/function AppearancePage\(\)\{return <section className="stack appearance-page"><h1>Appearance<\/h1>/);
 assert.match(recovery,/page\.locator\('\.page-back'\)\.click\(\);await expect\(page\.getByRole\('heading',\{name:'Leader Tools',exact:true\}\)\)\.toBeVisible\(\)/);
 assert.match(recovery,/for\(let n=0;n<2;n\+\+\)\{[\s\S]*page\.keyboard\.press\('Escape'\);await page\.locator\('dialog'\)\.waitFor\(\{state:'detached'\}\)/);
});
