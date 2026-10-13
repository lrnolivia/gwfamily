// A server-issued presentation capability, never a client authorization rule.
export function mayRehearseFirstLoad(session){
 return session?.canRehearseFirstLoad===true&&session?.signedIn===true&&
  session?.verified===true&&session?.status==='active'&&
  typeof session?.user?.id==='string'&&Boolean(session.user.id);
}

export function firstLoadView(data,state,entryReview=null,entryLoading=false){
 const canFreshStart=!data.preview&&data.config?.configured===true&&mayRehearseFirstLoad(data.session);
 const entryReviewCurrent=canFreshStart&&entryReview?.accountId===data.session?.user?.id;
 const rehearsing=entryReviewCurrent&&entryReview.mode==='rehearsal';
 const entryHydrating=!data.preview&&data.session?.status==='active'&&(state.mode!=='live'||state.selfId!==data.session?.user?.id);
 const showFirstLoad=!rehearsing&&(Boolean(data.loading)||entryLoading||entryHydrating||entryReviewCurrent);
 const entryLoadError=entryHydrating&&!data.loading&&!entryLoading?data.error||'':'';
 return {canFreshStart,entryReviewCurrent,rehearsing,entryHydrating,showFirstLoad,entryLoadError,entryBusy:(Boolean(data.loading)||entryLoading||entryHydrating)&&!entryLoadError};
}

// Rehearsal lives only in this mounted view. No storage, real account fields,
// shared adapter, network, or side-effect-bearing action is carried into it.
export const freshRehearsal=()=>({stage:'welcome',draft:null});
export function rehearsalTransition(state,action){
 if(action?.type==='START'&&state.stage==='welcome')return {stage:'profile',draft:null};
 if(action?.type==='SAVE_DRAFT'&&state.stage==='profile'){
  const value=action.values||{};
  return {stage:'ready',draft:{name:String(value.name||''),birthday:String(value.birthday||''),privacyAccepted:value.privacyAccepted===true,birthdayCelebration:value.birthdayCelebration===true,profileColor:String(value.profileColor||'#4f996c'),photoChosen:typeof value.photo==='string'&&value.photo.startsWith('blob:')}};
 }
 return state;
}
