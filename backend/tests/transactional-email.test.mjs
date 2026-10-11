import test from 'node:test';import assert from 'node:assert/strict';
import {signInCodeEmail,signInLinkEmail,familyInviteEmail,householdInviteEmail} from '../src/transactional-email.mjs';
import {familyEmailTheme} from '../src/family-email-theme.mjs';
import {contrast} from '../../src/profile-model.js';
// Rendering only; nothing here sends. Fictional values.
const origin='https://greenwhitefamily.com';
const all=()=>[signInCodeEmail('123456'),signInLinkEmail(origin+'/api/auth/magic-link/verify?token=fictional'),familyInviteEmail({url:origin+'/#/family-invite/'+'a'.repeat(64)}),householdInviteEmail({householdName:'Fictional Oak household',url:origin+'/#/household-invite/'+'b'.repeat(64)})];
test('every transactional email uses the approved stock-green Momo design in light and dark',()=>{
 const light=familyEmailTheme({theme:'light',headingFont:'sans'}),dark=familyEmailTheme({theme:'dark',headingFont:'sans'});
 for(const mail of all()){
  assert.match(mail.html,/Momo Trust Display/);assert.match(mail.html,/green &amp;/);assert.match(mail.html,/content="light dark"/);assert.match(mail.html,/prefers-color-scheme:dark/);
  assert.ok(mail.html.includes(light.background)&&mail.html.includes(dark.background),'both palettes present');assert.ok(mail.html.includes(light.wordmark[2])&&mail.html.includes(dark.wordmark[2]));
  assert.match(mail.html,/role="presentation"/);assert.match(mail.html,/if mso/);assert.match(mail.html,/lang="en"/);
  assert.doesNotMatch(mail.html,/<script|<form|@import|tracking|unsubscribe|api\/media|shadow|backdrop-filter/);
  assert.match(mail.text,/^Green & White Family/);assert.match(mail.text,/Same roots\. New memories\./);assert.doesNotMatch(mail.text,/<[a-z]/i,'plain text has no markup');
 }
 for(const t of [light,dark])assert.ok(contrast(t.button,t.buttonInk)>=4.5,'CTA ink is readable');
});
test('sign-in code and link keep one-use, expiry and never-share guidance in HTML and plain text',()=>{
 const code=signInCodeEmail('123456');assert.equal(code.subject,'Your Green & White sign-in code');for(const part of [code.html,code.text]){assert.match(part,/123456/);assert.match(part,/10 minutes/);assert.match(part,/only be used once/);assert.match(part,/Never share/)}
 assert.match(code.html,/aria-label="Sign-in code 1 2 3 4 5 6"/);
 const link=signInLinkEmail(origin+'/verify?a=1&b="x"');assert.match(link.html,/a=1&amp;b=%22x%22|a=1&amp;b=&quot;x&quot;/);assert.match(link.text,/works once and expires in 10 minutes/);assert.match(link.html,/copy this link/);
 for(const bad of ['<img>','12','1234567890123',' 12 34 '])assert.throws(()=>signInCodeEmail(bad));
});
test('links stay on the family origin and every dynamic value escapes',()=>{
 for(const url of ['javascript:alert(1)','https://elsewhere.example/x','http://greenwhitefamily.com/x','https://user:pass@greenwhitefamily.com/x','https://greenwhitefamily.com.evil.example/'])for(const render of [u=>signInLinkEmail(u),u=>familyInviteEmail({url:u}),u=>householdInviteEmail({householdName:'H',url:u})])assert.throws(()=>render(url));
 assert.doesNotThrow(()=>signInLinkEmail('http://127.0.0.1:4174/verify',{origin:'http://127.0.0.1:4174'}),'loopback previews only');
 assert.throws(()=>signInLinkEmail('http://family.example/verify',{origin:'http://family.example'}));
 const unsafe='<img src=x onerror="bad()"> & \'Oak\'',mail=householdInviteEmail({householdName:unsafe,url:origin+'/#/household-invite/x'});
 assert.doesNotMatch(mail.html,/<img src=x|onerror="bad/);assert.ok(mail.html.includes('&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; &#39;Oak&#39;'));assert.ok(mail.text.includes(unsafe));
 assert.throws(()=>householdInviteEmail({householdName:'Oak\r\nBcc: x@example.com',url:origin+'/x'}),'no header injection through the subject');
});
test('invitations explain consent, approval and expiry without exposing the sender',()=>{
 const family=familyInviteEmail({url:origin+'/#/family-invite/x'}),household=householdInviteEmail({householdName:'Fictional Oak household',url:origin+'/#/household-invite/y'});
 assert.match(family.text,/organizer still approves/);assert.match(family.text,/seven days/);assert.match(household.text,/choose whether to accept/);assert.equal(household.subject,'An invitation to Fictional Oak household');
 assert.match(family.html,/doesn’t grant access/);assert.match(household.html,/doesn’t grant access/);
});
