// Local data URLs are intentional: preview files survive reload and never reach an upload service.
export const MAX_PREVIEW_FILE_BYTES=2*1024*1024;
export async function readPreviewFile(file){
 if(!file||file.size>MAX_PREVIEW_FILE_BYTES)throw Error('Choose a preview file under 2 MB. Nothing was uploaded.');
 if(!/^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|quicktime)|audio\/[\w.+-]+|application\/(pdf|msword|vnd.openxmlformats-officedocument.wordprocessingml.document)|text\/plain)$/.test(file.type))throw Error('Choose a photo, video, audio, PDF, Word or plain text file.');
 const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read this preview file.'));reader.readAsDataURL(file)});
 return {name:file.name,type:file.type,url};
}
