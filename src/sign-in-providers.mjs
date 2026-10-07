const labels={google:'Google',apple:'Apple',microsoft:'Microsoft',yahoo:'Yahoo'};
export function signInProviders(config){
 if(!config?.configured)return [];
 if(Array.isArray(config.providerMethods)){
  const seen=new Set();
  return config.providerMethods.flatMap(value=>{
   if(!value||!Object.hasOwn(labels,value.id)||seen.has(value.id)||!['access','native'].includes(value.mode)||value.mode==='access'&&value.id==='apple'||value.mode==='native'&&value.id==='yahoo')return [];
   seen.add(value.id);return [{id:value.id,label:labels[value.id],mode:value.mode}];
  });
 }
 // Old API compatibility during rolling deployment. Yahoo has no legacy implementation.
 return [...new Set(Array.isArray(config.providers)?config.providers:[])].filter(id=>['google','apple','microsoft'].includes(id)).map(id=>({id,label:labels[id],mode:id==='google'&&config.googleMode==='access'?'access':'native'}));
}
export function signInRequest(config,id){
 const provider=signInProviders(config).find(p=>p.id===id);
 if(!provider)throw Error('This sign-in option is not available. Please use an email code.');
 if(provider.mode==='access')return {path:`/api/auth/sign-in/cloudflare-${id}`,body:{}};
 const origin=new URL(config.origin);
 if(origin.protocol!=='https:'||origin.username||origin.password)throw Error('Sign-in could not start. Please try again.');
 return {path:'/api/auth/sign-in/social',body:{provider:id,callbackURL:origin.origin}};
}
