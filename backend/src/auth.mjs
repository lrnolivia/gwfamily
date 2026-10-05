import {googleAccess} from './google-access.mjs';
import { betterAuth } from 'better-auth';
import { emailOTP, magicLink } from 'better-auth/plugins';

export function authEnvironment(env) {
  return { ...env, DB: env.DB || env.D1,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET || env.PAYLOAD_SECRET,
    AUTH_ORIGIN: env.AUTH_ORIGIN || 'https://greenwhitefamily.com' };
}
export function authReady(env) {
  const e = authEnvironment(env);
  return Boolean(e.DB && e.BETTER_AUTH_SECRET && /^https:\/\//.test(e.AUTH_ORIGIN));
}
export function createRateStorage(db) {
  return { async consume(key, rule) {
    const now = Date.now(), until = now + rule.window * 1000;
    const row = await db.prepare(`INSERT INTO app_rate_limits(key,count,reset_at) VALUES(?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,
      reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count,reset_at`)
      .bind(key, until, now, now).first();
    return {allowed: row.count <= rule.max, retryAfter: row.count <= rule.max ? null : Math.max(1,Math.ceil((row.reset_at-now)/1000))};
  }};
}
export function createAuth(rawEnv) {
  const env = authEnvironment(rawEnv);
  if (!authReady(env)) throw new Error('Authentication is not configured');
  const providers = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) providers.google = {clientId:env.GOOGLE_CLIENT_ID,clientSecret:env.GOOGLE_CLIENT_SECRET};
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) providers.apple = {clientId:env.APPLE_CLIENT_ID,clientSecret:env.APPLE_CLIENT_SECRET};
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) providers.microsoft = {clientId:env.MICROSOFT_CLIENT_ID,clientSecret:env.MICROSOFT_CLIENT_SECRET};
  const send = async (email,subject,text,html) => {
    if (!env.EMAIL || env.AUTH_EMAIL_ENABLED !== 'true') throw new Error('Email sign-in is not enabled');
    await env.EMAIL.send({from:{email:'family@greenwhitefamily.com',name:'Green & White Family'},to:email,subject,text,html});
  };
  return betterAuth({
    database: env.DB, secret: env.BETTER_AUTH_SECRET, baseURL: env.AUTH_ORIGIN,
    trustedOrigins:[env.AUTH_ORIGIN,...(providers.apple?['https://appleid.apple.com']:[])], emailAndPassword:{enabled:false}, socialProviders:providers,
    account:{accountLinking:{enabled:false}},
    session:{expiresIn:60*60*24*7,updateAge:60*60*24,cookieCache:{enabled:false}},
    advanced:{useSecureCookies:true,ipAddress:{ipAddressHeaders:['cf-connecting-ip']}},
    rateLimit:{enabled:true,window:60,max:30,customStorage:createRateStorage(env.DB),customRules:{
      '/sign-in/cloudflare-google':{window:300,max:6},'/callback/cloudflare-google':{window:300,max:12},'/sign-in/magic-link':{window:300,max:3},'/email-otp/send-verification-otp':{window:300,max:3},'/sign-in/email-otp':{window:300,max:8}
    }},
    plugins:[...(env.AUTH_GOOGLE_ACCESS_AUD?[googleAccess(env)]:[]),
      emailOTP({expiresIn:600,otpLength:6,allowedAttempts:3,storeOTP:'hashed',sendVerificationOTP:async({email,otp})=>
        send(email,'Your Green & White sign-in code',`Your code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`,
          `<p>Your Green &amp; White sign-in code:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${otp}</p><p>It expires in 10 minutes. If you did not request this, ignore this email.</p>`)}),
      magicLink({expiresIn:600,storeToken:'hashed',sendMagicLink:async({email,url})=>{
        const safe = new URL(url); if(safe.origin!==env.AUTH_ORIGIN)throw new Error('Invalid sign-in origin');
        const escaped=safe.href.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
        return send(email,'Sign in to Green & White',`Sign in: ${safe.href}\nThis link works once and expires in 10 minutes. If you did not request it, ignore this email.`,
          `<p><a href="${escaped}">Sign in to Green &amp; White</a></p><p>This link works once and expires in 10 minutes. If you did not request it, ignore this email.</p>`);
      }})
    ],user:{deleteUser:{enabled:false}}
  });
}
