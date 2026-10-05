import {createAuthEndpoint,APIError} from 'better-auth/api';
import {setSessionCookie} from 'better-auth/cookies';
import {createRemoteJWKSet,jwtVerify} from 'jose';
const issuer='https://loewfi.cloudflareaccess.com';
const keys=createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'));
const cookieName='__Host-gw_google_state';
const cookieOptions={path:'/',secure:true,httpOnly:true,sameSite:'lax',maxAge:600};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
export async function verifyGoogleAccess(token,audience,jwks=keys){
 if(typeof token!=='string'||token.length>12000||!audience)throw Error('Google sign-in is not configured');
 const {payload}=await jwtVerify(token,jwks,{issuer,audience,algorithms:['RS256'],requiredClaims:['sub','exp','email']});
 if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>512||typeof payload.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)||payload.email.length>320||payload.email.startsWith('non_identity@'))throw Error('A verified Google identity is required');
 return {sub:payload.sub,email:payload.email.toLowerCase()};
}
export function googleAccess(env,verify=verifyGoogleAccess){
 return {id:'gw-google-access',endpoints:{
  startGoogleAccess:createAuthEndpoint('/sign-in/cloudflare-google',{method:'POST',requireHeaders:true},async ctx=>{
   if(ctx.request.headers.get('Origin')!==env.AUTH_ORIGIN)throw new APIError('FORBIDDEN',{message:'Start sign-in from the family website.'});
   const state=crypto.randomUUID()+crypto.randomUUID(),key='gw-google-state:'+await digest(state),now=Date.now();
   await env.DB.prepare('INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),key,'google',now+600000,now,now).run();
   ctx.setCookie(cookieName,state,cookieOptions);return ctx.json({url:env.AUTH_ORIGIN+'/api/auth/callback/cloudflare-google?state='+encodeURIComponent(state)});
  }),
  finishGoogleAccess:createAuthEndpoint('/callback/cloudflare-google',{method:'GET',requireHeaders:true},async ctx=>{
   const state=new URL(ctx.request.url).searchParams.get('state'),cookie=ctx.getCookie(cookieName);
   if(!state||state.length!==72||cookie!==state)throw new APIError('BAD_REQUEST',{message:'This sign-in expired. Return to the family website and try again.'});
   let identity;try{identity=await verify(ctx.request.headers.get('cf-access-jwt-assertion'),env.AUTH_GOOGLE_ACCESS_AUD)}catch{throw new APIError('UNAUTHORIZED',{message:'Google identity could not be verified. Please try again.'})}
   const row=await env.DB.prepare('DELETE FROM verification WHERE identifier=? AND expiresAt>? RETURNING id').bind('gw-google-state:'+await digest(state),Date.now()).first();
   if(!row)throw new APIError('BAD_REQUEST',{message:'This sign-in was already used or expired. Please start again.'});ctx.setCookie(cookieName,'',{...cookieOptions,maxAge:0});
   const adapter=ctx.context.internalAdapter,owned=await adapter.findAccountOwnerByKey({providerId:'cloudflare-google',accountId:identity.sub});
   let user=owned?.kind==='owned'?owned.user:null;
   if(!user){if(owned)throw new APIError('CONFLICT',{message:'This identity needs account recovery.'});const existing=await adapter.findUserByEmail(identity.email);if(existing)throw new APIError('CONFLICT',{message:'This email already has a family account. Use its email code to sign in; accounts are not linked automatically.'});
    const created=await adapter.createOAuthUser({email:identity.email,emailVerified:true,name:identity.email.split('@')[0]},{providerId:'cloudflare-google',accountId:identity.sub});user=created.user;
   }
   const session=await adapter.createSession(user.id);if(!session)throw new APIError('INTERNAL_SERVER_ERROR',{message:'Could not finish signing in.'});await setSessionCookie(ctx,{session,user});throw ctx.redirect(env.AUTH_ORIGIN);
  })
 }};
}
