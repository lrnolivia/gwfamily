import {UserError} from './family-service.mjs';
import {listNotifications,notificationSettings,saveNotificationSettings,markNotification,readAllNotifications,openNotification} from './notification-service.mjs';
async function body(c){const value=await c.req.json();if(!value||typeof value!=='object'||Array.isArray(value))throw new UserError('Use a notification settings object');return value}
function expected(actor,value){if(value!==undefined&&value!==actor.id)throw new UserError('Your signed-in account changed. Refresh before trying again.',409)}
export function registerNotifications(app){
 app.get('/api/notifications',async c=>c.json(await listNotifications(c.env.DB,c.get('actor'),{limit:c.req.query('limit')??50,before:c.req.query('before')})));
 app.get('/api/me/notifications',async c=>c.json(await notificationSettings(c.env.DB,c.get('actor'))));
 app.put('/api/me/notifications',async c=>{const actor=c.get('actor'),{expectedAccountId,...value}=await body(c);expected(actor,expectedAccountId);return c.json(await saveNotificationSettings(c.env.DB,actor,value))});
 app.post('/api/notifications/read-all',async c=>{const actor=c.get('actor'),value=await body(c);expected(actor,value.expectedAccountId);return c.json({accountId:actor.id,...await readAllNotifications(c.env.DB,actor,value.cutoff)})});
 for(const operation of ['read','dismiss'])app.post('/api/notifications/:id/'+operation,async c=>{const actor=c.get('actor'),value=await body(c);expected(actor,value.expectedAccountId);return c.json({accountId:actor.id,...await markNotification(c.env.DB,actor,c.req.param('id'),operation==='dismiss')})});
 app.get('/api/notifications/:id/open',async c=>{const actor=c.get('actor');expected(actor,c.req.query('expectedAccountId'));return c.json(await openNotification(c.env.DB,actor,c.req.param('id')))});
 app.put('/api/conversations/:id/notifications',async c=>{
  const actor=c.get('actor'),value=await body(c);expected(actor,value.expectedAccountId);if(typeof value.muted!=='boolean')throw new UserError('Choose a conversation notification setting');
  const result=await c.env.DB.prepare(`UPDATE conversation_members SET notifications_muted=? WHERE conversation_id=? AND member_id=? AND status='active' AND EXISTS(SELECT 1 FROM conversations c WHERE c.id=conversation_members.conversation_id AND c.archived_at IS NULL)`).bind(value.muted?1:0,c.req.param('id'),actor.id).run();if(!result.meta.changes)throw new UserError('Conversation not found',404);return c.json({accountId:actor.id,muted:value.muted});
 });
}
