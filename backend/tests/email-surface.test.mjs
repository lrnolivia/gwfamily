import test from 'node:test';
import assert from 'node:assert/strict';
import {THEME_PRESETS} from '../../src/theme-presets.js';
import {notificationEmail,announcementEmail} from '../src/family-update-email.mjs';
import {signInCodeEmail,signInLinkEmail,familyInviteEmail,householdInviteEmail} from '../src/transactional-email.mjs';
import {familyEmailTheme} from '../src/family-email-theme.mjs';

// Pure fictional render fixtures: no recipients, binding, database or send path.
const origin='https://greenwhitefamily.com';
const message={title:'Fictional family update',paragraphs:['Open the app to read the fictional picnic plan.']};
const inline=tag=>Object.fromEntries(tag.match(/style="([^"]+)"/)[1].split(';').filter(Boolean).map(rule=>rule.split(':').map(part=>part.trim())));
function assertSurface(html,theme,classification){
 const match=html.match(/(<table\b[^>]*max-width:560px[^>]*>)<tr>(<td\b[^>]*email-padding[^>]*>)/);
 assert.ok(match,`${classification}: main table and padded cell exist`);
 const [table,cell]=match.slice(1),tableStyle=inline(table),cellStyle=inline(cell);
 assert.equal(tableStyle['border-collapse'],'separate',`${classification}: collapsed tables suppress rounded corners`);
 assert.equal(tableStyle['border-spacing'],'0');
 assert.equal(tableStyle.overflow,'hidden');
 for(const [name,tag,style] of [['table',table,tableStyle],['cell',cell,cellStyle]]){
  assert.equal(style['border-radius'],'24px',`${classification}: all four ${name} corners`);
  assert.equal(style['background-color'],theme.surface,`${classification}: matching ${name} fill`);
  assert.ok(tag.includes(`bgcolor="${theme.surface}"`),`${classification}: legacy ${name} fill`);
 }
 assert.match(html,new RegExp(`bgcolor="${theme.background}"`),'the surrounding background stays distinct');
 return {table,cell};
}
for(const {id:preset} of THEME_PRESETS)for(const theme of ['light','dark'])for(const headingFont of ['sans','serif'])for(const [kind,render] of [['notification',notificationEmail],['announcement',announcementEmail]]){
 test(`${kind} ${preset} ${theme} ${headingFont}: rounded main surface survives stripped head CSS`,()=>{
  const appearance={preset,theme,headingFont},mail=render({...message,appearance});
  // Email clients may remove all head CSS; radius, border model and fills must remain inline.
  assertSurface(mail.html.replace(/<style>[\s\S]*?<\/style>/g,''),familyEmailTheme(appearance),`${kind} ${preset} ${theme} ${headingFont}`);
 });
}
const transactional={
 'sign-in code':()=>signInCodeEmail('482913'),
 'sign-in link':()=>signInLinkEmail(origin+'/api/auth/magic-link/verify?token=fictional-only'),
 'family invitation':()=>familyInviteEmail({url:origin+'/#/family-invite/'+'a'.repeat(64)}),
 'household invitation':()=>householdInviteEmail({householdName:'Fictional Oak household',url:origin+'/#/household-invite/'+'b'.repeat(64)})
};
for(const [kind,render] of Object.entries(transactional))test(`${kind}: rounded stock-green surface in automatic light/dark and inline fallback`,()=>{
 const mail=render(),light=familyEmailTheme({theme:'light'}),dark=familyEmailTheme({theme:'dark'});
 const {table,cell}=assertSurface(mail.html.replace(/<style>[\s\S]*?<\/style>/g,''),light,kind);
 assert.match(table,/class="gw-surface"/);assert.match(cell,/class="gw-surface email-padding"/);
 assert.ok(mail.html.includes(`.gw-surface{background-color:${dark.surface}!important;color:${dark.text}!important}`),'dark CSS updates the table and cell together');
 assert.match(mail.html,/content="light dark"/,'auth keeps the approved automatic light/dark policy');
});
