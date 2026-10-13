// Loaded only by automated test processes. Deployment/migration CLIs do not
// import this module; explicit release operations retain their normal access.
import {createRequire,syncBuiltinESMExports} from 'node:module';
const loopback=url=>['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);
export function assertTestEnvironment(env=process.env){
 for(const [key,value] of Object.entries(env)){
  if(!value)continue;
  if(/^GW_.*(?:_URL|_ORIGIN)$/.test(key)&&!loopback(value))throw Error('Automated fixture target must be loopback: '+key);
  if(/^(?:GW_TEST_|GW_|CLOUDFLARE_)?D1_DATABASE_ID$/.test(key)&&value!==':memory:'&&!value.startsWith('fixture-'))throw Error('Automated D1 target must be isolated fixture storage');
  if(/^(?:GW_TEST_|GW_)?R2_BUCKET$/.test(key)&&!value.startsWith('gwfamily-fixture-'))throw Error('Automated R2 target must be isolated fixture storage');
 }
}
export function assertTestRequest(url,method='GET'){
 if(!['GET','HEAD','OPTIONS'].includes(String(method).toUpperCase())&&!loopback(url))throw Error('Automated mutations may only target loopback fixtures; production smoke is read-only');
}
assertTestEnvironment();
const fetcher=globalThis.fetch;
if(fetcher)globalThis.fetch=(input,init)=>{assertTestRequest(typeof input==='string'||input instanceof URL?input:input.url,init?.method||input?.method||'GET');return fetcher(input,init)};
const require=createRequire(import.meta.url);
for(const protocol of ['http','https']){
 const api=require('node:'+protocol),request=api.request;
 api.request=(input,options,...rest)=>{
  const opts=typeof input==='object'&&!(input instanceof URL)?input:typeof options==='object'?options:{};
  const url=typeof input==='string'||input instanceof URL?input:`${opts.protocol||protocol+':'}//${opts.hostname||opts.host||'localhost'}${opts.port?':'+opts.port:''}${opts.path||'/'}`;
  assertTestRequest(url,opts.method||'GET');return request(input,options,...rest);
 };
}
syncBuiltinESMExports();
