// Reuse unchanged JSON snapshot nodes; a poll is not a new screen/session.
// Server removals and authorization changes are retained exactly.
export function shareUnchangedSnapshot(previous,next){
 if(Object.is(previous,next))return previous;
 if(!previous||!next||typeof previous!=='object'||typeof next!=='object')return next;
 if(Array.isArray(previous)!==Array.isArray(next))return next;
 if(Array.isArray(next)){
  const value=next.map((item,index)=>shareUnchangedSnapshot(previous[index],item));
  return previous.length===value.length&&value.every((item,index)=>Object.is(item,previous[index]))?previous:value;
 }
 const keys=Object.keys(next),priorKeys=Object.keys(previous);let unchanged=keys.length===priorKeys.length;
 const result={};for(const key of keys){result[key]=shareUnchangedSnapshot(previous[key],next[key]);if(!Object.prototype.hasOwnProperty.call(previous,key)||!Object.is(result[key],previous[key]))unchanged=false}
 return unchanged?previous:result;
}
export function refreshingPageRecord(record){return record?.status==='ready'?{...record,refreshing:true,error:'',errorKind:null,requestId:null}:{...record,status:'loading',refreshing:false,error:'',errorKind:null,requestId:null}}
