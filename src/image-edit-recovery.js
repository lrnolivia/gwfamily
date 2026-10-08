// Account-scoped, tab-local recovery only. Never a server draft or publication.
export const imageDraftPrefix=account=>'gw-image-edit:'+encodeURIComponent(account)+':';
export const imageDraftKey=(account,page,object)=>imageDraftPrefix(account)+encodeURIComponent(page)+':'+encodeURIComponent(object);
export function readImageDraft(storage,key,baseline,validate){
 try{const row=JSON.parse(storage?.getItem(key)||'null');if(!row||row.version!==1||row.baseline!==baseline)return null;return validate(row.value)?row.value:null}catch{return null}
}
export function writeImageDraft(storage,key,baseline,value){
 try{if(!storage)return false;storage.setItem(key,JSON.stringify({version:1,baseline,value}));return true}catch{return false}
}
export function removeImageDraft(storage,key){try{storage?.removeItem(key);return true}catch{return false}}
export function clearAccountImageDrafts(storage,account){
 try{if(!storage)return;const prefix=imageDraftPrefix(account),keys=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix))keys.push(key)}for(const key of keys)storage.removeItem(key)}catch{}
}
