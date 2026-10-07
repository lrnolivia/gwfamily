export function createMicrosoftProofClient(fetcher=fetch){
 async function request(path,{csrf,body}={}){
  const response=await fetcher('/api/auth/microsoft-proof/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{...(body?{'Content-Type':'application/json','X-GW-Auth-CSRF':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
  let value;try{value=await response.json()}catch{throw Error('Could not read the sign-in response. Please try again.')}
  if(!response.ok)throw Error(value?.message||value?.error?.message||'Could not complete this sign-in. Please try again.');return value;
 }
 return {status:()=>request('status'),send:(csrf,email)=>request('send-code',{csrf,body:{email}}),complete:(csrf,code,connectMicrosoft,email,generation)=>request('complete',{csrf,body:{code,connectMicrosoft,email,generation}}),cancel:csrf=>request('cancel',{csrf,body:{}})};
}
