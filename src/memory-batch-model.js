// Several memory files added at once. Each file moves through
// queued → uploading → saving → saved, or stops at upload-failed / save-failed.
// A retry only repeats the step that failed: a saved upload and its memory id
// are kept, so retrying never uploads the same file twice or creates a second
// memory for it.
export const MEMORY_BATCH_LIMIT=10;
export const MEMORY_FILE_TYPES=/^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm)|audio\/[\w.+-]+|application\/pdf)$/;
export function createMemoryBatch(files,newId=()=>crypto.randomUUID()){
 const list=[...files];
 return {items:list.slice(0,MEMORY_BATCH_LIMIT).map((file,i)=>({key:newId(),memoryId:newId(),file,name:file?.name||'File '+(i+1),status:'queued',upload:null,metadata:null,error:''})),skipped:Math.max(0,list.length-MEMORY_BATCH_LIMIT)};
}
export const updateBatchItem=(batch,key,patch)=>batch&&({...batch,items:batch.items.map(item=>item.key===key?{...item,...patch}:item)});
export const retryStep=item=>item?.status==='upload-failed'?'upload':item?.status==='save-failed'?'save':null;
export const failedKeys=batch=>(batch?.items||[]).filter(retryStep).map(item=>item.key);
export const savedMemoryIds=batch=>(batch?.items||[]).filter(item=>item.status==='saved').map(item=>item.memoryId);
export function memoryFromBatchItem(item,authorId){
 return {id:item.memoryId,title:'',image:item.upload.url,photoFrame:undefined,mediaType:item.upload.type||item.file?.type,authorId,category:'',tags:[],memberIds:[],event:'',year:'',milestone:'',...(item.metadata||{})};
}
export function batchItemStatus(item){
 switch(item.status){
 case 'queued':return 'Waiting';
 case 'uploading':return 'Uploading…';
 case 'saving':return 'Saving…';
 case 'saved':return 'Added';
 case 'upload-failed':return 'Didn’t upload. '+(item.error||'Try again.');
 case 'save-failed':return 'Uploaded but not saved. '+(item.error||'')+' Retrying won’t upload it again.';
 default:return '';
 }
}
// Honest totals: never call a partial batch a success.
export function batchSummary(batch){
 const items=batch?.items||[],total=items.length,saved=items.filter(i=>i.status==='saved').length,failed=items.filter(retryStep).length,working=total-saved-failed;
 let message;
 if(working)message='Adding '+Math.min(total,saved+failed+1)+' of '+total+'…';
 else if(!failed)message=saved===1?'1 memory added.':saved+' memories added.';
 else if(!saved)message=(total===1?'The memory wasn’t added.':'None of the '+total+' memories were added.')+' Retry below.';
 else message=saved+' of '+total+' memories added. '+failed+' '+(failed===1?'needs':'need')+' a retry below.';
 if(batch?.skipped)message+=' '+batch.skipped+' more '+(batch.skipped===1?'file wasn’t':'files weren’t')+' added; choose up to '+MEMORY_BATCH_LIMIT+' at a time.';
 return {total,saved,failed,working,done:total>0&&!working,message};
}
// One pass over one file. `upload(file)` returns {upload,metadata}; `save(item)`
// resolves true when the memory is stored. Steps already done are skipped.
export async function stepBatchItem(item,{upload,save,canSave=()=>true},patch){
 if(!item||item.status==='saved')return item;
 let current=item;
 if(!current.upload){
  patch({status:'uploading',error:''});
  try{if(!MEMORY_FILE_TYPES.test(current.file?.type||''))throw Error('Choose a photo, MP4 or WebM video, audio, or PDF memory.');const done=await upload(current.file);current={...current,...done};patch(done)}
  catch(e){patch({status:'upload-failed',error:e?.message||'Upload failed.'});return {...current,status:'upload-failed'}}
 }
 if(!canSave()){patch({status:'save-failed',error:'You switched accounts.'});return {...current,status:'save-failed'}}
 patch({status:'saving',error:''});
 try{if(await save(current)){patch({status:'saved'});return {...current,status:'saved'}}patch({status:'save-failed',error:'The memory wasn’t saved.'})}
 catch(e){patch({status:'save-failed',error:e?.message||'The memory wasn’t saved.'})}
 return {...current,status:'save-failed'};
}
