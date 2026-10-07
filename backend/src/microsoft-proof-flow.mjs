import {pendingCookie,proofCookieOptions,randomToken,sha256,normalizeProofEmail,randomCode,codeDigest,createMicrosoftProofStore} from './microsoft-proof-store.mjs';
export function buildMicrosoftProofFlow(env,{createAuthEndpoint,APIError,setSessionCookie,verify,consumeRate,sendCode,store=createMicrosoftProofStore(env.DB),now=Date.now}){
 const fail=(code,message)=>{throw new APIError(code,{message})};
 const sameOrigin=ctx=>{if(ctx.request.headers.get('Origin')!==env.AUTH_ORIGIN)fail('FORBIDDEN','Start sign-in from the family website.')};
 const pending=async ctx=>{const row=await store.read(ctx.getCookie(pendingCookie));if(!row)fail('BAD_REQUEST','This sign-in expired. Please start again.');return row};
 const mutation=async ctx=>{sameOrigin(ctx);const row=await pending(ctx);if(ctx.request.headers.get('X-GW-Auth-CSRF')!==row.data.csrf)fail('FORBIDDEN','Refresh this sign-in page and try again.');return row};
 const issueSession=async(ctx,user)=>{const session=await ctx.context.internalAdapter.createSession(user.id);if(!session)fail('INTERNAL_SERVER_ERROR','Could not finish signing in. Please try Microsoft again.');await setSessionCookie(ctx,{session,user})};
 const startStateCookie='__Host-gw_microsoft_state',startPrefix='gw-microsoft-state:';
 return {id:'gw-microsoft-access',endpoints:{
  startMicrosoftAccess:createAuthEndpoint('/sign-in/cloudflare-microsoft',{method:'POST',requireHeaders:true},async ctx=>{
   sameOrigin(ctx);const state=randomToken(),at=now();
   await env.DB.prepare('INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),startPrefix+await sha256(state),'microsoft',at+600000,at,at).run();
   ctx.setCookie(startStateCookie,state,proofCookieOptions);return ctx.json({url:env.AUTH_ORIGIN+'/api/auth/callback/cloudflare-microsoft?state='+encodeURIComponent(state)});
  }),
  finishMicrosoftAccess:createAuthEndpoint('/callback/cloudflare-microsoft',{method:'GET',requireHeaders:true},async ctx=>{
   const state=new URL(ctx.request.url).searchParams.get('state');if(!state||state.length!==72||ctx.getCookie(startStateCookie)!==state)fail('BAD_REQUEST','This sign-in expired. Please start again.');
   let identity;try{identity=await verify(ctx.request.headers.get('cf-access-jwt-assertion'),env.AUTH_MICROSOFT_ACCESS_AUD)}catch{fail('UNAUTHORIZED','Microsoft identity could not be verified. Please try again or use an email code.')}
   const used=await env.DB.prepare('DELETE FROM verification WHERE identifier=? AND value=? AND expiresAt>? RETURNING id').bind(startPrefix+await sha256(state),'microsoft',now()).first();if(!used)fail('BAD_REQUEST','This sign-in was already used or expired.');
   ctx.setCookie(startStateCookie,'',{...proofCookieOptions,maxAge:0});
   const owner=await store.owner(identity.accountId);
   if(owner){if(!owner.emailVerified)fail('UNAUTHORIZED','Please sign in with an email code.');await issueSession(ctx,{...owner,emailVerified:true,createdAt:new Date(owner.createdAt),updatedAt:new Date(owner.updatedAt)});throw ctx.redirect(env.AUTH_ORIGIN)}
   // No user, linked account, session or email is created for an unproven mailbox.
   await store.cancel(ctx.getCookie(pendingCookie));const token=await store.create(identity);ctx.setCookie(pendingCookie,token,proofCookieOptions);
   throw ctx.redirect(env.AUTH_ORIGIN+'/?auth=microsoft-verify');
  }),
  microsoftProofStatus:createAuthEndpoint('/microsoft-proof/status',{method:'GET',requireHeaders:true},async ctx=>{
   const row=await pending(ctx);return ctx.json({csrf:row.data.csrf,emailHint:row.data.emailHint,name:row.data.name,codeSent:row.data.delivery==='sent'&&Boolean(row.data.otpHash),delivery:row.data.delivery||'none',generation:row.data.generation||'',email:row.data.email,expiresIn:Math.max(0,Math.floor((row.expiresAt-now())/1000))});
  }),
  sendMicrosoftProofCode:createAuthEndpoint('/microsoft-proof/send-code',{method:'POST',requireHeaders:true},async ctx=>{
   const row=await mutation(ctx),body=ctx.body||{},email=normalizeProofEmail(body.email);if(!email)fail('BAD_REQUEST','Enter an email address you can open.');
   if(row.expiresAt-now()<60000)fail('BAD_REQUEST','This sign-in is nearly expired. Please start again before requesting a code.');
   if(row.data.sends>=3||row.data.attempts>=3)fail('TOO_MANY_REQUESTS','This sign-in has reached its limit. Please start again.');
   if(row.data.lastSent&&now()-row.data.lastSent<60000)fail('TOO_MANY_REQUESTS','Wait a minute before requesting another code.');
   for(const [key,rule] of [['gw-ms-email:'+await sha256(email),{window:600,max:3}],['gw-ms-subject:'+await sha256(row.data.accountId),{window:3600,max:6}]])if(!(await consumeRate(key,rule)).allowed)fail('TOO_MANY_REQUESTS','Too many code requests. Please try again later.');
   let code,otpHash;const history=row.data.codeHistory||[];for(let attempt=0;attempt<10;attempt++){code=randomCode();otpHash=await codeDigest(env.BETTER_AUTH_SECRET||env.PAYLOAD_SECRET,row.identifier,code);if(!history.includes(otpHash))break}if(history.includes(otpHash))fail('SERVICE_UNAVAILABLE','Could not prepare a new code. Please start again.');
   const data={...row.data,email,otpHash,generation:randomToken(),delivery:'pending',codeHistory:[...history,otpHash],sends:row.data.sends+1,lastSent:now()};
   if(!await store.replace(row,data))fail('BAD_REQUEST','This sign-in changed. Refresh and try again.');
   const saved={...row,value:JSON.stringify(data)};
   try{await sendCode(email,code)}catch{await store.replace(saved,{...data,delivery:'failed',otpHash:''});fail('SERVICE_UNAVAILABLE','The code could not be sent. Please wait a minute and try again.')}
   if(!await store.replace(saved,{...data,delivery:'sent'}))fail('BAD_REQUEST','This code request changed or expired. Refresh and try again.');
   return ctx.json({sent:true,email,generation:data.generation,expiresIn:Math.max(0,Math.floor((row.expiresAt-now())/1000))});
  }),
  completeMicrosoftProof:createAuthEndpoint('/microsoft-proof/complete',{method:'POST',requireHeaders:true},async ctx=>{
   const current=await mutation(ctx),body=ctx.body||{};
   const matches=data=>typeof body.email==='string'&&body.email===data.email&&typeof body.generation==='string'&&body.generation.length===72&&body.generation===data.generation;
   if(!matches(current.data))fail('BAD_REQUEST','This verification changed in another tab. Refresh and confirm the email again.');
   if(body.connectMicrosoft!==true)fail('BAD_REQUEST','Confirm that you want to connect Microsoft to your family account.');
   if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))fail('BAD_REQUEST','Enter the six-digit code from your email.');
   // Atomically reserve one of three guesses before comparing, including concurrent requests.
   const row=await store.attempt(ctx.getCookie(pendingCookie),{email:body.email,generation:body.generation});if(!row)fail('BAD_REQUEST','This code expired or reached its attempt limit. Please start again.');
   if(!matches(row.data))fail('BAD_REQUEST','This verification changed in another tab. Refresh and confirm the email again.');
   const candidate=await codeDigest(env.BETTER_AUTH_SECRET||env.PAYLOAD_SECRET,row.identifier,body.code);
   if(candidate!==row.data.otpHash)fail('UNAUTHORIZED','That code did not match. Check your email and try again.');
   if(!await store.consume(row))fail('BAD_REQUEST','This code was already used or replaced. Please start again.');
   let user;try{user=await store.finalize(row.data)}catch(error){fail('CONFLICT',['Sign in with an email code before connecting Microsoft to this account.','This Microsoft account is already connected elsewhere. Please start again.'].includes(error.message)?error.message:'Could not connect Microsoft. Please start again.')}
   ctx.setCookie(pendingCookie,'',{...proofCookieOptions,maxAge:0});await issueSession(ctx,user);return ctx.json({complete:true,url:env.AUTH_ORIGIN});
  }),
  cancelMicrosoftProof:createAuthEndpoint('/microsoft-proof/cancel',{method:'POST',requireHeaders:true},async ctx=>{
   sameOrigin(ctx);const row=await store.read(ctx.getCookie(pendingCookie));if(row&&ctx.request.headers.get('X-GW-Auth-CSRF')!==row.data.csrf)fail('FORBIDDEN','Refresh this sign-in page and try again.');
   await store.cancel(ctx.getCookie(pendingCookie));ctx.setCookie(pendingCookie,'',{...proofCookieOptions,maxAge:0});return ctx.json({cancelled:true});
  })
 }};
}
