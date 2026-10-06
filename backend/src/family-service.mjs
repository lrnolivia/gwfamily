import {listNotifications,notificationSettingsStatements} from './notification-service.mjs';
import {commandFingerprint} from './command-identity.mjs';
import {directorySelection as validateDirectorySelection} from './member-directory.mjs';
import {merchandiseOptions,orderLines} from './merchandise.mjs';
import {householdState,householdCommand} from './households.mjs';
import {adultOn,publicBirthdays,ageOn} from './birthdays.mjs';
import { can, validateShirtSelection,shouldNotify } from './policy.mjs';
import { createRateStorage } from './auth.mjs';

export class UserError extends Error { constructor(message,status=400){super(message);this.status=status} }
const directorySelection=(...args)=>validateDirectorySelection(...args).catch(e=>{if(e.status)throw new UserError(e.message,e.status);throw e});
export const json=(text,fallback={})=>{try{return JSON.parse(text)}catch{return fallback}};
const text=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new UserError('Check the entered text');return v.trim()};
const uuid=()=>crypto.randomUUID();
const list=r=>r.results||[];
const stamp=v=>/Z$|[+-]\d\d:\d\d$/.test(v)?Date.parse(v):Date.parse(v.replace(' ','T')+'Z');
const requireCan=(actor,action)=>{if(!can(actor,action))throw new UserError('You do not have permission for that action',403)};
export const visiblePostSql="p.deleted_at IS NULL AND (p.group_id IS NULL OR EXISTS(SELECT 1 FROM family_group_members gm WHERE gm.group_id=p.group_id AND gm.member_id=?)) AND (COALESCE(json_extract(p.metadata_json,'$.systemBirthday'),0)!=1 OR EXISTS(SELECT 1 FROM profiles bp JOIN members bm ON bm.id=bp.member_id WHERE bp.member_id=p.author_id AND bp.birthday_celebration=1 AND bp.birthday<=date('now','-18 years') AND bm.status='active'))";
export async function readPost(db,actor,id){return db.prepare(`SELECT p.* FROM posts p WHERE p.id=? AND ${visiblePostSql}`).bind(id,actor.id).first()}
export function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>new Date().toISOString().slice(0,10))return false;const d=new Date(value+'T12:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===value}
function webUrl(value,hosts){if(!value)return '';try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.includes(u.hostname.replace(/^www\./,'')))throw 0;return u.href}catch{throw new UserError('Use a supported secure link')}}
const profileHosts=['instagram.com','facebook.com','youtube.com','tiktok.com','bsky.app','linkedin.com'];
function songUrl(value){if(!value)return '';const link=webUrl(value,['open.spotify.com','music.apple.com']);const u=new URL(link);if(u.hostname==='open.spotify.com'&&!/^\/track\/[a-zA-Z0-9]{22}\/?$/.test(u.pathname))throw new UserError('Choose a Spotify track link');if(u.hostname==='music.apple.com'&&(!/^\/[a-z]{2}\/album\/[^/]+\/\d+$/.test(u.pathname)||!/^\d+$/.test(u.searchParams.get('i')||'')))throw new UserError('Choose an Apple Music song link');return link}
export async function ownedFiles(db,actor,files=[]){if(!Array.isArray(files)||files.length>10)throw new UserError('Use up to ten attachments');const out=[];for(const f of files){const id=f.id||(/^\/api\/media\/([a-zA-Z0-9-]+)$/.exec(f.url||'')||[])[1];const row=await db.prepare('SELECT * FROM media WHERE id=? AND owner_id=? AND deleted_at IS NULL').bind(id||'',actor.id).first();if(!row)throw new UserError('Upload the attachment again before saving');out.push({id:row.id,url:'/api/media/'+row.id,name:row.name,type:row.mime_type,size:row.size_bytes})}return out}
async function accessibleTarget(db,actor,id){if(await readPost(db,actor,id))return true;const comment=await db.prepare('SELECT post_id FROM comments WHERE id=? AND deleted_at IS NULL').bind(id).first();if(comment&&await readPost(db,actor,comment.post_id))return true;return Boolean(await db.prepare('SELECT id FROM memories WHERE id=? AND deleted_at IS NULL').bind(id).first())}
export async function familyState(db,actor){
 const members=list(await db.prepare(`SELECT m.*,u.name,u.image,p.bio,p.profile_color,p.theme_song,p.socials_json,p.completed,p.share_age,p.birthday FROM members m JOIN user u ON u.id=m.id LEFT JOIN profiles p ON p.member_id=m.id WHERE m.status='active' ORDER BY u.name LIMIT 500`).bind().all());
 const me=await db.prepare('SELECT * FROM profiles WHERE member_id=?').bind(actor.id).first();
 const groups=list(await db.prepare('SELECT g.* FROM family_groups g JOIN family_group_members gm ON gm.group_id=g.id WHERE gm.member_id=? ORDER BY g.name').bind(actor.id).all());
 const groupMembers=list(await db.prepare('SELECT gm.* FROM family_group_members gm WHERE gm.group_id IN (SELECT group_id FROM family_group_members WHERE member_id=?)').bind(actor.id).all());
 const posts=list(await db.prepare(`SELECT p.* FROM posts p WHERE ${visiblePostSql} ORDER BY p.created_at DESC,p.id DESC LIMIT 100`).bind(actor.id).all());
 const comments=list(await db.prepare(`SELECT c.* FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.deleted_at IS NULL AND ${visiblePostSql} ORDER BY c.created_at,c.id LIMIT 1000`).bind(actor.id).all());
 const reactions=list(await db.prepare(`SELECT r.* FROM reactions r LEFT JOIN comments c ON c.id=r.comment_id JOIN posts p ON p.id=COALESCE(r.post_id,c.post_id) WHERE ${visiblePostSql} AND (c.id IS NULL OR c.deleted_at IS NULL)`).bind(actor.id).all());
 const votes=list(await db.prepare(`SELECT v.* FROM poll_votes v JOIN posts p ON p.id=v.post_id WHERE ${visiblePostSql}`).bind(actor.id).all());
 const dependents=list(await db.prepare('SELECT * FROM dependents WHERE guardian_id=? AND deleted_at IS NULL').bind(actor.id).all());
 const prefs=await db.prepare('SELECT * FROM notification_preferences WHERE member_id=?').bind(actor.id).first();
 const details=json((await db.prepare("SELECT data_json FROM reunion_settings WHERE id='current'").bind().first())?.data_json);
 const fees=await db.prepare('SELECT status FROM fee_reports WHERE member_id=? ORDER BY created_at DESC,id DESC LIMIT 1').bind(actor.id).first();
 const claim=await db.prepare('SELECT * FROM shirt_claims WHERE member_id=? ORDER BY created_at DESC,id DESC LIMIT 1').bind(actor.id).first();
 const rsvp=await db.prepare('SELECT status,count FROM rsvps WHERE member_id=?').bind(actor.id).first();
 const inbox=await listNotifications(db,actor,{limit:100});const notices=inbox.notifications;
 const saved=list(await db.prepare('SELECT target_id FROM saved_items WHERE member_id=?').bind(actor.id).all());
 const memories=list(await db.prepare('SELECT * FROM memories WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 200').bind().all());
 const products=list(await db.prepare('SELECT * FROM products WHERE active=1 AND deleted_at IS NULL ORDER BY name').bind().all());
 const reports=can(actor,'moderate')?list(await db.prepare('SELECT * FROM moderation_reports ORDER BY created_at DESC LIMIT 100').bind().all()):[];
 const memorials=list(await db.prepare('SELECT id,name,maiden_name,founder,story FROM memorials').bind().all());
 const relationships=list(await db.prepare('SELECT from_id,to_id,kind FROM family_relationships').bind().all());
 const birthdayCalendar=await publicBirthdays(db);
 const announcementViews=list(await db.prepare('SELECT post_id FROM announcement_views WHERE member_id=?').bind(actor.id).all()).map(v=>v.post_id);
 const state={announcementViews,birthdayCalendar,birthdayCelebration:Boolean(me?.birthday_celebration),mode:'live',schema:3,feedFilter:'all',peopleFilter:'all',memoryFilters:{},onboarding:'done',selfId:actor.id,capabilities:{post:can(actor,'post'),manageReunion:can(actor,'manage_reunion'),moderate:can(actor,'moderate'),manageMembers:can(actor,'manage_members'),treasurer:can(actor,'confirm_fees')},profileComplete:Boolean(me?.completed),
 members:members.map(m=>({id:m.id,name:m.name,photo:m.image,bio:m.bio||'',profileColor:m.profile_color||'#4f996c',themeSong:m.theme_song||'',socials:json(m.socials_json),circle:m.member_group==='loved_ones'?'loved':'family',leader:!!m.is_leader,moderator:json(m.roles_json,[]).some(r=>['admin','moderator'].includes(r)),groupId:groupMembers.find(g=>g.member_id===m.id)?.group_id||null,registered:true,origin:'live',...(m.share_age&&ageOn(m.birthday)!==null?{age:ageOn(m.birthday)}:{}),...(m.id===actor.id?{birthday:me?.birthday,gender:me?.gender,shareAge:!!me?.share_age}:{} )})).concat(dependents.map(d=>({id:d.id,name:d.name,birthday:d.birthday,gender:d.gender,managedBy:actor.id,circle:'family',origin:'dependent',registered:false}))),
 groups:groups.map(g=>({id:g.id,name:g.name,memberIds:groupMembers.filter(m=>m.group_id===g.id).map(m=>m.member_id)})),
 posts:posts.map(p=>{const meta=json(p.metadata_json);const poll=meta.poll?{...meta.poll,votes:{}}:null;if(poll)for(const v of votes.filter(v=>v.post_id===p.id&&v.member_id!==actor.id))for(const i of json(v.options_json,[]))poll.votes[i]=(poll.votes[i]||0)+1;return {...meta,id:p.id,authorId:p.author_id,groupId:p.group_id,text:p.body,createdAt:stamp(p.created_at),poll}}),
 comments:Object.fromEntries(posts.map(p=>[p.id,comments.filter(c=>c.post_id===p.id).map(c=>({id:c.id,parentId:c.parent_id,authorId:c.author_id,text:c.body,files:json(c.files_json,[]),createdAt:stamp(c.created_at)}))])),
 reactions:{},reactionCounts:{},reactionMembers:{},pollSelections:Object.fromEntries(votes.filter(v=>v.member_id===actor.id).map(v=>[v.post_id,json(v.options_json,[])])),
 memories:memories.map(m=>({...json(m.data_json),id:m.id,authorId:m.author_id})),products:products.map(p=>({...json(p.data_json),id:p.id,name:p.name,description:p.description})),
 memorials:memorials.map(m=>({id:m.id,name:m.name,maidenName:m.maiden_name,founder:!!m.founder,story:m.story})),relationships:relationships.map(r=>({from:r.from_id,to:r.to_id,type:r.kind})),
 notifications:notices,readNotices:notices.filter(n=>n.readAt).map(n=>n.id),notificationUnreadCount:inbox.unreadCount,notificationSettings:inbox.settings,notificationReadAllCutoff:inbox.readAllCutoff,
 notificationScope:prefs?.scope==='loved_ones'?'loved':prefs?.scope||'leaders',selectedNotificationIds:json(prefs?.selected_ids_json,[]),
 favorites:saved.map(s=>s.target_id),contact:json(me?.contact_json),drafts:{post:'',comments:{},replies:{},files:{}},compose:{},bag:[],order:claim?{id:claim.id,status:claim.status,items:json(claim.lines_json,[]),trackingUrl:claim.tracking_url,claimedAt:stamp(claim.created_at)}:null,
 details,payment:details.payment||{paypal:'',cashApp:'',amount:''},fees:fees?.status||'unpaid',rsvp,reports:reports.map(r=>({id:r.id,targetId:r.target_id,reason:r.reason,status:r.status})),inviteDrafts:[],lastId:0};
 for(const r of reactions){const id=r.post_id||r.comment_id;state.reactionMembers[id]??={};(state.reactionMembers[id][r.emoji]??=[]).push(r.member_id);state.reactionCounts[id]??={};state.reactionCounts[id][r.emoji]=(state.reactionCounts[id][r.emoji]||0)+1;if(r.member_id===actor.id)(state.reactions[id]??=[]).push(r.emoji)}
 const featured=list(await db.prepare('SELECT f.* FROM featured_memories f JOIN memories m ON m.id=f.memory_id WHERE m.deleted_at IS NULL ORDER BY f.is_primary DESC,f.approved_at DESC').bind().all());
 state.featuredPhotos=featured.flatMap(f=>{const m=state.memories.find(m=>m.id===f.memory_id&&m.image===f.media_url);return m?[m]:[]});state.featuredMemoryIds=state.featuredPhotos.map(m=>m.id);state.primaryMemoryId=featured.find(f=>f.is_primary&&state.featuredMemoryIds.includes(f.memory_id))?.memory_id||null;
 Object.assign(state,await householdState(db,actor));
 return state;
}

