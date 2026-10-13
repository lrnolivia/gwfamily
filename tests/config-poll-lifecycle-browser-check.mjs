import './test-environment-guard.mjs';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';

export async function checkConfigPollLifecycle(browser,base){
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  const intervals=new Map(),nativeSet=window.setInterval,nativeClear=window.clearInterval,nativeFetch=window.fetch;
  const state=window.__configPollCheck={pending:0,calls:[],tick(){for(const callback of intervals.values())callback()}};
  window.setInterval=(callback,delay,...args)=>{const id=nativeSet(callback,delay,...args);if(delay===15000)intervals.set(id,()=>callback(...args));return id};
  window.clearInterval=id=>{intervals.delete(id);return nativeClear(id)};
  window.fetch=async(...args)=>{
   const path=new URL(args[0] instanceof Request?args[0].url:args[0],location.href).pathname;
   const tracked=['/api/config','/api/session','/api/state'].includes(path);
   if(tracked){state.pending++;state.calls.push(path)}
   try{return await nativeFetch(...args)}finally{if(tracked)state.pending--}
  };
  localStorage.setItem('gw-install-dismissed','true');localStorage.setItem('gw-preview-notice:v1','seen');
 });
 try{
  await page.goto(`${base}/__test/signin?user=alice`);
  await page.getByRole('navigation',{name:'Main navigation',exact:true}).waitFor();
  await expect.poll(()=>page.evaluate(()=>({pending:__configPollCheck.pending,state:__configPollCheck.calls.includes('/api/state')}))).toEqual({pending:0,state:true});
  // Invoke the real registered callbacks at the observed boundary. Normal
  // intervals remain enabled; no sleeps, request stubs or ignored page errors.
  const leaving=await page.evaluate(()=>{
   const check=window.__configPollCheck;dispatchEvent(new Event('beforeunload'));check.calls=[];check.tick();return check.calls;
  });
  assert.deepEqual(leaving,[],'Config/session/state polls do not start after beforeunload.');
  const cached=await page.evaluate(()=>{
   dispatchEvent(new Event('pagehide'));dispatchEvent(new Event('focus'));__configPollCheck.tick();return __configPollCheck.calls;
  });
  assert.deepEqual(cached,[],'Focus cannot restart reads in a cached document.');
  await page.evaluate(()=>{dispatchEvent(new Event('pageshow'));__configPollCheck.tick()});
  await expect.poll(()=>page.evaluate(()=>({pending:__configPollCheck.pending,state:__configPollCheck.calls.includes('/api/state')}))).toEqual({pending:0,state:true});
  assert.deepEqual(errors,[],'Lifecycle regression has no browser errors.');
 }finally{await context.close()}
}
