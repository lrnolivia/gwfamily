import {ProfileStyleEditor} from './profiles.jsx';
import React,{useState,useEffect,useRef} from 'react';
import {Control,Button} from './ui-core.jsx';

// Presentation and tab-local draft only. The caller owns the explicit save.
// This component cannot enroll, upload, authenticate, invite, or persist data.
export function EnrollmentForm({initialName='',onSave,saveLabel='Finish joining',savingLabel='Saving your profile…',skipLabel='Skip for now',draftNotice=''}){
 const [step,setStep]=useState(1),[name,setName]=useState(initialName),[birthday,setBirthday]=useState(''),[celebrate,setCelebrate]=useState(false),[accepted,setAccepted]=useState(false),[color,setColor]=useState('#4f996c'),[file,setFile]=useState(null),[photo,setPhoto]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),saveLock=useRef(false);
 useEffect(()=>()=>{if(photo?.startsWith('blob:'))URL.revokeObjectURL(photo)},[photo]);
 async function finish(appearance=true){
  if(saveLock.current)return;saveLock.current=true;setBusy(true);setError('');
  try{await onSave({name,birthday,privacyAccepted:accepted,birthdayCelebration:celebrate,profileColor:appearance?color:'#4f996c',file:appearance?file:null,photo:appearance?photo:null})}
  catch(e){setError(e.message||'Your profile could not be saved. Please try again.')}
  finally{saveLock.current=false;setBusy(false)}
 }
 return <form className="gw-form enrollment-form" onSubmit={e=>{e.preventDefault();if(step===1){setError('');setStep(2)}else void finish()}}>
  {draftNotice&&<p className="first-load-draft-note" role="note">{draftNotice}</p>}
  <div className="onboarding-progress" aria-label={'Step '+step+' of 2'}><span className={step===1?'current':''}>1 · Your details</span><span className={step===2?'current':''}>2 · Your profile</span></div>
  {step===1?<><div className="form-heading"><h1>A little about you.</h1><p>Your full birthday stays private.</p></div>
   <label>Your name<input required maxLength="80" autoComplete={draftNotice?'off':'name'} value={name} onChange={e=>setName(e.target.value)}/></label>
   <label>Birthday<input type="date" required min="1900-01-01" max={new Date().toISOString().slice(0,10)} value={birthday} onChange={e=>setBirthday(e.target.value)}/></label>
   <label className="check-row"><input type="checkbox" checked={celebrate} onChange={e=>setCelebrate(e.target.checked)}/><span>Let the family celebrate my birthday.<small>Optional. Shares month and day and adds a birthday post for adults.</small></span></label>
   <label className="check-row"><input type="checkbox" required checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>I understand this profile is for approved family members. My full birthday and household details stay private.</span></label>
   <Control type="submit" className="button form-primary">Continue</Control>
  </>:<><div className="form-heading"><h1>Make it yours.</h1><p>Add a photo and pick your color. Both are optional.</p></div>
   <ProfileStyleEditor name={name} photo={photo} color={color} onColor={setColor} onRemove={()=>{setFile(null);setPhoto(null)}} busy={busy} onPhoto={async next=>{
    if(!['image/jpeg','image/png','image/webp','image/gif'].includes(next.type)||next.size>10*1024*1024){setError('Choose a JPEG, PNG, WebP or GIF photo under 10 MB.');return}
    setError('');setFile(next);setPhoto(URL.createObjectURL(next));
   }}/>
   <div className="form-save"><Control type="submit" className="button form-primary" disabled={busy}>{busy?savingLabel:saveLabel}</Control><div className="onboarding-secondary"><Button secondary disabled={busy} onClick={()=>setStep(1)}>Back</Button><Control className="text-button" type="button" disabled={busy} onClick={()=>finish(false)}>{skipLabel}</Control></div></div>
  </>}
  {error&&<p role="alert" className="form-error">{error}</p>}
 </form>;
}
