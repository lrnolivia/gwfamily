import test from 'node:test';
import assert from 'node:assert/strict';
import {accessProviderConfig,configuredAuthProviders,publicAuthConfig,accessProviderRateRules} from '../src/auth-providers.mjs';
import {displayNameFromClaims,identityFromVerifiedAccessClaims} from '../src/access-identity.mjs';
const google='a'.repeat(64),microsoft='b'.repeat(64),yahoo='c'.repeat(64);
const env={EMAIL:{},AUTH_EMAIL_ENABLED:'true',AUTH_ORIGIN:'https://family.example.test',AUTH_GOOGLE_ACCESS_AUD:google,AUTH_MICROSOFT_ACCESS_AUD:microsoft,AUTH_YAHOO_ACCESS_AUD:yahoo};
test('new providers remain absent until explicit verified activation and distinct audience',()=>{
 assert.deepEqual(configuredAuthProviders(env).map(p=>p.id),['google']);
 assert.equal(accessProviderConfig({...env,AUTH_MICROSOFT_ACCESS_ENABLED:true},'microsoft'),null);
 assert.equal(accessProviderConfig({...env,AUTH_MICROSOFT_ACCESS_ENABLED:'true',AUTH_MICROSOFT_ACCESS_AUD:google},'microsoft'),null);
 assert.equal(accessProviderConfig({...env,AUTH_YAHOO_ACCESS_ENABLED:'true',AUTH_YAHOO_ACCESS_AUD:'pending'},'yahoo'),null);
 assert.deepEqual(configuredAuthProviders({...env,AUTH_MICROSOFT_ACCESS_ENABLED:'true',AUTH_YAHOO_ACCESS_ENABLED:'true'}).map(p=>p.id),['google','microsoft','yahoo']);
 assert.equal(accessProviderConfig(env,'__proto__'),null);
});
test('native Microsoft requires explicit consumer/common audience and explicit activation',()=>{
 const e={MICROSOFT_CLIENT_ID:'synthetic-id',MICROSOFT_CLIENT_SECRET:'synthetic-only',AUTH_MICROSOFT_NATIVE_ENABLED:'true'};
 assert.deepEqual(configuredAuthProviders(e),[]);
 assert.deepEqual(configuredAuthProviders({...e,MICROSOFT_TENANT_ID:'organizations'}),[]);
 assert.equal(configuredAuthProviders({...e,MICROSOFT_TENANT_ID:'consumers'})[0].id,'microsoft');
});
test('public configuration is fail-closed without auth readiness and contains no private config',()=>{
 const e={...env,AUTH_EMAIL_ENABLED:'true',EMAIL:{},AUTH_MICROSOFT_ACCESS_ENABLED:'true',MICROSOFT_CLIENT_SECRET:'do-not-expose'};
 assert.deepEqual(publicAuthConfig(e,false).providers,[]);assert.equal(publicAuthConfig(e,false).email,false);
 const config=publicAuthConfig(e,true);assert.deepEqual(config.providers,['google','microsoft']);assert.equal(config.email,true);
 assert.ok(!JSON.stringify(config).includes(microsoft));assert.ok(!JSON.stringify(config).includes('do-not-expose'));
 assert.equal(accessProviderRateRules(e)['/sign-in/cloudflare-microsoft'].max,6);
 assert.equal(accessProviderRateRules(e)['/callback/cloudflare-yahoo'],undefined);
});
test('names are display claims, never usernames or email-derived guesses',()=>{
 assert.equal(displayNameFromClaims({name:'  María  白  '}),'María 白');
 assert.equal(displayNameFromClaims({given_name:'Alex',family_name:'Rivera'}),'Alex Rivera');
 assert.equal(displayNameFromClaims({name:['Wrong'],preferred_username:'cool123',email:'cool123@example.test'}),'');
 assert.equal(displayNameFromClaims({name:'cool123@example.test'}),'');
 assert.equal(displayNameFromClaims({name:'X'.repeat(100)}).length,80);
 const identity=identityFromVerifiedAccessClaims({type:'app',sub:'stable',email:'Person@Example.test',custom:{name:'Morgan White'}});
 assert.deepEqual(identity,{sub:'stable',email:'person@example.test',name:'Morgan White'});
 assert.equal(identityFromVerifiedAccessClaims({type:'app',sub:'stable',email:'person@example.test'}).name,'');
});
test('service tokens, org tokens and malformed identities are rejected',()=>{
 const base={type:'app',sub:'person',email:'person@example.test'};
 for(const change of [{type:'org'},{type:undefined},{sub:''},{sub:'x'.repeat(513)},{email:'NON_IDENTITY@example.test'},{email:'person'},{email:' x@example.test'}])assert.throws(()=>identityFromVerifiedAccessClaims({...base,...change}));
});
test('Microsoft and Yahoo require explicit email proof before creating a verified GW identity',()=>{
 const base={type:'app',sub:'person',email:'person@example.test'};
 assert.throws(()=>identityFromVerifiedAccessClaims(base,'yahoo'));
 assert.throws(()=>identityFromVerifiedAccessClaims({...base,custom:{email_verified:'true'}},'yahoo'));
 assert.equal(identityFromVerifiedAccessClaims({...base,custom:{email_verified:true,name:'Taylor'}},'yahoo').name,'Taylor');
 assert.throws(()=>identityFromVerifiedAccessClaims({...base,custom:{email_verified:true}},'microsoft'));
 const personal={...base,custom:{tid:'9188040d-6c67-4c5b-b112-36a304b66dad'}};
 assert.throws(()=>identityFromVerifiedAccessClaims(personal,'microsoft'));
 assert.throws(()=>identityFromVerifiedAccessClaims({...personal,custom:{...personal.custom,verified_primary_email:['another@example.test']}},'microsoft'));
 assert.equal(identityFromVerifiedAccessClaims({...personal,custom:{...personal.custom,verified_primary_email:['PERSON@example.test']}},'microsoft').email,base.email);
});
