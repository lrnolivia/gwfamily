import {recordAuthDatabaseError} from './error-diagnostics.mjs';

// Request-local observation of the pinned Better Auth D1 adapter boundary.
// Native receivers and prepared statements stay intact. Failures are reported
// before the adapter/auth layers can replace them, then rethrown unchanged.
// No SQL, arguments, result rows or successful operations are logged.
export function instrumentAuthD1(database,context={},log=console.error){
 if(!database||typeof database.prepare!=='function')return database;
 const originals=new WeakMap(),proxies=new WeakMap();
 const report=(error,operation)=>{try{recordAuthDatabaseError(error,context,operation,log)}catch{/* Observation cannot replace the original failure. */}};
 const sync=(operation,call)=>{try{return call()}catch(error){report(error,operation);throw error}};
 const asyncCall=async(operation,call)=>{try{return await call()}catch(error){report(error,operation);throw error}};
 const statement=original=>{
  if(proxies.has(original))return proxies.get(original);
  const methods=new Map();
  const proxy=new Proxy(original,{get(target,key){
   const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;
   if(methods.has(key))return methods.get(key);
   const method=key==='bind'?(...args)=>statement(sync('bind',()=>Reflect.apply(value,target,args))):
    ['all','first','run','raw'].includes(key)?(...args)=>asyncCall(key,()=>Reflect.apply(value,target,args)):value.bind(target);
   methods.set(key,method);return method;
  }});
  originals.set(proxy,original);proxies.set(original,proxy);return proxy;
 };
 const methods=new Map();
 return new Proxy(database,{get(target,key){
  const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;
  if(methods.has(key))return methods.get(key);
  let method;
  if(key==='prepare')method=(...args)=>statement(sync('prepare',()=>Reflect.apply(value,target,args)));
  else if(key==='batch')method=(items,...args)=>asyncCall('batch',()=>Reflect.apply(value,target,[Array.isArray(items)?items.map(item=>originals.get(item)||item):items,...args]));
  else if(key==='exec')method=(...args)=>asyncCall('exec',()=>Reflect.apply(value,target,args));
  else method=value.bind(target);
  methods.set(key,method);return method;
 }});
}