export async function command(db,actor,input){
 if(!input||typeof input.type!=='string'||typeof input.requestId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId))throw new UserError('This action needs a valid request identifier');
 const fingerprint=await commandFingerprint(input);
 const previous=await db.prepare('SELECT * FROM command_receipts WHERE member_id=? AND request_id=?').bind(actor.id,input.requestId).first();if(previous){if(previous.fingerprint&&(previous.fingerprint!==fingerprint||previous.operation!==input.type))throw new UserError('This request identifier was already used for different content',409);return json(previous.result_json)}
 const rate=await createRateStorage(db).consume('write:'+actor.id,{window:60,max:90});if(!rate.allowed)throw new UserError('Please wait a minute before trying again',429);
 const sql=[],result={ok:true};const q=(query,...args)=>sql.push(db.prepare(query).bind(...args));
 const audit=(action,id)=>q('INSERT INTO audit_log(id,actor_id,action,subject_id) VALUES(?,?,?,?)',uuid(),actor.id,action,id);
 switch(input.type){
 case 'SET_BIRTHDAY_CELEBRATION':{
  const profile=await db.prepare('SELECT birthday FROM profiles WHERE member_id=?').bind(actor.id).first();if(input.enabled===true&&!adultOn(profile?.birthday))throw new UserError('Public birthday celebrations are available for adult profiles only');
  q('UPDATE profiles SET birthday_celebration=?,updated_at=CURRENT_TIMESTAMP WHERE member_id=?',input.enabled===true?1:0,actor.id);if(input.enabled!==true)q("UPDATE posts SET deleted_at=CURRENT_TIMESTAMP WHERE author_id=? AND json_extract(metadata_json,'$.systemBirthday')=1 AND deleted_at IS NULL",actor.id);break;
 }
 case 'SAVE_MEMBER':{
  const m=input.member||{};if(m.id!==actor.id)throw new UserError('You can only edit your own profile',403);const name=text(m.name,80,true),bio=text(m.bio||'',400);const color=/^#[0-9a-f]{6}$/i.test(m.profileColor||'')?m.profileColor:'#4f996c';const social={};for(const [k,v] of Object.entries(m.socials||{})){if(!['Instagram','Facebook','YouTube','TikTok','Bluesky','LinkedIn'].includes(k))throw new UserError('Unsupported social service');social[k]=webUrl(v,profileHosts)}
  if(m.birthday&&!validDate(m.birthday))throw new UserError('Enter a valid birthday');const oldPhoto=(await db.prepare('SELECT image FROM user WHERE id=?').bind(actor.id).first())?.image;const photo=m.photo?(m.photo===oldPhoto?[{url:oldPhoto}]:await ownedFiles(db,actor,[{url:m.photo}])):[];
  q('UPDATE user SET name=?,image=?,updatedAt=? WHERE id=?',name,photo[0]?.url||null,Date.now(),actor.id);
  q(`INSERT INTO profiles(member_id,bio,profile_color,theme_song,socials_json,birthday,gender,completed) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET bio=excluded.bio,profile_color=excluded.profile_color,theme_song=excluded.theme_song,socials_json=excluded.socials_json,birthday=COALESCE(excluded.birthday,profiles.birthday),gender=excluded.gender,completed=CASE WHEN COALESCE(excluded.birthday,profiles.birthday) IS NOT NULL THEN 1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP`,actor.id,bio,color,songUrl(m.themeSong||''),JSON.stringify(social),m.birthday||null,text(m.gender||'',60),m.birthday?1:0);if(m.shareAge===true&&!adultOn(m.birthday||((await db.prepare('SELECT birthday FROM profiles WHERE member_id=?').bind(actor.id).first())?.birthday)))throw new UserError('Only adults can share their age');q('UPDATE profiles SET share_age=? WHERE member_id=?',m.shareAge===true?1:0,actor.id);break;
 }
 case 'SAVE_CONTACT':{
  const c=input.contact||{},visibility=c.visibility||'Only me';if(!['Only me','Selected family members','Family leaders','All approved family members'].includes(visibility))throw new UserError('Choose who can see your details');
  const selectedIds=await directorySelection(db,c.selectedIds??[],{max:200});
  const photo=c.photo?(await ownedFiles(db,actor,[{url:c.photo}]))[0].url:null;
  const value={name:text(c.name,80,true),email:text(c.email||'',160),phone:text(c.phone||'',40),address:text(c.address||'',300),social:webUrl(c.social||'',profileHosts),visibility,selectedIds,optIn:c.optIn===true,useProfile:c.useProfile!==false,photo};
  q(`INSERT INTO profiles(member_id,contact_json) VALUES(?,?) ON CONFLICT(member_id) DO UPDATE SET contact_json=excluded.contact_json,updated_at=CURRENT_TIMESTAMP`,actor.id,JSON.stringify(value));break;
 }
 case 'ADD_PERSON':case 'UPDATE_DEPENDENT':{
  if(!input.child&&input.type==='ADD_PERSON')throw new UserError('Adults create their own accounts. Invite them to join instead.');const m=input.member||{};if(!validDate(m.birthday))throw new UserError('A valid birthday is required');const name=text(m.name,80,true),gender=text(m.gender,60,true);
  if(input.type==='UPDATE_DEPENDENT'){const current=await db.prepare('SELECT id FROM dependents WHERE id=? AND guardian_id=? AND deleted_at IS NULL').bind(m.id||'',actor.id).first();if(!current)throw new UserError('Household member not found',404);q('UPDATE dependents SET name=?,birthday=?,gender=? WHERE id=? AND guardian_id=?',name,m.birthday,gender,m.id,actor.id)}else{result.id=uuid();q('INSERT INTO dependents(id,guardian_id,name,birthday,gender) VALUES(?,?,?,?,?)',result.id,actor.id,name,m.birthday,gender)}break;
 }
 case 'ADD_POST':{
  requireCan(actor,'post');const p=input.post||{},body=text(p.text||'',3000),files=await ownedFiles(db,actor,p.files||[]);const backgroundMedia=p.backgroundMedia?(await ownedFiles(db,actor,[p.backgroundMedia]))[0]:null;
  let poll=null;if(p.poll){const options=p.poll.options;if(!Array.isArray(options)||options.length<2||options.length>12||!['single','multiple'].includes(p.poll.mode))throw new UserError('A poll needs two to twelve choices');poll={question:text(p.poll.question,160,true),options:options.map(x=>text(x,120,true)),mode:p.poll.mode,votes:{}}}
  if(!body&&!files.length&&!poll)throw new UserError('Write something or add an attachment');
  if(p.groupId&&!await db.prepare('SELECT member_id FROM family_group_members WHERE group_id=? AND member_id=?').bind(p.groupId,actor.id).first())throw new UserError('Group membership required',403);
  const memberIds=await directorySelection(db,p.memberIds??[],{ancestors:true});
  const asLeader=p.asLeader===true;if((asLeader||p.pinned||p.firstView)&&!actor.isLeader)throw new UserError('Only leaders can publish leader announcements',403);if((p.pinned||p.firstView)&&!asLeader)throw new UserError('Choose Post as Leader to pin or announce this post');
  const background=typeof p.background==='string'&&p.background.length<100&&/^[a-zA-Z0-9#|, .()-]*$/.test(p.background)?p.background:null;
  result.id=uuid();q('INSERT INTO posts(id,author_id,group_id,body,metadata_json) VALUES(?,?,?,?,?)',result.id,actor.id,p.groupId||null,body,JSON.stringify({files,poll,background,backgroundMedia,memberIds,asLeader,pinned:asLeader&&p.pinned===true,firstView:asLeader&&p.firstView===true}));break;
 }
 case 'MARK_ANNOUNCEMENT_SEEN':{const post=await readPost(db,actor,input.id);if(!post||!json(post.metadata_json).firstView)throw new UserError('Announcement not found',404);q('INSERT OR IGNORE INTO announcement_views(post_id,member_id) VALUES(?,?)',post.id,actor.id);break;}
 case 'ADD_COMMENT':{
  requireCan(actor,'comment');const post=await readPost(db,actor,input.targetId);if(!post)throw new UserError('Post not found',404);const body=text(input.text||'',1500),files=await ownedFiles(db,actor,input.files||[]);if(!body&&!files.length)throw new UserError('Write a reply or attach a file');
  if(input.parentId&&!await db.prepare('SELECT id FROM comments WHERE id=? AND post_id=? AND deleted_at IS NULL').bind(input.parentId,post.id).first())throw new UserError('Reply not found',404);
  result.id=uuid();q('INSERT INTO comments(id,post_id,author_id,parent_id,body,files_json) VALUES(?,?,?,?,?,?)',result.id,post.id,actor.id,input.parentId||null,body,JSON.stringify(files));break;
 }
 case 'TOGGLE_REACTION':{
  const emoji=text(input.emoji,32,true);if(!/\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(emoji))throw new UserError('Choose an emoji');
  let post=await readPost(db,actor,input.targetId),comment=null;if(!post){comment=await db.prepare('SELECT id,post_id FROM comments WHERE id=? AND deleted_at IS NULL').bind(input.targetId).first();if(comment)post=await readPost(db,actor,comment.post_id)}if(!post)throw new UserError('Conversation not found',404);
  const col=comment?'comment_id':'post_id',id=comment?.id||post.id;const exists=await db.prepare(`SELECT member_id FROM reactions WHERE member_id=? AND ${col}=? AND emoji=?`).bind(actor.id,id,emoji).first();
  if(exists)q(`DELETE FROM reactions WHERE member_id=? AND ${col}=? AND emoji=?`,actor.id,id,emoji);else q(`INSERT INTO reactions(member_id,${col},emoji) VALUES(?,?,?)`,actor.id,id,emoji);break;
 }
 case 'TOGGLE_FAVORITE':{
  if(!await accessibleTarget(db,actor,input.id))throw new UserError('Item not found',404);const exists=await db.prepare('SELECT target_id FROM saved_items WHERE member_id=? AND target_id=?').bind(actor.id,input.id).first();if(exists)q('DELETE FROM saved_items WHERE member_id=? AND target_id=?',actor.id,input.id);else q('INSERT INTO saved_items(member_id,target_id) VALUES(?,?)',actor.id,input.id);break;
 }
 case 'POLL_VOTE':{
  const post=await readPost(db,actor,input.postId),poll=json(post?.metadata_json).poll,options=input.options;
  if(!poll||!Array.isArray(options)||options.length>poll.options.length||options.some(i=>!Number.isInteger(i)||i<0||i>=poll.options.length)||new Set(options).size!==options.length||(poll.mode==='single'&&options.length>1))throw new UserError('Check your poll choices');
  q('INSERT INTO poll_votes(member_id,post_id,options_json) VALUES(?,?,?) ON CONFLICT(member_id,post_id) DO UPDATE SET options_json=excluded.options_json',actor.id,post.id,JSON.stringify(options));break;
 }
 case 'RSVP':{
  const v=input.value||{};if(!['Planning to come','Still deciding','Can’t make it'].includes(v.status)||!Number.isInteger(v.count)||v.count<1||v.count>50)throw new UserError('Check your household RSVP');q('INSERT INTO rsvps(member_id,status,count) VALUES(?,?,?) ON CONFLICT(member_id) DO UPDATE SET status=excluded.status,count=excluded.count,updated_at=CURRENT_TIMESTAMP',actor.id,v.status,v.count);break;
 }
 case 'DETAILS':{
  requireCan(actor,'manage_reunion');const before=json((await db.prepare("SELECT data_json FROM reunion_settings WHERE id='current'").bind().first())?.data_json),d=input.value||{},value={...before};
  for(const key of ['date','time','endDate','rsvpDeadline','location','address','contact','schedule'])value[key]=text(d[key]||'',key==='schedule'?4000:300);
  if(d.organizerMemberId!==undefined||before.organizerMemberId){
   const selected=d.organizerMemberId!==undefined?d.organizerMemberId:before.organizerMemberId;
   const ids=await directorySelection(db,selected?[selected]:[]);
   value.organizerMemberId=ids[0]||null;
   value.contact=ids.length?(await db.prepare('SELECT name FROM user WHERE id=?').bind(ids[0]).first())?.name||'':'';
  }
  for(const k of ['date','endDate','rsvpDeadline'])if(value[k]&&!/^\d{4}-\d{2}-\d{2}$/.test(value[k]))throw new UserError('Check the event dates');
  q("INSERT INTO reunion_settings(id,data_json,updated_by) VALUES('current',?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP",JSON.stringify(value),actor.id);audit('update-reunion','current');break;
 }
 case 'SET_PAYMENT':{
  requireCan(actor,'set_payment_destination');const p=input.value||{},before=json((await db.prepare("SELECT data_json FROM reunion_settings WHERE id='current'").bind().first())?.data_json);
  const paypal=webUrl(p.paypal||'',['paypal.me']),cashApp=webUrl(p.cashApp||'',['cash.app']);if(paypal&&!/^\/[A-Za-z0-9_-]+\/?$/.test(new URL(paypal).pathname))throw new UserError('Use a verified PayPal.Me profile link');if(cashApp&&!/^\/\$[A-Za-z0-9_-]+\/?$/.test(new URL(cashApp).pathname))throw new UserError('Use a verified Cash App profile link');
  before.payment={paypal,cashApp,amount:text(p.amount||'',80)};q("INSERT INTO reunion_settings(id,data_json,updated_by) VALUES('current',?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP",JSON.stringify(before),actor.id);audit('payment-destination-update','current');break;
 }
 case 'SET_FEES':{
  if(!['paid','reported'].includes(input.value))throw new UserError('Ask the treasurer to correct a payment report');result.id=uuid();q("INSERT INTO fee_reports(id,member_id,status) VALUES(?,?,'reported')",result.id,actor.id);break;
 }
 case 'CONFIRM_FEE':{
  requireCan(actor,'confirm_fees');if(!['confirmed','rejected'].includes(input.status))throw new UserError('Choose confirmed or rejected');const fee=await db.prepare('SELECT status FROM fee_reports WHERE id=?').bind(input.id).first();if(!fee)throw new UserError('Contribution report not found',404);if(fee.status!==input.status){q('UPDATE fee_reports SET status=?,confirmed_by=? WHERE id=? AND status!=?',input.status,actor.id,input.id,input.status);audit('fee-'+input.status,input.id)}break;
 }
 case 'CLAIM_ORDER':{
  let lines;try{lines=await orderLines(db,input.lines)}catch(e){throw new UserError(e.message,e.status||400)}result.id=uuid();q('INSERT INTO shirt_claims(id,member_id,lines_json) VALUES(?,?,?)',result.id,actor.id,JSON.stringify(lines));break;
 }
 case 'ORDER_RECEIVED':{
  const claim=await db.prepare('SELECT id FROM shirt_claims WHERE id=? AND member_id=?').bind(input.id||'',actor.id).first();if(!claim)throw new UserError('Shirt order not found',404);q("UPDATE shirt_claims SET status='delivered',received_at=CURRENT_TIMESTAMP WHERE id=? AND member_id=?",claim.id,actor.id);break;
 }
 case 'UPDATE_CLAIM':{
  requireCan(actor,'manage_reunion');if(!['claimed','ordered','ready','shipped','delivered'].includes(input.status))throw new UserError('Choose an order status');if(!await db.prepare('SELECT id FROM shirt_claims WHERE id=?').bind(input.id||'').first())throw new UserError('Order not found',404);const tracking=webUrl(input.trackingUrl||'',['ups.com','usps.com','tools.usps.com','fedex.com','dhl.com']);q('UPDATE shirt_claims SET status=?,tracking_url=? WHERE id=?',input.status,tracking||null,input.id);audit('shirt-status-update',input.id);break;
 }
 case 'SAVE_PRODUCT':{
  requireCan(actor,'manage_reunion');const p=input.product||{},name=text(p.name,100,true);let options;try{options=merchandiseOptions(p.options||[])}catch(e){throw new UserError(e.message)}
  const previous=p.id?await db.prepare('SELECT * FROM products WHERE id=? AND deleted_at IS NULL').bind(p.id).first():null;if(p.id&&!previous)throw new UserError('Item not found',404);const old=json(previous?.data_json),photo=p.photo===old.photo?old.photo:p.photo?(await ownedFiles(db,actor,[{url:p.photo}]))[0]:null;if(photo?.type&&!/^image\/(png|jpeg|webp|gif)$/.test(photo.type))throw new UserError('Choose an image for this item');
  result.id=p.id||uuid();q('INSERT INTO products(id,name,description,data_json,active) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,data_json=excluded.data_json,active=excluded.active',result.id,name,text(p.description||'',1000),JSON.stringify({color:/^#[a-fA-F0-9]{6}$/.test(p.color||'')?p.color:'#24452f',price:text(p.price||'',60),photo:typeof photo==='string'?photo:photo?.url||null,options}),p.active===false?0:1);audit('merchandise-save',result.id);break;
 }
 case 'SET_NOTIFICATION_SCOPE':case 'SET_SELECTED_NOTIFICATION_IDS':case 'SET_NOTIFICATION_SETTINGS':{
  const patch=input.type==='SET_NOTIFICATION_SCOPE'?{scope:input.value,globalOff:input.value==='off'}:input.type==='SET_SELECTED_NOTIFICATION_IDS'?{selectedIds:input.ids}:input.value;
  sql.push(...await notificationSettingsStatements(db,actor,patch));break;
 }
 case 'MARK_NOTICE_READ':case 'DISMISS_NOTICE':q(`UPDATE notifications SET ${input.type==='MARK_NOTICE_READ'?'read_at':'dismissed_at'}=CURRENT_TIMESTAMP WHERE id=? AND recipient_id=?${input.type==='MARK_NOTICE_READ'?" AND kind!='message.created'":''}`,input.id,actor.id);break;
 case 'RENAME_GROUP':{
  const membership=await db.prepare('SELECT member_id FROM family_group_members WHERE group_id=? AND member_id=? AND is_manager=1').bind(input.id,actor.id).first();if(!can(actor,'manage_members')&&!membership)throw new UserError('Only this group’s manager can change its name',403);q('UPDATE family_groups SET name=?,name_override=? WHERE id=?',text(input.name,100,true),text(input.name,100,true),input.id);audit('rename-group',input.id);break;
 }
 case 'FEATURE_MEMORY':{
  requireCan(actor,'manage_members');const id=text(input.id,80,true),row=await db.prepare('SELECT data_json FROM memories WHERE id=? AND deleted_at IS NULL').bind(id).first();if(!row)throw new UserError('Memory not found',404);const m=json(row.data_json);if(!(m.mediaType||'image/jpeg').startsWith('image/'))throw new UserError('Only photos can be featured');
  if(input.approved===true){if(input.primary===true)q('UPDATE featured_memories SET is_primary=0 WHERE is_primary=1');q('INSERT INTO featured_memories(memory_id,media_url,approved_by,is_primary) VALUES(?,?,?,?) ON CONFLICT(memory_id) DO UPDATE SET media_url=excluded.media_url,approved_by=excluded.approved_by,is_primary=CASE WHEN excluded.is_primary=1 THEN 1 ELSE featured_memories.is_primary END,approved_at=CURRENT_TIMESTAMP',id,m.image,actor.id,input.primary===true?1:0)}else q('DELETE FROM featured_memories WHERE memory_id=?',id);audit(input.approved?'feature_memory':'unfeature_memory',id);break;
 }
 case 'ADD_MEMORY':case 'SAVE_MEMORY':{
  requireCan(actor,'post');const m=input.memory||{};if(m.id&&!/^[a-zA-Z0-9-]{8,80}$/.test(m.id))throw new UserError('Invalid memory identifier');if(input.type==='SAVE_MEMORY'){const old=await db.prepare('SELECT author_id FROM memories WHERE id=? AND deleted_at IS NULL').bind(m.id||'').first();if(!old)throw new UserError('Memory not found',404);if(old.author_id!==actor.id&&!can(actor,'moderate'))throw new UserError('You cannot edit this memory',403)}
  const oldMemory=input.type==='SAVE_MEMORY'?await db.prepare('SELECT data_json FROM memories WHERE id=?').bind(m.id).first():null;const sameImage=oldMemory&&json(oldMemory.data_json).image===m.image;const files=sameImage?[{url:m.image,type:json(oldMemory.data_json).mediaType||'image/jpeg'}]:await ownedFiles(db,actor,[{url:m.image}]);if(!/^(image|video|audio)\//.test(files[0].type)&&files[0].type!=='application/pdf')throw new UserError('Choose a photo, video, audio or PDF memory');const memberIds=await directorySelection(db,m.memberIds??[],{ancestors:true});
  const capturedDate=m.capturedDate||'';if(capturedDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(capturedDate)||capturedDate<'1600-01-01'||capturedDate>new Date().toISOString().slice(0,10)||Number.isNaN(Date.parse(capturedDate+'T12:00:00Z'))||new Date(capturedDate+'T12:00:00Z').toISOString().slice(0,10)!==capturedDate))throw new UserError('Check the memory date');
  const value={title:text(m.title||'',120),image:files[0].url,mediaType:files[0].type,capturedDate,dateStatus:['suggested','confirmed','approximate'].includes(m.dateStatus)?m.dateStatus:'unknown',dateSource:text(m.dateSource||'',60),category:text(m.category||'',60),event:text(m.event||'',100),year:text(m.year||'',4),milestone:text(m.milestone||'',100),tags:Array.isArray(m.tags)?m.tags.slice(0,20).map(x=>text(x,40)):[],memberIds};result.id=m.id||uuid();if(input.type==='ADD_MEMORY'){q('INSERT INTO memories(id,author_id,data_json) VALUES(?,?,?)',result.id,actor.id,JSON.stringify(value));q('INSERT INTO posts(id,author_id,body,metadata_json) VALUES(?,?,?,?)',result.id,actor.id,value.title||'Shared a memory',JSON.stringify({files,memoryId:result.id,memberIds}))}else{q('UPDATE memories SET data_json=? WHERE id=?',JSON.stringify(value),result.id);q('UPDATE posts SET body=?,metadata_json=? WHERE id=?',value.title||'Shared a memory',JSON.stringify({files,memoryId:result.id,memberIds}),result.id);if(!sameImage)q('DELETE FROM featured_memories WHERE memory_id=?',result.id)}break;
 }
 case 'REPORT':{
  if(!await accessibleTarget(db,actor,input.targetId))throw new UserError('Item not found',404);result.id=uuid();q('INSERT INTO moderation_reports(id,reporter_id,target_id,reason) VALUES(?,?,?,?)',result.id,actor.id,input.targetId,text(input.reason,1000,true));break;
 }
 case 'MODERATE':{
  requireCan(actor,'moderate');const report=await db.prepare('SELECT * FROM moderation_reports WHERE id=?').bind(input.id).first();if(!report)throw new UserError('Report not found',404);if(!['removed','dismissed'].includes(input.status))throw new UserError('Choose a moderation decision');q('UPDATE moderation_reports SET status=?,resolved_by=? WHERE id=?',input.status,actor.id,report.id);if(input.status==='removed'){q('UPDATE posts SET deleted_at=CURRENT_TIMESTAMP WHERE id=?',report.target_id);q('UPDATE comments SET deleted_at=CURRENT_TIMESTAMP WHERE id=?',report.target_id);q('UPDATE memories SET deleted_at=CURRENT_TIMESTAMP WHERE id=?',report.target_id)}audit('moderation-'+input.status,report.target_id);break;
 }
 case 'APPROVE_MEMBER':{
  requireCan(actor,'manage_members');if(!['active','suspended'].includes(input.status)||input.id===actor.id)throw new UserError('Choose another membership to update');const roles=Array.isArray(input.roles)?[...new Set(input.roles)]:[];if(roles.some(r=>!['admin','moderator','planner','treasurer'].includes(r)))throw new UserError('Check the selected roles');q('UPDATE members SET status=?,roles_json=?,can_post=? WHERE id=?',input.status,JSON.stringify(roles),input.canPost===true?1:0,input.id);audit('membership-'+input.status,input.id);break;
 }
 default:{try{const h=await householdCommand(db,actor,input,q,audit);if(!h)throw new UserError('This action is not supported');Object.assign(result,h)}catch(e){if(e instanceof UserError)throw e;if(e.status)throw new UserError(e.message,e.status);throw e}break;}
 }
 q('INSERT INTO command_receipts(member_id,request_id,result_json,operation,fingerprint) VALUES(?,?,?,?,?)',actor.id,input.requestId,JSON.stringify(result),input.type,fingerprint);
 try{await db.batch(sql)}catch(error){const completed=await db.prepare('SELECT * FROM command_receipts WHERE member_id=? AND request_id=?').bind(actor.id,input.requestId).first();if(completed){if(completed.fingerprint&&(completed.fingerprint!==fingerprint||completed.operation!==input.type))throw new UserError('This request identifier was already used for different content',409);return json(completed.result_json)}if(String(error.message).includes('valid=1'))throw new UserError('Notification settings changed on another device. Refresh and try again.',409);throw error}
 return result;
}
