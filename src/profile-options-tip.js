export const OPTIONS_TIP_PREFIX='gw-options-tip-v1:';
export const optionsTipKey=(mode,accountId)=>['live','preview'].includes(mode)&&typeof accountId==='string'&&accountId?OPTIONS_TIP_PREFIX+mode+':'+accountId:null;
export function claimOptionsTip(storage,key){if(!key)return false;try{if(storage.getItem(key)==='seen')return false;storage.setItem(key,'seen')}catch{}return true}
