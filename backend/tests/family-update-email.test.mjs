import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationEmail,announcementEmail} from '../src/family-update-email.mjs';
import {familyEmailTheme} from '../src/family-email-theme.mjs';
import {profilePalette,contrast} from '../../src/profile-model.js';
const message={title:'New family plans',preview:'A little update for the weekend.',paragraphs:['The fictional Oak family is planning a picnic.','Open the app when you have a moment.']};

test('notification and announcement share brand rendering but keep their own content and plain text',()=>{
 for(const [render,label] of [[notificationEmail,'Family update'],[announcementEmail,'Family announcement']]){
  const mail=render(message);assert.equal(mail.subject,message.title);assert.match(mail.html,new RegExp(label));assert.match(mail.text,new RegExp(label));
  for(const paragraph of message.paragraphs){assert.ok(mail.html.includes(paragraph));assert.ok(mail.text.includes(paragraph))}
  assert.match(mail.html,/Momo Trust Display/);assert.match(mail.html,/green &amp;/);assert.match(mail.html,/role="presentation"/);assert.match(mail.html,/bgcolor="#[a-f0-9]{6}"/);assert.match(mail.html,/if mso/);
  assert.doesNotMatch(mail.html,/shadow|backdrop-filter|<script|<form|tracking|unsubscribe|sign-in code/);assert.match(mail.text,/Open family app: https:\/\/greenwhitefamily.com\//);
 }
});
test('all dynamic HTML values escape markup, attributes and preheader; plain text remains literal',()=>{
 const unsafe='<img src=x onerror="bad()"> & \'hello\'';
 const mail=notificationEmail({...message,title:unsafe,preview:unsafe,paragraphs:[unsafe+'\nSecond line'],action:{label:unsafe,url:'https://greenwhitefamily.com/?x="&y=<tag>'}});
 assert.doesNotMatch(mail.html,/<img src=x|onerror="bad|<tag>/);assert.match(mail.html,/&lt;img src=x onerror=&quot;bad\(\)&quot;&gt; &amp; &#39;hello&#39;/);assert.match(mail.html,/Second line/);assert.ok(mail.text.includes(unsafe));
});
test('links reject active content, external origins and credentials without touching any send path',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,test','http://greenwhitefamily.com','https://elsewhere.example','https://greenwhitefamily.com.evil.example','https://user:pass@greenwhitefamily.com','https://greenwhitefamily.com:8443','//greenwhitefamily.com','https://greenwhitefamily.com/\nother'])assert.throws(()=>notificationEmail({...message,action:{label:'Open',url}}));
 assert.match(notificationEmail({...message,action:{label:'Open',url:'https://greenwhitefamily.com/?a=1&b=2#family'}}).html,/a=1&amp;b=2#family/);
});
test('header injection, missing content and unrecognized values fail before rendering',()=>{
 for(const patch of [{title:'Subject\r\nBcc:other@example.com'},{preview:'Hidden\nheader'},{paragraphs:[]},{paragraphs:['\u0000']},{title:{toString:()=>'<bad>'}}])assert.throws(()=>notificationEmail({...message,...patch}));
});
test('selected palettes keep exact app surfaces and solid readable email CTA without glow',()=>{
 for(const color of ['#e64f59','#ff7a00','#ec9d00','#387b51','#3985e6','#a267d5','#ff6685','#8a8178','#000000','#ffffff'])for(const theme of ['light','dark']){
  const actual=familyEmailTheme({theme,headingFont:'serif',interfaceAccent:{mode:'custom',color}}),app=profilePalette(color,theme);
  assert.equal(actual.background,app['--bg']);assert.equal(actual.surface,app['--surface']);assert.equal(actual.text,app['--text']);assert.equal(actual.button,app['--control']);assert.ok(contrast(actual.button,actual.buttonInk)>=4.5,`${theme} ${color} button`);assert.ok(contrast(actual.surface,actual.text)>=4.5,`${theme} ${color} copy`);
 }
});
test('device-only appearance is explicit, validated and never inferred from a recipient',()=>{
 const defaultTheme=familyEmailTheme({profileColor:'#3985e6'});assert.equal(defaultTheme.accent,null);assert.equal(defaultTheme.font,'sans');assert.equal(defaultTheme.mode,'light');
 assert.equal(familyEmailTheme({interfaceAccent:{mode:'profile'},profileColor:'#3985e6'}).accent,'#3985e6');assert.equal(familyEmailTheme({interfaceAccent:{mode:'family'},profileColor:'#3985e6'}).accent,null);
 for(const value of ['url(javascript:bad)','";color:red','#123',null])assert.equal(familyEmailTheme({headingFont:value,theme:value,interfaceAccent:{mode:'custom',color:value}}).accent,null);
 const input={theme:'dark',headingFont:'serif',interfaceAccent:{mode:'custom',color:'#3985E6'}};const before=JSON.stringify(input);assert.equal(familyEmailTheme(input).font,'serif');assert.equal(JSON.stringify(input),before);
});
