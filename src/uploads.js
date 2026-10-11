import {uploadFormat} from './upload-formats.js';
// Local data URLs are intentional: preview files survive reload and never reach an upload service.
export const MAX_PREVIEW_FILE_BYTES=2*1024*1024;
export async function readPreviewFile(file,mode='preview'){
 if(mode==='live'){if(!file||file.size>20*1024*1024)throw new Error('Choose a file under 20 MB.');if(!uploadFormat(file.type))throw new Error(`${file.name||'This file'} isn’t a supported photo, video, audio, PDF, Word or text file.`);const form=new FormData();form.append('file',file);const response=await fetch('/api/media',{method:'POST',credentials:'same-origin',body:form});const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed. Please try again.');return result;}

 if(!file||file.size>MAX_PREVIEW_FILE_BYTES)throw Error('Choose a preview file under 2 MB. Nothing was uploaded.');
 if(!uploadFormat(file.type))throw Error('Choose a photo, video, audio, PDF, Word or plain text file.');
 const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read this preview file.'));reader.readAsDataURL(file)});
 return {name:file.name,type:file.type,url};
}
// Uploads one at a time and keeps every success; failures come back for a
// per-file retry or removal, so nothing that worked is uploaded twice.
export async function uploadEach(selected,mode){const uploaded=[],failed=[];for(const file of selected){try{uploaded.push(await readPreviewFile(file,mode))}catch(error){failed.push({key:crypto.randomUUID(),file,error:error?.message||'Upload failed. Try again.'})}}return {uploaded,failed}}
