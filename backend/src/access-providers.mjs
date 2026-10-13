import {createAuthEndpoint,APIError} from 'better-auth/api';
import {setSessionCookie} from 'better-auth/cookies';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {accessProviderConfig} from './auth-providers.mjs';
import {identityFromVerifiedAccessClaims} from './access-identity.mjs';
import {buildAccessBridge} from './access-bridge.mjs';
const issuer='https://loewfi.cloudflareaccess.com';
const keys=createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'));
export async function verifyAccessIdentity(token,audience,jwks=keys,provider='google'){
 if(typeof token!=='string'||token.length>12000||!audience)throw Error('Sign-in is not configured');
 const {payload}=await jwtVerify(token,jwks,{issuer,audience,algorithms:['RS256'],requiredClaims:['sub','exp','email','type']});
 return identityFromVerifiedAccessClaims(payload,provider);
}
export function accessProvider(env,provider,verify=(token,audience)=>verifyAccessIdentity(token,audience,keys,provider)){
 return buildAccessBridge(env,accessProviderConfig(env,provider),{createAuthEndpoint,APIError,setSessionCookie,verify});
}
