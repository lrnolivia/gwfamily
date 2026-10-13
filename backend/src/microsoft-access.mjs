import {createAuthEndpoint,APIError} from 'better-auth/api';
import {setSessionCookie} from 'better-auth/cookies';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {accessProviderConfig} from './auth-providers.mjs';
import {buildMicrosoftProofFlow} from './microsoft-proof-flow.mjs';
import {microsoftIdentityFromVerifiedClaims} from './microsoft-proof-identity.mjs';
const issuer='https://loewfi.cloudflareaccess.com';
const keys=createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'));
export async function verifyMicrosoftAccess(token,audience,jwks=keys){
 if(typeof token!=='string'||token.length>12000||!audience)throw Error('Microsoft sign-in is not configured');
 const {payload}=await jwtVerify(token,jwks,{issuer,audience,algorithms:['RS256'],requiredClaims:['sub','exp','type']});
 return microsoftIdentityFromVerifiedClaims(payload);
}
export function microsoftAccess(env,{consumeRate,verify=verifyMicrosoftAccess,sendCode}={}){
 if(!accessProviderConfig(env,'microsoft')||typeof consumeRate!=='function')throw Error('Microsoft sign-in is not configured');
 const send=sendCode||async function(email,code){
  if(!env.EMAIL||env.AUTH_EMAIL_ENABLED!=='true')throw Error('Email sign-in is not enabled');
  await env.EMAIL.send({from:{email:'family@greenwhitefamily.com',name:'Green & White Family'},to:email,subject:'Confirm your Microsoft sign-in for Green & White',text:`Your code is ${code}. Enter it only on greenwhitefamily.com in the browser where you just signed in with Microsoft. This connects Microsoft to the family account for this email. It expires within ten minutes. Never share this code. If you did not start this, ignore this email.`});
 };
 return buildMicrosoftProofFlow(env,{createAuthEndpoint,APIError,setSessionCookie,verify,consumeRate,sendCode:send});
}
