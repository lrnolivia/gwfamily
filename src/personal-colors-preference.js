export const PERSONAL_COLORS_PREFIX='gw-personal-themes:v2:';
export function personalColorsKey(mode,accountId){return ['live','preview'].includes(mode)&&typeof accountId==='string'&&accountId?PERSONAL_COLORS_PREFIX+mode+':'+accountId:null}
// A missing v2 preference is the one-time migration, including legacy off.
// Once present, an explicit off is respected on every later entry.
export function readPersonalColors(storage,key){if(!key)return true;try{return storage.getItem(key)!=='off'}catch{return true}}
export function migratePersonalColors(storage,key){if(!key)return true;try{const value=storage.getItem(key);if(value==='off')return false;if(value!=='on')storage.setItem(key,'on');return true}catch{return true}}
export function writePersonalColors(storage,key,enabled){if(!key)return false;try{storage.setItem(key,enabled?'on':'off');return true}catch{return false}}
