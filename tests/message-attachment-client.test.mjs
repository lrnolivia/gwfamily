import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PRIVATE_ATTACHMENT_MAX_BYTES,attachmentName,attachmentSize,canAddPrivateAttachments,normalizePrivateAttachment,privateAttachmentPath,privateAttachments,validatePrivateFile} from '../src/message-attachment-model.js';
import {sendPrivateMessage,uploadPrivateAttachment} from '../src/message-attachment-client.js';
import {chatStorageKey,readChatDraft,saveChatDraft,clearChatDrafts,hasChatDrafts} from '../src/messaging-model.js';
const id='9b1f8aa0-6543-4210-8765-0123456789ab',conversationId='synthetic-private-conversation',accountId='synthetic-adult';
const file=()=>new File(['Synthetic text attachment.\n'],'private.txt',{type:'text/plain'});
const metadata=(overrides={})=>({id,url:privateAttachmentPath(conversationId,id),name:'private.txt',type:'text/plain',size:file().size,...overrides});
class Storage{items=new Map();get length(){return this.items.size}key(index){return [...this.items.keys()][index]}getItem(key){return this.items.get(key)||null}setItem(key,value){this.items.set(key,value)}removeItem(key){this.items.delete(key)}}
class Xhr{
 upload={};status=201;responseText=JSON.stringify(metadata());timeout=0;sent=null;aborted=false;
 open(method,path){this.method=method;this.path=path}
 send(body){this.sent=body}
 abort(){this.aborted=true;this.onabort?.()}
 progress(loaded,total){this.upload.onprogress?.({lengthComputable:true,loaded,total})}
 complete(){this.onload?.()}
 fail(){this.onerror?.()}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('only exact private conversation routes and safe bounded metadata are admitted',()=>{
 assert.deepEqual(normalizePrivateAttachment(metadata(),conversationId),metadata());
 for(const value of [metadata({url:'/api/media/'+id}),metadata({url:'https://untrusted.invalid/'+id}),metadata({url:privateAttachmentPath('other',id)}),metadata({type:'image/svg+xml'}),metadata({type:'text/html'}),metadata({size:PRIVATE_ATTACHMENT_MAX_BYTES+1}),metadata({id:'guess'})])assert.equal(normalizePrivateAttachment(value,conversationId),null);
 assert.deepEqual(privateAttachments([metadata(),metadata()],conversationId),[]);
 assert.equal(attachmentName('../bad\u202e\nname.txt'),'.._bad__name.txt');
 assert.equal(attachmentSize(1024),'1 KB');assert.equal(attachmentSize(1024*1024),'1.0 MB');
});
test('selection count, per-file limit and combined byte limits are bounded',()=>{
 assert.throws(()=>canAddPrivateAttachments(Array(5).fill(metadata()),[file()]),/five/);
 assert.throws(()=>canAddPrivateAttachments([{size:20*1024*1024}],[new File([new Uint8Array(6*1024*1024)],'large.txt',{type:'text/plain'})]),/25 MB/);
 for(const selected of [new File(['x'],'script.svg',{type:'image/svg+xml'}),new File([],'empty.txt',{type:'text/plain'}),{size:PRIVATE_ATTACHMENT_MAX_BYTES+1,type:'text/plain'}])assert.throws(()=>canAddPrivateAttachments([],[selected]),/10 MB/);
});
test('actual bounded client validation rejects forged MIME, binary text and mismatched sizes',async()=>{
 await validatePrivateFile(file());
 await assert.rejects(validatePrivateFile(new File(['<script>synthetic</script>'],'fake.png',{type:'image/png'})),/contents/);
 await assert.rejects(validatePrivateFile(new File([new Uint8Array([255,254])],'bad.txt',{type:'text/plain'})),/contents/);
 await assert.rejects(validatePrivateFile(new File([new Uint8Array([0,1])],'binary.txt',{type:'text/plain'})),/contents/);
 await assert.rejects(validatePrivateFile({type:'text/plain',size:10,arrayBuffer:async()=>new Uint8Array([65]).buffer}),/changed/);
});
test('actual uploader uses same-origin scoped multipart, monotonic bounded progress and verified metadata',async()=>{
 const xhr=new Xhr(),progress=[],promise=uploadPrivateAttachment({conversationId,accountId,file:file(),requestId:'synthetic-upload-1',onProgress:value=>progress.push(value),xhrFactory:()=>xhr});
 await tick();assert.equal(xhr.method,'POST');assert.equal(xhr.path,`/api/conversations/${conversationId}/attachments`);assert.equal(xhr.sent.get('expectedAccountId'),accountId);assert.equal(xhr.sent.get('requestId'),'synthetic-upload-1');assert.equal(xhr.sent.get('file').name,'private.txt');assert.equal(xhr.timeout,45000);
 xhr.progress(1,2);xhr.progress(2,2);assert.deepEqual(progress,[50,99]);xhr.complete();assert.deepEqual(await promise,metadata());assert.deepEqual(progress,[50,99,100]);assert.equal(xhr.onload,null);assert.equal(xhr.upload.onprogress,null);
});
test('cancel before upload sends no bytes; cancel in flight rejects and clears late callbacks',async()=>{
 const first=new AbortController();first.abort();let created=false;
 await assert.rejects(uploadPrivateAttachment({conversationId,accountId,file:file(),requestId:'synthetic-upload-2',signal:first.signal,xhrFactory:()=>{created=true;return new Xhr()}}),{name:'AbortError'});assert.equal(created,false);
 const xhr=new Xhr(),controller=new AbortController(),promise=uploadPrivateAttachment({conversationId,accountId,file:file(),requestId:'synthetic-upload-3',signal:controller.signal,xhrFactory:()=>xhr});
 await tick();const late=xhr.onload;controller.abort();await assert.rejects(promise,{name:'AbortError'});assert.equal(xhr.aborted,true);assert.equal(xhr.onload,null);late();assert.equal(xhr.onload,null);
});
test('interrupted upload retries preserve exact identity and server errors never become attachment metadata',async()=>{
 const xhr=new Xhr(),promise=uploadPrivateAttachment({conversationId,accountId,file:file(),requestId:'stable-upload-id',xhrFactory:()=>xhr});await tick();xhr.fail();await assert.rejects(promise,/interrupted/);
 const retry=new Xhr(),again=uploadPrivateAttachment({conversationId,accountId,file:file(),requestId:'stable-upload-id',xhrFactory:()=>retry});await tick();assert.equal(retry.sent.get('requestId'),xhr.sent.get('requestId'));retry.complete();await again;
 const bad=new Xhr();bad.responseText=JSON.stringify(metadata({url:'https://untrusted.invalid/a'}));const invalid=uploadPrivateAttachment({conversationId,accountId,file:file(),requestId:'stable-upload-x',xhrFactory:()=>bad});await tick();bad.complete();await assert.rejects(invalid,/verified/);
 const denied=new Xhr();denied.status=404;denied.responseText=JSON.stringify({error:'Conversation not found'});const reject=uploadPrivateAttachment({conversationId,accountId,file:file(),requestId:'stable-upload-z',xhrFactory:()=>denied});await tick();denied.complete();await assert.rejects(reject,error=>error.status===404&&error.message==='Conversation not found');
});
test('drafts persist private references, keep ambiguity, isolate preview/account and clear on signout',()=>{
 const storage=new Storage(),attempt={requestId:'stable-send-id',body:'Synthetic draft.',files:[metadata()]};
 assert.equal(saveChatDraft(accountId,conversationId,{text:'New text',files:[metadata()],attempt},storage),true);
 const recovered=readChatDraft(accountId,conversationId,storage);assert.deepEqual(recovered.files,[metadata()]);assert.deepEqual(recovered.attempt,attempt);assert.equal(hasChatDrafts(accountId,storage),true);assert.equal(readChatDraft('other-account',conversationId,storage).attempt,null);
 assert.equal(readChatDraft(accountId,conversationId,storage,'preview').attempt,null);saveChatDraft(accountId,conversationId,{text:'Preview text',files:[],attempt:null},storage,'preview');assert.equal(readChatDraft(accountId,conversationId,storage).text,'New text');assert.equal(readChatDraft(accountId,conversationId,storage,'preview').text,'Preview text');
 clearChatDrafts(accountId,storage);assert.equal(storage.length,0);
});
test('malformed attachment references cannot silently change a recovered ambiguous send',()=>{
 const storage=new Storage();storage.setItem(chatStorageKey(accountId,conversationId),JSON.stringify({text:'',files:[metadata({url:'https://untrusted.invalid/a'})],attempt:{requestId:'stable-send-id',body:'Synthetic pending',files:[metadata({url:'/api/media/'+id})]}}));
 const recovered=readChatDraft(accountId,conversationId,storage);assert.deepEqual(recovered.files,[]);assert.equal(recovered.discardedAttachments,true);assert.equal(recovered.attempt.body,'Synthetic pending');assert.equal(recovered.attempt.requestId,'stable-send-id');assert.equal(recovered.attempt.invalidAttachments,true);
 const broken={getItem(){throw Error('Synthetic privacy setting')},setItem(){throw Error('Synthetic quota')}};assert.equal(readChatDraft(accountId,conversationId,broken).text,'');assert.equal(saveChatDraft(accountId,conversationId,{text:'Synthetic',files:[],attempt:null},broken),false);
});
test('quarantine is durable across text editing, saving and reloading malformed or non-array references',()=>{
 for(const files of [{},null,'invalid',[metadata({url:'/api/media/'+id})]]){
  const storage=new Storage();storage.setItem(chatStorageKey(accountId,conversationId),JSON.stringify({text:'',files:[],attempt:{requestId:'stable-send-id',body:'Original synthetic text',files}}));
  const first=readChatDraft(accountId,conversationId,storage);assert.equal(first.attempt.invalidAttachments,true);saveChatDraft(accountId,conversationId,{...first,text:'Newer synthetic draft'},storage);
  const second=readChatDraft(accountId,conversationId,storage);assert.equal(second.attempt.invalidAttachments,true);assert.equal(second.attempt.body,'Original synthetic text');assert.equal(second.text,'Newer synthetic draft');
 }
 const storage=new Storage();saveChatDraft(accountId,conversationId,{text:'Newer text',recoveredText:'Original unsent text',files:[],attempt:null},storage);assert.equal(readChatDraft(accountId,conversationId,storage).recoveredText,'Original unsent text');
});
test('actual sender transmits strict attachment IDs and expected account; retry is byte-identical',async()=>{
 const calls=[],attempt={body:'',requestId:'stable-send-id',files:[metadata()]};const fetcher=async(path,options)=>{calls.push({path,options});return {ok:true,status:201,json:async()=>({message:{id:'synthetic-message',conversationId,authorId:accountId,sequence:1,body:'',files:[metadata()]}})}};
 await sendPrivateMessage({conversationId,accountId,attempt,fetcher});await sendPrivateMessage({conversationId,accountId,attempt,fetcher});
 assert.equal(calls[0].options.body,calls[1].options.body);assert.deepEqual(JSON.parse(calls[0].options.body),{requestId:'stable-send-id',body:'',attachments:[id],expectedAccountId:accountId});assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.cache,'no-store');
});
test('only definitive typed unavailable-attachment errors permit restoring text',async()=>{
 const attempt={body:'Synthetic text',requestId:'stable-send-id',files:[metadata()]};
 for(const [status,value,safe] of [[410,{error:'Expired',code:'attachments-unavailable',safeToEdit:true},true],[410,{error:'Unspecified'},false],[500,{error:'Ambiguous',code:'attachments-unavailable',safeToEdit:true},false],[409,{error:'Account changed'},false]])await assert.rejects(sendPrivateMessage({conversationId,accountId,attempt,fetcher:async()=>({ok:false,status,json:async()=>value})}),error=>error.safeToEdit===safe);
 await assert.rejects(sendPrivateMessage({conversationId,accountId,attempt,fetcher:async()=>({ok:true,status:201,json:async()=>({message:{id:'other',conversationId:'other-chat'}})})}),error=>error.ambiguous===true);
});
test('malformed success leaves send ambiguous unless author, body, sequence and ordered files match',async()=>{
 const attempt={body:'Synthetic text',requestId:'stable-send-id',files:[metadata()]},valid={id:'synthetic-message',conversationId,authorId:accountId,body:'Synthetic text',sequence:1,files:[metadata()]};
 for(const patch of [{authorId:'other-account'},{body:'Different text'},{sequence:0},{files:[]},{files:[metadata({id:'76543210-abcd-4321-9876-0123456789ab'})]},{files:[metadata({url:'/api/media/'+id})]}])await assert.rejects(sendPrivateMessage({conversationId,accountId,attempt,fetcher:async()=>({ok:true,status:201,json:async()=>({message:{...valid,...patch}})})}),error=>error.ambiguous===true);
});
test('chat source uses authorized identity badges, safe files and guarded upload/draft lifecycle',async()=>{
 const source=await readFile(new URL('../src/messaging.jsx',import.meta.url),'utf8'),css=await readFile(new URL('../src/message-attachments.css',import.meta.url),'utf8'),worker=await readFile(new URL('../backend/src/worker.mjs',import.meta.url),'utf8');
 assert.match(source,/MemberBadges member=\{author\} passive/);assert.match(source,/MemberBadges member=\{messagePerson\(state,m\)\} passive/);assert.match(source,/state\.members\|\|\[\]\)\.find\(member=>member\.id===id\)/);assert.match(source,/state\.mode\+':'\+state\.selfId/);
 assert.match(source,/controllers\.current\.values\(\)\)controller\.abort\(\)/);assert.match(source,/sendController\.current\?\.abort\(\)/);assert.match(source,/if\(!attempt\|\|attempt\.invalidAttachments\)return/);assert.match(source,/uploads\.length>0/);assert.match(source,/<progress max="100"/);assert.match(source,/privateAttachments\(files,conversationId\)/);
 assert.doesNotMatch(source,/iframe|dangerouslySetInnerHTML/);assert.match(source,/setToast\(\{kind:'error'/);assert.match(css,/focus-visible/);assert.match(css,/forced-colors/);assert.match(css,/max-width:420px/);assert.match(worker,/maxSize:11\*1024\*1024/);
});
