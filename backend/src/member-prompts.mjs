// Account-scoped one-time prompts (welcome, family refinement). Rows are
// created only by migration 0027 and its approval trigger; members can answer
// their own prompts and nothing else. Answers never change family data.
export const PROMPT_VERSIONS=Object.freeze({welcome:1,'family-setup':1});
const error=(message,status=400)=>Object.assign(new Error(message),{status});
export async function promptState(db,actor){
 const rows=(await db.prepare('SELECT prompt,version,status FROM member_prompts WHERE member_id=?').bind(actor.id).all()).results||[];
 return {prompts:Object.fromEntries(rows.filter(r=>Object.hasOwn(PROMPT_VERSIONS,r.prompt)).map(r=>[r.prompt,{version:r.version,status:r.status}]))};
}
export async function promptCommand(db,actor,input,q){
 if(input.type!=='SET_PROMPT_STATUS')return null;
 if(!Object.hasOwn(PROMPT_VERSIONS,input.prompt))throw error('Unknown prompt');
 if(!['dismissed','completed'].includes(input.status))throw error('Choose Not now or Done');
 const version=PROMPT_VERSIONS[input.prompt];
 q('INSERT INTO member_prompts(member_id,prompt,version,status) VALUES(?,?,?,?) ON CONFLICT(member_id,prompt) DO UPDATE SET status=excluded.status,version=MAX(member_prompts.version,excluded.version),updated_at=CURRENT_TIMESTAMP',actor.id,input.prompt,version,input.status);
 return {prompt:input.prompt,status:input.status};
}
