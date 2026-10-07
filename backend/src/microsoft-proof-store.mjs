export const microsoftProviderId='cloudflare-microsoft';
export const pendingCookie='__Host-gw_microsoft_proof';
export const proofCookieOptions={path:'/',secure:true,httpOnly:true,sameSite:'lax',maxAge:600};
export const sha256=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
export const randomToken=()=>crypto.randomUUID()+crypto.randomUUID();
export function normalizeProofEmail(value){
 if(typeof value!=='string')return '';
 const email=value.trim().toLowerCase();return email.length<=320&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'';
}
export function randomCode(){const bytes=new Uint32Array(1);do{crypto.getRandomValues(bytes)}while(bytes[0]>=4294000000);return String(bytes[0]%1000000).padStart(6,'0')}
export async function codeDigest(secret,key,code){
 if(typeof secret!=='string'||secret.length<16)throw Error('Sign-in is not configured');
 const keyData=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',keyData,new TextEncoder().encode(key+':'+code))),x=>x.toString(16).padStart(2,'0')).join('');
}
export function createMicrosoftProofStore(db,now=Date.now){
 const keyFor=async token=>typeof token==='string'&&token.length===72?'gw-ms-proof:'+await sha256(token):null;
 return {
  async create(identity){
   await db.prepare("DELETE FROM verification WHERE identifier LIKE 'gw-ms-proof:%' AND expiresAt<=?").bind(now()).run();
   const token=randomToken(),key=await keyFor(token),at=now(),data={accountId:identity.accountId,name:identity.name||'',emailHint:identity.emailHint||'',csrf:randomToken(),sends:0,attempts:0,lastSent:0,email:'',otpHash:''};
   await db.prepare('INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),key,JSON.stringify(data),at+600000,at,at).run();return token;
  },
  async read(token){const key=await keyFor(token);if(!key)return null;const row=await db.prepare('SELECT id,identifier,value,expiresAt FROM verification WHERE identifier=? AND expiresAt>?').bind(key,now()).first();return row?{...row,data:JSON.parse(row.value)}:null},
  async replace(row,data){return Boolean(await db.prepare('UPDATE verification SET value=?,updatedAt=? WHERE id=? AND value=? AND expiresAt>? RETURNING id').bind(JSON.stringify(data),now(),row.id,row.value,now()).first())},
  async attempt(token,expected){const key=await keyFor(token);if(!key)return null;const row=await db.prepare("UPDATE verification SET value=json_set(value,'$.attempts',json_extract(value,'$.attempts')+1),updatedAt=? WHERE identifier=? AND expiresAt>? AND json_extract(value,'$.attempts')<3 AND json_extract(value,'$.otpHash')!='' AND json_extract(value,'$.delivery')='sent' AND json_extract(value,'$.email')=? AND json_extract(value,'$.generation')=? RETURNING id,identifier,value,expiresAt").bind(now(),key,now(),expected?.email||'',expected?.generation||'').first();return row?{...row,data:JSON.parse(row.value)}:null},
  async consume(row){return Boolean(await db.prepare("DELETE FROM verification WHERE id=? AND expiresAt>? AND json_extract(value,'$.otpHash')=? AND json_extract(value,'$.email')=? AND json_extract(value,'$.generation')=? RETURNING id").bind(row.id,now(),row.data.otpHash,row.data.email,row.data.generation).first())},
  async cancel(token){const key=await keyFor(token);if(key)await db.prepare('DELETE FROM verification WHERE identifier=?').bind(key).run()},
  async owner(accountId){const count=await db.prepare('SELECT COUNT(DISTINCT userId) AS owners FROM account WHERE providerId=? AND accountId=?').bind(microsoftProviderId,accountId).first();if(count.owners>1)throw Error('This Microsoft identity needs account recovery.');return db.prepare('SELECT u.* FROM account a JOIN user u ON u.id=a.userId WHERE a.providerId=? AND a.accountId=?').bind(microsoftProviderId,accountId).first()},
  async finalize(data){
   const email=normalizeProofEmail(data.email);if(!email||!data.accountId)throw Error('Verification expired. Please start again.');
   const prior=await db.prepare('SELECT id,emailVerified FROM user WHERE email=?').bind(email).first();
   if(prior&&prior.emailVerified!==1&&prior.emailVerified!==true)throw Error('Sign in with an email code before connecting Microsoft to this account.');
   const accountRecordId='gw-ms-'+await sha256(microsoftProviderId+'\0'+data.accountId),userId=crypto.randomUUID(),at=now();
   // A deterministic primary key serializes all new links for this Microsoft identity.
   // Batch is atomic. Existing users' names, verification state and membership are untouched.
   await db.batch([
    db.prepare('INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) SELECT ?,?,?,1,?,? WHERE NOT EXISTS(SELECT 1 FROM account WHERE providerId=? AND accountId=?) ON CONFLICT(email) DO NOTHING').bind(userId,data.name||'',email,at,at,microsoftProviderId,data.accountId),
    db.prepare('INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) SELECT ?,?,?,u.id,?,? FROM user u WHERE u.email=? AND u.emailVerified=1 AND NOT EXISTS(SELECT 1 FROM account WHERE providerId=? AND accountId=?) ON CONFLICT(id) DO NOTHING').bind(accountRecordId,data.accountId,microsoftProviderId,at,at,email,microsoftProviderId,data.accountId)
   ]);
   const owner=await this.owner(data.accountId);
   if(!owner||owner.email.toLowerCase()!==email||!owner.emailVerified)throw Error('This Microsoft account is already connected elsewhere. Please start again.');
   return {...owner,emailVerified:true,createdAt:new Date(owner.createdAt),updatedAt:new Date(owner.updatedAt)};
  }
 };
}
