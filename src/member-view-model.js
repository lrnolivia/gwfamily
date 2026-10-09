export const MEMBER_VIEW_KEY='gw-member-view:v1';
export const isPreviewLeader=state=>state?.mode==='preview'&&state.previewRoleView==='leader';
export const isMemberView=state=>state?.mode==='live'&&state.viewAsMember===true;
export function memberViewSetting(storage=globalThis.sessionStorage){try{const value=JSON.parse(storage.getItem(MEMBER_VIEW_KEY)||'null');return value?.enabled===true&&typeof value.accountId==='string'?value:null}catch{return null}}
export function memberViewHeaders(storage=globalThis.sessionStorage){const value=memberViewSetting(storage);return value?{'X-GW-Member-View':'true','X-GW-Member-View-Account':value.accountId}:{}}
export function writeMemberView(accountId,enabled,storage=globalThis.sessionStorage){try{if(enabled)storage.setItem(MEMBER_VIEW_KEY,JSON.stringify({accountId,enabled:true}));else storage.removeItem(MEMBER_VIEW_KEY);return true}catch{return false}}
export const PREVIEW_LEADER_ACTIONS=new Set(['CREATE_REUNION','UPDATE_REUNION','ACTIVATE_REUNION','ARCHIVE_REUNION','RESTORE_REUNION','SET_REUNION_CADENCE','DETAILS','SAVE_CALENDAR','SAVE_EVENT','ARCHIVE_EVENT','RESTORE_EVENT','SAVE_PRODUCT','UPDATE_CLAIM','APPROVE_MEMBER','REMOVE_MEMBER','RESTORE_MEMBER','CONFIRM_FEE','SET_PAYMENT','MODERATE','FEATURE_MEMORY']);

export const canEditMemoryDetails=(state,memory)=>!isMemberView(state)&&(memory?.authorId===state?.selfId||isPreviewLeader(state)||state?.mode==='live'&&state.capabilities?.moderate===true);
