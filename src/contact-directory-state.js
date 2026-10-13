// A failed or pending read is unknown, never evidence of an empty directory.
export function directoryView(result,account,selfId){
 if(!result||result.account!==account||result.status==='loading'||result.status==='idle')return {status:'loading',cards:[],empty:false,error:''};
 if(result.status==='error')return {status:'error',cards:[],empty:false,error:result.error};
 if(result.status!=='ready'||!Array.isArray(result.cards))return {status:'error',cards:[],empty:false,error:'Contact cards could not be read. Try again.'};
 const cards=result.cards.filter(card=>card.memberId!==selfId);
 return {status:'ready',cards,empty:cards.length===0,error:''};
}
