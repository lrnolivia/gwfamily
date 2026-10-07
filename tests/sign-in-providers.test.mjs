import test from 'node:test';
import assert from 'node:assert/strict';
import {signInProviders,signInRequest} from '../src/sign-in-providers.mjs';
const config={configured:true,origin:'https://family.example.test',providerMethods:[{id:'google',mode:'access'},{id:'microsoft',mode:'access'},{id:'yahoo',mode:'access'}]};
test('only explicit capabilities are displayed, including during rolling deployment',()=>{
 assert.deepEqual(signInProviders({}),[]);assert.deepEqual(signInProviders({...config,configured:false}),[]);
 assert.deepEqual(signInProviders({...config,providerMethods:[]}),[]);
 assert.deepEqual(signInProviders(config).map(p=>p.label),['Google','Microsoft','Yahoo']);
 assert.deepEqual(signInProviders({configured:true,providers:['google','yahoo','unknown','google'],googleMode:'access'}),[{id:'google',label:'Google',mode:'access'}]);
});
test('provider endpoint is fixed locally and disabled options cannot start',()=>{
 assert.deepEqual(signInRequest(config,'yahoo'),{path:'/api/auth/sign-in/cloudflare-yahoo',body:{}});
 assert.throws(()=>signInRequest({...config,providerMethods:[{id:'google',mode:'access'}]},'microsoft'));
 assert.deepEqual(signInProviders({...config,providerMethods:[{id:'__proto__',mode:'access'},{id:'yahoo',mode:'native'},{id:'apple',mode:'access'}]}),[]);
 assert.deepEqual(signInRequest({...config,providerMethods:[{id:'google',mode:'native',endpoint:'https://attacker.test'}]},'google'),{path:'/api/auth/sign-in/social',body:{provider:'google',callbackURL:config.origin}});
 assert.throws(()=>signInRequest({...config,origin:'http://family.example.test',providerMethods:[{id:'google',mode:'native'}]},'google'));
});
