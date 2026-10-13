// Dependency-injected bridge allows offline synthetic tests without a browser or network.
const cookieOptions={path:'/',secure:true,httpOnly:true,sameSite:'lax',maxAge:600};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
export function buildAccessBridge(env,provider,{createAuthEndpoint,APIError,setSessionCookie,verify}){
 if(!provider)throw Error('Sign-in is not configured');
 const title=provider.id[0].toUpperCase()+provider.id.slice(1);
 return {id:`gw-${provider.id}-access`,endpoints:{
  [`start${title}Access`]:createAuthEndpoint(provider.startPath,{method:'POST',requireHeaders:true},async ctx=>{
   if(ctx.request.headers.get('Origin')!==env.AUTH_ORIGIN)throw new APIError('FORBIDDEN',{message:'Start sign-in from the family website.'});
   const state=crypto.randomUUID()+crypto.randomUUID(),key=provider.statePrefix+await digest(state),now=Date.now();
   await env.DB.prepare('INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),key,provider.id,now+600000,now,now).run();
   ctx.setCookie(provider.cookieName,state,cookieOptions);
   return ctx.json({url:env.AUTH_ORIGIN+'/api/auth'+provider.callbackPath+'?state='+encodeURIComponent(state)});
  }),
  [`finish${title}Access`]:createAuthEndpoint(provider.callbackPath,{method:'GET',requireHeaders:true},async ctx=>{
   const state=new URL(ctx.request.url).searchParams.get('state'),cookie=ctx.getCookie(provider.cookieName);
   if(!state||state.length!==72||cookie!==state)throw new APIError('BAD_REQUEST',{message:'This sign-in expired. Return to the family website and try again.'});
   let identity;
   try{identity=await verify(ctx.request.headers.get('cf-access-jwt-assertion'),provider.audience)}catch{throw new APIError('UNAUTHORIZED',{message:`${provider.label} identity could not be verified. Please use an email code or try again.`})}
   const row=await env.DB.prepare('DELETE FROM verification WHERE identifier=? AND value=? AND expiresAt>? RETURNING id').bind(provider.statePrefix+await digest(state),provider.id,Date.now()).first();
   if(!row)throw new APIError('BAD_REQUEST',{message:'This sign-in was already used or expired. Please start again.'});
   ctx.setCookie(provider.cookieName,'',{...cookieOptions,maxAge:0});
   const adapter=ctx.context.internalAdapter,owned=await adapter.findAccountOwnerByKey({providerId:provider.accountProvider,accountId:identity.sub});
   let user=owned?.kind==='owned'?owned.user:null;
   if(!user){
    if(owned)throw new APIError('CONFLICT',{message:'This identity needs account recovery.'});
    if(await adapter.findUserByEmail(identity.email))throw new APIError('CONFLICT',{message:'This email already has a family account. Use its email code to sign in; accounts are not linked automatically.'});
    // A missing provider display name stays blank for the editable enrollment form.
    // Never infer a name from a username/email, and never change an existing chosen name.
    const created=await adapter.createOAuthUser({email:identity.email,emailVerified:true,name:identity.name||''},{providerId:provider.accountProvider,accountId:identity.sub});
    user=created.user;
   }
   const session=await adapter.createSession(user.id);
   if(!session)throw new APIError('INTERNAL_SERVER_ERROR',{message:'Could not finish signing in.'});
   await setSessionCookie(ctx,{session,user});throw ctx.redirect(env.AUTH_ORIGIN);
  })
 }};
}
