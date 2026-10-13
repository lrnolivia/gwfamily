// Presentation capability only. This uses the existing bootstrap-owner email
// gate and never grants a role, membership, permission, or write capability.
export function canRehearseFirstLoad(environment,session,member){
 const ownerEmail=environment?.BOOTSTRAP_OWNER_EMAIL,email=session?.user?.email;
 return session?.user?.emailVerified===true&&member?.status==='active'&&
  typeof ownerEmail==='string'&&Boolean(ownerEmail)&&typeof email==='string'&&
  ownerEmail.toLowerCase()===email.toLowerCase();
}
