import test from 'node:test';
import assert from 'node:assert/strict';
import {familyEmailTheme} from '../backend/src/family-email-theme.mjs';
import {profilePalette} from '../src/profile-model.js';
import {GW_HEADING_FONTS} from '../src/account-actions-model.js';
import {THEME_PRESETS} from '../src/theme-presets.js';
test('emails have exactly the eight current named presets and actual app light/dark palettes',()=>{
 assert.deepEqual(THEME_PRESETS.map(p=>p.id),['red','orange','yellow','green','blue','violet','coral-pink','stone']);
 for(const preset of THEME_PRESETS)for(const theme of ['light','dark']){
  const mail=familyEmailTheme({preset:preset.id,theme}),app=profilePalette(preset.color,theme);
  assert.equal(mail.accent,preset.color);assert.equal(mail.preset,preset.id);
  assert.deepEqual(mail.wordmark,[app['--wordmark-green'],app['--wordmark-white'],app['--wordmark-family']]);
  assert.equal(mail.background,app['--bg']);assert.equal(mail.surface,app['--surface']);assert.equal(mail.text,app['--text']);
 }
});
test('emails use actual headings and reject arbitrary custom appearance by falling back to approved Green',()=>{
 for(const font of GW_HEADING_FONTS)assert.ok(familyEmailTheme({headingFont:font.value}).headingStack.includes(font.label));
 for(const color of ['#123456','#000000','#ffffff','url(javascript:bad)'])assert.equal(familyEmailTheme({interfaceAccent:{mode:'custom',color}}).preset,'green');
 assert.equal(familyEmailTheme({preset:'default'}).preset,'green');
});
