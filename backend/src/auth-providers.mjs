// Public capabilities contain no keys, secrets, tenant IDs, or Access audiences.
const labels={google:'Google',apple:'Apple',microsoft:'Microsoft',yahoo:'Yahoo'};
const audience=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);
const pair=(env,id)=>Boolean(env[`${id}_CLIENT_ID`]&&env[`${id}_CLIENT_SECRET`]);
export function accessProviderConfig(env,provider){
 if(!['google','microsoft','yahoo'].includes(provider))return null;
 const prefix=`AUTH_${provider.toUpperCase()}_ACCESS`;
 if(!audience(env[`${prefix}_AUD`]))return null;
 // Existing Google is already configured. New providers remain off until setup is verified.
 if(provider!=='google'&&env[`${prefix}_ENABLED`]!=='true')return null;
 if(provider==='microsoft'&&(env.AUTH_EMAIL_ENABLED!=='true'||!env.EMAIL))return null;
 // Each provider must have its own application audience; never reuse Google's gate.
 if(provider!=='google'&&['google','microsoft','yahoo'].some(id=>id!==provider&&env[`AUTH_${id.toUpperCase()}_ACCESS_AUD`]===env[`${prefix}_AUD`]))return null;
 return {id:provider,label:labels[provider],audience:env[`${prefix}_AUD`],accountProvider:`cloudflare-${provider}`,cookieName:`__Host-gw_${provider}_state`,statePrefix:`gw-${provider}-state:`,startPath:`/sign-in/cloudflare-${provider}`,callbackPath:`/callback/cloudflare-${provider}`};
}
export function configuredAuthProviders(env){
 const providers=[];
 for(const id of ['google','apple','microsoft','yahoo']){
  if(accessProviderConfig(env,id)){providers.push({id,label:labels[id],mode:'access'});continue}
  if(id==='google'&&pair(env,'GOOGLE')||id==='apple'&&pair(env,'APPLE'))providers.push({id,label:labels[id],mode:'native'});
  // Consumer Microsoft support must be intentional rather than an enterprise default.
  if(id==='microsoft'&&pair(env,'MICROSOFT')&&env.AUTH_MICROSOFT_NATIVE_ENABLED==='true'&&['consumers','common'].includes(env.MICROSOFT_TENANT_ID))providers.push({id,label:labels[id],mode:'native'});
 }
 return providers;
}
export function publicAuthConfig(env,ready){
 const providerMethods=ready?configuredAuthProviders(env):[];
 return {configured:Boolean(ready),email:Boolean(ready&&env.AUTH_EMAIL_ENABLED==='true'&&env.EMAIL),providers:providerMethods.map(p=>p.id),providerMethods,googleMode:providerMethods.find(p=>p.id==='google')?.mode||'native',origin:env.AUTH_ORIGIN};
}
export function accessProviderRateRules(env){
 return Object.fromEntries(['google','microsoft','yahoo'].flatMap(id=>{const p=accessProviderConfig(env,id);return p?[[p.startPath,{window:300,max:6}],[p.callbackPath,{window:300,max:12}]]:[]}));
}
