import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {familyEmailTheme} from '../backend/src/family-email-theme.mjs';
import {DEFAULT_SURFACES,profilePalette} from '../src/profile-model.js';
import {GW_HEADING_FONTS} from '../src/account-actions-model.js';

test('email default wordmark and surfaces track actual final GW light/dark source',()=>{
 const css=readFileSync(new URL('../src/visual-system.css',import.meta.url),'utf8');
 for(const theme of ['light','dark']){
  const rules=css.match(new RegExp(`html\\[data-theme=${theme}\\]\\{--wordmark-green:([^}]+)\\}`))[1];const values=Object.fromEntries((' --wordmark-green:'+rules).trim().split(';').filter(Boolean).map(x=>x.split(':'))),mail=familyEmailTheme({theme});
  assert.deepEqual(mail.wordmark,[values['--wordmark-green'],values['--wordmark-white'],values['--wordmark-family']]);assert.equal(mail.background,DEFAULT_SURFACES[theme]['--bg']);assert.equal(mail.surface,DEFAULT_SURFACES[theme]['--surface']);assert.equal(mail.text,DEFAULT_SURFACES[theme]['--text']);
 }
});
test('email accepts only actual heading choices and reuses personal palette mapping',()=>{
 for(const font of GW_HEADING_FONTS)assert.ok(familyEmailTheme({headingFont:font.value}).headingStack.includes(font.label));
 const mail=familyEmailTheme({theme:'dark',interfaceAccent:{mode:'custom',color:'#a267d5'}}),app=profilePalette('#a267d5','dark');assert.deepEqual(mail.wordmark,[app['--wordmark-green'],app['--wordmark-white'],app['--wordmark-family']]);
});
