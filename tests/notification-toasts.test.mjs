import test from 'node:test';import assert from 'node:assert/strict';
import {createNotificationArrivalTracker,notificationActionLabel} from '../src/notification-toasts.js';
test('silent initial snapshot, subsequent unread arrivals only, no account/history replay',()=>{
 const t=createNotificationArrivalTracker(),update=(account,items,extra={})=>t.update({account,items,ready:true,...extra});
 assert.deepEqual(update('A',[{id:'old',sequence:1}]),[]);
 assert.deepEqual(update('A',[{id:'new',sequence:2},{id:'old',sequence:1},{id:'read',readAt:3}]).map(n=>n.id),['new']);
 assert.deepEqual(update('A',[{id:'new',sequence:2}]),[]);
 assert.deepEqual(update('A',[{id:'earlier-page',sequence:0}]),[]);
 assert.deepEqual(update('B',[{id:'new',sequence:2}]),[]);
 assert.deepEqual(update('B',[{id:'paused',sequence:3}],{globalOff:true}),[]);
 assert.deepEqual(update('B',[{id:'paused',sequence:3}]),[]);
 assert.deepEqual(update('A',[{id:'new',sequence:2}]),[]);
});
test('contextual actions navigate to a review, never silently accept an invitation',()=>{
 assert.equal(notificationActionLabel({kind:'household.invited'}),'Review request');assert.equal(notificationActionLabel({kind:'message.created'}),'View message');assert.equal(notificationActionLabel({kind:'reply.created'}),'View reply');
});
