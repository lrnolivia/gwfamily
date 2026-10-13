import {UserError,json} from './family-service.mjs';
import {directorySelection} from './member-directory.mjs';
import {can} from './policy.mjs';
import {CATEGORIES,DEFAULT_CATEGORIES,channelDefault,eligibleMemberSql,resourceAccessSql,followingSql} from './notification-policy.mjs';
// Email and push are per category; a stored choice wins, otherwise channelDefault.
const CHANNELS=['inApp','email','push'];
const EXTERNAL_CHANNELS=['email','push'];
const channelChoices=(stored,categories)=>Object.fromEntries(CATEGORIES.map(k=>[k,{inApp:categories[k],...Object.fromEntries(EXTERNAL_CHANNELS.map(c=>[c,typeof stored?.[k]?.[c]==='boolean'?stored[k][c]:channelDefault(k,c)]))}]));
const storedChannels=channels=>Object.fromEntries(Object.entries(channels).map(([k,v])=>[k,Object.fromEntries(EXTERNAL_CHANNELS.filter(c=>typeof v[c]==='boolean'&&v[c]!==channelDefault(k,c)).map(c=>[c,v[c]]))]).filter(([,v])=>Object.keys(v).length));
const rows=r=>r.results||[];
const stamp=v=>v?Date.parse(/Z$|[+-]\d\d:\d\d$/.test(v)?v:v.replace(' ','T')+'Z'):null;
const titles={
 'family_calendar.changed':'Your family event was edited','family_calendar.removed':'Your family event was removed',
 'post.published':'A new family update','memory.published':'A new shared memory','post.tagged':'You were tagged in an update','memory.tagged':'You were tagged in a memory',
 'comment.created':'Someone replied to your post','reply.created':'A new reply in your conversation','reaction.added':'Someone reacted to your contribution',
 'announcement.published':'A family leader announcement','birthday.celebrated':'A family birthday celebration',
 'household.invited':'You have a household invitation','household.requested':'A household request needs attention','household.resolved':'A household request was updated',
 'fee.reported':'A contribution report needs review','fee.status_changed':'Your contribution report was updated','order.claimed':'A new merchandise request','order.status_changed':'Your merchandise request was updated',
 'membership.requested':'A membership request needs review','membership.status_changed':'Your membership was updated','membership.role_changed':'Your family permissions were updated',
 'reunion.changed':'Reunion details were updated','conversation.invited':'You have a conversation invitation','conversation.invitation_resolved':'A conversation invitation was answered',
 'message.created':'You have a new message','conversation.member_changed':'Conversation membership was updated','conversation.role_changed':'Conversation permissions were updated','conversation.name_changed':'A conversation name was updated',
 post:'A new family update',comment:'A new family reply'
};
const resourceKind="COALESCE(n.resource_kind,CASE WHEN n.kind IN ('post','comment') AND n.subject_id IS NOT NULL THEN 'post' END)";
const resourceId='COALESCE(n.resource_id,n.subject_id)';
const scope="COALESCE(p.scope,'leaders')";
const joins=`FROM notifications n JOIN notification_sequence seq ON seq.notification_id=n.id LEFT JOIN notification_events e ON e.id=n.event_id LEFT JOIN notification_preferences p ON p.member_id=n.recipient_id LEFT JOIN notification_settings s ON s.member_id=n.recipient_id`;
const access=resourceAccessSql({kind:resourceKind,id:resourceId,container:'n.container_id',member:'n.recipient_id',revision:'e.resource_revision'});
// A settings change can subtract an already-eligible recipient, never create a
// historic recipient. Unread totals and pages use this exact predicate.
const authorized=`n.recipient_id=? AND n.dismissed_at IS NULL AND ${eligibleMemberSql('n.recipient_id')} AND (${access}) AND (e.expires_at IS NULL OR e.expires_at>CURRENT_TIMESTAMP) AND ${scope}!='off' AND COALESCE(s.global_off,0)=0 AND (n.category!='following' OR ${followingSql('n.recipient_id',"COALESCE(e.actor_id,json_extract(n.data_json,'$.authorId'),(SELECT author_id FROM posts WHERE id=n.subject_id))",scope,'p.selected_ids_json')})`;
// Delivery-only records remain hidden from inbox pages, totals and bulk actions.
const visible=`${authorized} AND COALESCE(json_extract(s.categories_json,'$.'||n.category),1)=1`;
// A delivered link can open while In app is off. The recipient, resource,
// Following, expiry and global-off policy is identical to the inbox policy.
const openable=`${authorized} AND (COALESCE(json_extract(s.categories_json,'$.'||n.category),1)=1 OR COALESCE(json_extract(s.channels_json,'$.'||n.category||'.email'),CASE WHEN n.category IN ('following','mentions','replies','messages') THEN 0 ELSE 1 END)=1 OR COALESCE(json_extract(s.channels_json,'$.'||n.category||'.push'),CASE WHEN n.category IN ('following','mentions') THEN 0 ELSE 1 END)=1)`;
export async function notificationSettings(db,actor){
 // Read Following and its revision in one database snapshot. Split reads can
 // pair a stale scope with a newer revision and defeat a revisionless save's CAS.
 const row=await db.prepare(`SELECT p.scope,p.selected_ids_json,s.following_scope,s.categories_json,s.channels_json,s.global_off,s.revision
  FROM (SELECT ? AS member_id) viewer
  LEFT JOIN notification_preferences p ON p.member_id=viewer.member_id
  LEFT JOIN notification_settings s ON s.member_id=viewer.member_id`).bind(actor.id).first();
 const categories={...DEFAULT_CATEGORIES,...json(row.categories_json)};
 return {accountId:actor.id,scope:row.scope==='off'?(row.following_scope||'leaders'):row.scope||row.following_scope||'leaders',selectedIds:json(row.selected_ids_json,[])||[],categories,channels:channelChoices(json(row.channels_json),categories),globalOff:row.scope==='off'||!!row.global_off,revision:row.revision||0,pushEnabled:false};
}
export async function notificationSettingsStatements(db,actor,patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new UserError('Check notification settings');
 const allowed=['scope','selectedIds','selectedMemberIds','categories','channels','globalOff','revision'];
 if(Object.keys(patch).some(k=>!allowed.includes(k)))throw new UserError('Unsupported notification setting');
 const before=await notificationSettings(db,actor);let selected=patch.selectedIds??patch.selectedMemberIds??before.selectedIds;
 if(patch.selectedIds!==undefined||patch.selectedMemberIds!==undefined)try{selected=await directorySelection(db,selected,{max:200})}catch(e){throw new UserError(e.message,e.status||400)}
 let nextScope=patch.scope??before.scope;if(nextScope==='loved')nextScope='loved_ones';
 if(!['all','family','loved_ones','leaders','selected','off'].includes(nextScope))throw new UserError('Choose a Following audience');
 if(patch.globalOff!==undefined&&typeof patch.globalOff!=='boolean')throw new UserError('Choose whether notifications are on');
 const off=nextScope==='off'?true:patch.globalOff??before.globalOff;
 if(nextScope==='off')nextScope=before.scope;
 const categories={...before.categories},channels=structuredClone(before.channels);
 if(patch.categories!==undefined){
  if(!patch.categories||typeof patch.categories!=='object'||Array.isArray(patch.categories)||Object.entries(patch.categories).some(([k,v])=>!CATEGORIES.includes(k)||typeof v!=='boolean'))throw new UserError('Check notification categories');
  // An older client only knows the all-channel category switch. Preserve its
  // opt-out, and never use its On choice to undo a later explicit channel off.
  for(const [k,on] of Object.entries(patch.categories)){categories[k]=on;channels[k].inApp=on;if(!on){channels[k].email=false;channels[k].push=false}}
 }
 if(patch.channels!==undefined){
  if(!patch.channels||typeof patch.channels!=='object'||Array.isArray(patch.channels)||Object.entries(patch.channels).some(([k,v])=>!CATEGORIES.includes(k)||!v||typeof v!=='object'||Array.isArray(v)||Object.entries(v).some(([c,on])=>!CHANNELS.includes(c)||typeof on!=='boolean')))throw new UserError('Check notification channels');
  for(const [k,v] of Object.entries(patch.channels)){
   if(patch.categories?.[k]!==undefined)throw new UserError('Choose either a category or its individual channels');
   Object.assign(channels[k],v);if(v.inApp!==undefined)categories[k]=v.inApp;
  }
 }
 if(patch.revision!==undefined&&(!Number.isSafeInteger(patch.revision)||patch.revision<0))throw new UserError('Use a valid settings revision');
 const revision=patch.revision??before.revision;if(revision!==before.revision)throw new UserError('Notification settings changed on another device. Refresh and try again.',409);
 // The prefix lets additive migration triggers distinguish an independent
 // In app edit from a category-off written by a rollback Worker.
 const token='channels:'+crypto.randomUUID();
 const statements=[
  db.prepare(`INSERT INTO notification_settings(member_id,categories_json,channels_json,global_off,following_scope,revision,write_token) VALUES(?,?,?,?,?,1,?) ON CONFLICT(member_id) DO UPDATE SET categories_json=excluded.categories_json,channels_json=excluded.channels_json,global_off=excluded.global_off,following_scope=excluded.following_scope,revision=notification_settings.revision+1,write_token=excluded.write_token,updated_at=CURRENT_TIMESTAMP WHERE notification_settings.revision=?`).bind(actor.id,JSON.stringify(categories),JSON.stringify(storedChannels(channels)),off?1:0,nextScope,token,revision),
  // A failed compare-and-swap rolls back the whole D1 batch, including receipts.
  db.prepare(`INSERT INTO notification_setting_guards(token,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM notification_settings WHERE member_id=? AND write_token=?) THEN 1 ELSE 0 END`).bind(token,actor.id,token),
  db.prepare(`INSERT INTO notification_preferences(member_id,scope,selected_ids_json) VALUES(?,?,?) ON CONFLICT(member_id) DO UPDATE SET scope=excluded.scope,selected_ids_json=excluded.selected_ids_json`).bind(actor.id,off?'off':nextScope,JSON.stringify(selected)),
  db.prepare('DELETE FROM notification_setting_guards WHERE token=?').bind(token)
 ];
 return statements;
}
export async function saveNotificationSettings(db,actor,patch){
 try{await db.batch(await notificationSettingsStatements(db,actor,patch))}catch(e){if(String(e.message).includes('valid=1'))throw new UserError('Notification settings changed on another device. Refresh and try again.',409);throw e}
 return notificationSettings(db,actor);
}
function target(row,actor){
 const kind=row.resource_kind||(['post','comment'].includes(row.kind)?'post':null),id=row.resource_id||row.subject_id;
 const meta=json(row.event_data_json)||{};
 return {kind,id,containerId:row.container_id||null,anchorId:kind==='comment'?id:meta.messageId||null,...(kind==='conversation'&&meta.sequence?{sequence:meta.sequence}:{}),...(['fee','order','member'].includes(kind)?{section:can(actor,kind==='fee'?'confirm_fees':kind==='order'?'manage_reunion':'manage_members')?'planner':'you'}:{})};
}
function serialize(row,actor){const meta=json(row.event_data_json)||{},moderation=row.resource_kind==='family_calendar_moderation';return {id:row.id,kind:row.kind,category:row.category,title:titles[row.kind]||'A family update',text:moderation?String(meta.title||'Family event')+': '+String(meta.reason||'A moderator updated this event.'):'Open to view the latest details.',createdAt:stamp(row.created_at),sequence:row.sequence,readAt:row.read_at||null,target:target(row,actor),targetId:row.container_id||row.resource_id||row.subject_id};}
function integer(value,name,min=0,max=Number.MAX_SAFE_INTEGER){const n=typeof value==='string'&&/^\d+$/.test(value)?Number(value):value;if(!Number.isSafeInteger(n)||n<min||n>max)throw new UserError('Use a valid '+name);return n}
export async function listNotifications(db,actor,{limit=50,before}={}){
 limit=integer(limit,'page limit',1,100);if(before!==undefined&&before!==null)before=integer(before,'notification cursor',1);
 const found=rows(await db.prepare(`SELECT n.*,seq.sequence,e.data_json AS event_data_json ${joins} WHERE ${visible}${before?' AND seq.sequence<?':''} ORDER BY seq.sequence DESC LIMIT ?`).bind(actor.id,...(before?[before]:[]),limit+1).all());
 const totals=await db.prepare(`SELECT COALESCE(SUM(CASE WHEN n.read_at IS NULL AND n.kind!='message.created' THEN 1 ELSE 0 END),0) AS unread_count,COALESCE(SUM(CASE WHEN n.read_at IS NULL AND n.kind='message.created' THEN 1 ELSE 0 END),0) AS message_unread_count,COALESCE(MAX(seq.sequence),0) AS cutoff ${joins} WHERE ${visible}`).bind(actor.id).first();
 const page=found.slice(0,limit);
 return {accountId:actor.id,notifications:page.map(n=>serialize(n,actor)),unreadCount:totals.unread_count,messageUnreadCount:totals.message_unread_count,readAllCutoff:totals.cutoff,nextCursor:found.length>limit?page.at(-1).sequence:null,settings:await notificationSettings(db,actor)};
}
export async function markNotification(db,actor,id,dismiss=false){
 if(typeof id!=='string'||!id||id.length>100)throw new UserError('Use a valid notification');
 await db.prepare(`UPDATE notifications SET ${dismiss?'dismissed_at=COALESCE(dismissed_at,CURRENT_TIMESTAMP)':'read_at=COALESCE(read_at,CURRENT_TIMESTAMP)'},updated_at=CURRENT_TIMESTAMP WHERE recipient_id=? AND id=?${dismiss?'':" AND kind!='message.created'"}`).bind(actor.id,id).run();return {ok:true};
}
export async function readAllNotifications(db,actor,cutoff){
 cutoff=integer(cutoff,'read-all cutoff');
 await db.prepare(`UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT n.id ${joins} WHERE ${visible} AND n.kind!='message.created' AND seq.sequence<=?)`).bind(actor.id,cutoff).run();return {ok:true,cutoff};
}
export async function dismissAllNotifications(db,actor,cutoff){
 cutoff=integer(cutoff,'clear-all cutoff');
 // The same eligibility predicate as the inbox covers earlier pages while
 // retaining hidden history, other accounts and arrivals after this snapshot.
 const result=await db.prepare(`UPDATE notifications SET dismissed_at=COALESCE(dismissed_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT n.id ${joins} WHERE ${visible} AND seq.sequence<=?)`).bind(actor.id,cutoff).run();
 return {ok:true,cutoff,dismissedCount:result.meta.changes};
}
export async function openNotification(db,actor,id){
 const row=await db.prepare(`SELECT n.*,seq.sequence,e.data_json AS event_data_json ${joins} WHERE ${openable} AND n.id=?`).bind(actor.id,id).first();
 if(!row)return {accountId:actor.id,available:false,message:'This update is no longer available.'};
 const t=target(row,actor),result={accountId:actor.id,available:true,target:t};
 if(['fee','order','reunion'].includes(t.kind)){
  const scoped=t.kind==='fee'?await db.prepare('SELECT reunion_id FROM fee_reports WHERE id=?').bind(t.id).first():t.kind==='order'?await db.prepare('SELECT reunion_id FROM shirt_claims WHERE id=?').bind(t.id).first():{reunion_id:t.id==='current'?'legacy':t.id};
  if(!scoped?.reunion_id||!await db.prepare('SELECT id FROM reunions WHERE id=?').bind(scoped.reunion_id).first())return {accountId:actor.id,available:false,message:'This reunion is no longer available.'};
  t.reunionId=scoped.reunion_id;
 }
 const postId=t.kind==='comment'?t.containerId:['post','memory'].includes(t.kind)?t.id:null;
 if(postId){
  // One transactional snapshot keeps the resource and all hydration rows on the
  // same authorization decision, even if membership changes between requests.
  const authorized=resourceAccessSql({kind:"'post'",id:'p.id',member:'viewer.id',container:'NULL'});
  const noticeGuard=`EXISTS(SELECT 1 ${joins} WHERE ${openable} AND n.id=?)`;
  const guard=`EXISTS(SELECT 1 FROM posts p CROSS JOIN (SELECT ? AS id) viewer WHERE p.id=? AND (${authorized}) AND ${noticeGuard})`;
  const snapshots=await db.batch([
   db.prepare(`SELECT p.* FROM posts p CROSS JOIN (SELECT ? AS id) viewer WHERE p.id=? AND (${authorized}) AND ${noticeGuard}`).bind(actor.id,postId,actor.id,id),
   db.prepare(`SELECT * FROM poll_votes WHERE post_id=? AND ${guard}`).bind(postId,actor.id,postId,actor.id,id),
   db.prepare(`SELECT * FROM comments WHERE post_id=? AND deleted_at IS NULL AND ${guard} ORDER BY created_at,id`).bind(postId,actor.id,postId,actor.id,id),
   db.prepare(`SELECT r.* FROM reactions r LEFT JOIN comments c ON c.id=r.comment_id WHERE (r.post_id=? OR (c.post_id=? AND c.deleted_at IS NULL)) AND ${guard}`).bind(postId,postId,actor.id,postId,actor.id,id),
   db.prepare(`SELECT * FROM memories WHERE id=? AND deleted_at IS NULL AND ${guard}`).bind(postId,actor.id,postId,actor.id,id)
  ]);
  const p=rows(snapshots[0])[0];if(!p)return {accountId:actor.id,available:false,message:'This update is no longer available.'};
  const meta=json(p.metadata_json),votes=rows(snapshots[1]);
  const poll=meta.poll?{...meta.poll,votes:{}}:null;if(poll)for(const v of votes.filter(v=>v.member_id!==actor.id))for(const i of json(v.options_json,[]))poll.votes[i]=(poll.votes[i]||0)+1;
  result.post={...meta,id:p.id,authorId:p.author_id,groupId:p.group_id,text:p.body,createdAt:stamp(p.created_at),poll};
  result.comments=rows(snapshots[2]).map(c=>({id:c.id,parentId:c.parent_id,authorId:c.author_id,text:c.body,files:json(c.files_json,[]),createdAt:stamp(c.created_at)}));
  result.reactions={};result.reactionCounts={};result.reactionMembers={};result.pollSelections=Object.fromEntries(votes.filter(v=>v.member_id===actor.id).map(v=>[v.post_id,json(v.options_json,[])]));
  for(const r of rows(snapshots[3])){const rid=r.post_id||r.comment_id;result.reactionMembers[rid]??={};(result.reactionMembers[rid][r.emoji]??=[]).push(r.member_id);result.reactionCounts[rid]??={};result.reactionCounts[rid][r.emoji]=(result.reactionCounts[rid][r.emoji]||0)+1;if(r.member_id===actor.id)(result.reactions[rid]??=[]).push(r.emoji)}
  if(t.kind==='memory'){const m=rows(snapshots[4])[0];if(m)result.memory={...json(m.data_json),id:m.id,authorId:m.author_id}}

 }
 return result;
}
