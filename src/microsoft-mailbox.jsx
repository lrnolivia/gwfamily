import React,{useEffect,useRef,useState} from 'react';
import {createMicrosoftProofClient} from './microsoft-proof-client.mjs';
const client=createMicrosoftProofClient();
export function MicrosoftMailbox(){
 const [pending,setPending]=useState(null),[email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true),[deadline,setDeadline]=useState(0),[remaining,setRemaining]=useState(0),lock=useRef(false);
 useEffect(()=>{let current=true;client.status().then(value=>{if(!current)return;setPending(value);setEmail(value.email||value.emailHint||'');setSent(value.codeSent);setDeadline(Date.now()+value.expiresIn*1000);if(value.delivery==='failed')setError('The previous code could not be sent. Wait a minute and try again.')}).catch(error=>{if(current)setError(error.message)}).finally(()=>{if(current)setLoading(false)});return()=>{current=false}},[]);
 useEffect(()=>{if(!deadline)return;const tick=()=>setRemaining(Math.max(0,Math.ceil((deadline-Date.now())/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[deadline]);
 async function run(action){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action()}catch(error){setError(error.message)}finally{lock.current=false;setBusy(false)}}
 function send(event){event.preventDefault();void run(async()=>{const result=await client.send(pending.csrf,email);setEmail(result.email);setPending(value=>({...value,generation:result.generation,email:result.email}));setDeadline(Date.now()+result.expiresIn*1000);setCode('');setSent(true);setConfirmed(false)})}
 function finish(event){event.preventDefault();void run(async()=>{const result=await client.complete(pending.csrf,code,confirmed,email,pending.generation);if(result.complete!==true)throw Error('Could not finish sign-in. Please try again.');location.replace(location.origin+'/')})}
 function cancel(){void run(async()=>{await client.cancel(pending?.csrf);location.replace(location.origin+'/')})}
 return <main className="app-shell"><section className="onboard card"><form className="gw-form sign-in-form" onSubmit={sent?finish:send} aria-busy={busy||loading}>
  <div className="form-heading"><p>Green &amp; White Family</p><h1>{sent?'Check your email.':'Confirm your email once.'}</h1><p>Microsoft has confirmed your account. We also need to check the email you’ll use for your family account. Next time, this Microsoft account can sign you in directly.</p></div>
  {pending&&deadline>0&&<p className="field-help" role={remaining===0?'alert':undefined}>{remaining===0?'This sign-in has expired. Return to sign-in and start again.':remaining<60?'Less than a minute remains to finish this verification.':`This verification expires in about ${Math.ceil(remaining/60)} minutes.`}</p>}
  {loading?<p role="status">Opening your secure sign-in…</p>:pending&&<>
   {!sent?<><label>Your family account email<input type="email" autoComplete="email" maxLength="320" required value={email} onChange={event=>setEmail(event.target.value)} disabled={busy}/></label><p className="field-help">Use your existing Green &amp; White email if you’ve joined before. You can change the address suggested by Microsoft.</p><button className="button form-primary" type="submit" disabled={busy}>{busy?'Sending…':'Email me a verification code'}</button></>:<>
    <p>Enter the six-digit code sent to {email}. Check Junk or Spam if it hasn’t arrived.</p>
    <label>Email verification code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" required value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} disabled={busy}/></label>
    <label className="check-row"><input type="checkbox" required checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} disabled={busy}/><span>Connect this Microsoft account to my Green &amp; White account for {email}.<small>If I’ve already joined, this adds Microsoft sign-in to that account and keeps my profile as it is.</small></span></label>
    <button className="button form-primary" type="submit" disabled={busy||!confirmed||remaining===0}>{busy?'Verifying…':'Verify email and connect Microsoft'}</button>
    <button className="text-button" type="button" disabled={busy} onClick={()=>{setSent(false);setCode('');setConfirmed(false);setError('')}}>Change email or request another code</button>
   </>}
   <button className="text-button" type="button" disabled={busy} onClick={cancel}>Cancel Microsoft sign-in</button>
  </>}
  {error&&<p className="form-error" role="alert">{error}</p>}{!loading&&(!pending||remaining===0)&&<a className="button" href="/">Return to sign-in</a>}
  <p className="field-help">New members still need an organizer’s approval. This step won’t give anyone additional family permissions.</p>
 </form></section></main>;
}
