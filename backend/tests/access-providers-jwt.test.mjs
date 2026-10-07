// Runs in canonical dependency-backed CI; no live IdP or remote JWKS requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {verifyAccessIdentity} from '../src/access-providers.mjs';
const aud='b'.repeat(64),issuer='https://loewfi.cloudflareaccess.com';
test('new provider JWT verifies signatures and isolated audience before trusting name or email claims',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const sign=changes=>new SignJWT({type:'app',email:'relative@example.test',sub:'synthetic-person',iss:issuer,aud,exp:Math.floor(Date.now()/1000)+60,custom:{email_verified:true,name:'Alex White'},...changes}).setProtectedHeader({alg:'RS256'}).sign(privateKey);
 assert.equal((await verifyAccessIdentity(await sign(),aud,publicKey,'yahoo')).name,'Alex White');
 for(const changes of [{aud:'a'.repeat(64)},{iss:'https://attacker.example'},{exp:1},{sub:''},{type:'org'},{email:'non_identity@example.test'},{custom:{name:'Fake Name'}}])await assert.rejects(verifyAccessIdentity(await sign(changes),aud,publicKey,'yahoo'));
 const other=await generateKeyPair('RS256');await assert.rejects(verifyAccessIdentity(await sign(),aud,other.publicKey,'yahoo'));
 await assert.rejects(verifyAccessIdentity(await sign(),aud,publicKey,'microsoft'));
 const personal={tid:'9188040d-6c67-4c5b-b112-36a304b66dad',verified_primary_email:['relative@example.test'],name:'Taylor Green'};
 assert.equal((await verifyAccessIdentity(await sign({custom:personal}),aud,publicKey,'microsoft')).name,'Taylor Green');
 await assert.rejects(verifyAccessIdentity(await sign({custom:{...personal,tid:'some-enterprise-tenant'}}),aud,publicKey,'microsoft'));
});
