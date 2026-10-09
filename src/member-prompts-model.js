// Account-scoped one-time prompts. The Worker decides when a prompt is due
// (approval for welcome, migration for existing-member family refinement);
// the client only shows a due prompt and records Not now or Done.
export const PROMPT_VERSIONS=Object.freeze({welcome:1,'family-setup':1});
export const promptDue=(state,prompt)=>state?.viewAsMember!==true&&state?.prompts?.[prompt]?.status==='due'&&(state.prompts[prompt].version||0)<=PROMPT_VERSIONS[prompt];
export function promptPreview(state,action){
 if(action.type!=='SET_PROMPT_STATUS')return null;
 if(!Object.hasOwn(PROMPT_VERSIONS,action.prompt)||!['dismissed','completed'].includes(action.status))throw Error('Choose Not now or Done.');
 return {...state,prompts:{...(state.prompts||{}),[action.prompt]:{version:PROMPT_VERSIONS[action.prompt],status:action.status}}};
}
