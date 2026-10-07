import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,reducer,loadLocalState,saveLocalState,resetPreview} from '../src/data-adapter.js';
import {derivePlanning} from '../src/planning-model.js';
import {normalizePayment,paymentMethods} from '../src/payment-model.js';
import {reunionArchived,reunionYear} from '../src/reunion-model.js';
const move=(s,id)=>reducer(s,{type:'SELECT_REUNION',id});
test('each preview year keeps separate RSVP, order, fees, payment methods, bag and calendar',()=>{
 let s=initialState();s=reducer(s,{type:'RSVP',value:{status:'Planning to come',count:3}});s=reducer(s,{type:'SET_FEES',value:'paid'});s=reducer(s,{type:'SET_PAYMENT',value:{amount:'$50',methods:[{provider:'cashApp',recipient:'$Fixture',url:'https://cash.app/$Fixture'}]}});s=reducer(s,{type:'SAVE_PRODUCT',product:{id:'old-item',name:'Old shirt',options:[]}});s=reducer(s,{type:'BAG_ADD',item:{productId:'old-item',sizes:{M:1}}});s=reducer(s,{type:'CLAIM_ORDER'});s=reducer(s,{type:'DETAILS',value:{date:'2026-07-01',location:'Old park'}});
 const saved={rsvp:s.rsvp,order:s.order,payment:s.payment,fees:s.fees};
 s=reducer(s,{type:'CREATE_REUNION',year:2028});s=move(s,'reunion-2028');
 for(const field of ['rsvp','order'])assert.equal(s[field],null);assert.equal(s.fees,'unpaid');assert.equal(s.products.length,0);assert.equal(s.bag.length,0);assert.equal(s.details.date,'');assert.deepEqual(paymentMethods(s.payment),[]);assert.equal(derivePlanning(s).hasReportedFee,false);
 s=reducer(s,{type:'RSVP',value:{status:'Can’t make it',count:1}});s=reducer(s,{type:'DETAILS',value:{location:'New park'}});s=move(s,'legacy');
 for(const [key,value]of Object.entries(saved))assert.deepEqual(s[key],value);assert.equal(s.details.location,'Old park');assert.equal(derivePlanning(s).hasReportedFee,true);assert.equal(s.previewOrders.length,1);
 s=move(s,'reunion-2028');assert.equal(s.rsvp.status,'Can’t make it');assert.equal(s.details.location,'New park');
});
test('planned years coexist, one active, archival preserves records and requires restore',()=>{
 let s=initialState();s=reducer(s,{type:'CREATE_REUNION',year:2028});s=reducer(s,{type:'CREATE_REUNION',year:2031});s=reducer(s,{type:'ACTIVATE_REUNION',id:'reunion-2028',archivePrevious:true});assert.equal(s.reunions.filter(r=>r.status==='active').length,1);assert.equal(s.activeReunionId,'reunion-2028');assert.equal(reunionArchived(s),true);
 assert.throws(()=>reducer(s,{type:'RSVP',value:{status:'Planning to come',count:2}}),/archived/);assert.throws(()=>reducer(s,{type:'ACTIVATE_REUNION',id:'legacy'}),/Restore/);assert.throws(()=>reducer(s,{type:'ARCHIVE_REUNION',id:'reunion-2028'}),/active/);
 s=reducer(s,{type:'RESTORE_REUNION',id:'legacy'});assert.equal(s.reunions.find(r=>r.id==='legacy').status,'planned');assert.equal(s.reunions.length,3);
 for(const value of ['annual','biennial','irregular'])assert.equal(reducer(s,{type:'SET_REUNION_CADENCE',value}).reunionCadence,value);
 assert.throws(()=>reducer(s,{type:'CREATE_REUNION',year:2028}),/already/);assert.throws(()=>reunionYear(1),/1900/);
});
test('preview persistence isolates years and reset removes all planned years',()=>{
 const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};let s=initialState();s=reducer(s,{type:'CREATE_REUNION',year:2029});s=move(s,'reunion-2029');s=reducer(s,{type:'RSVP',value:{count:2,status:'Planning to come'}});assert.equal(saveLocalState(s,storage).ok,true);s=loadLocalState(storage);assert.equal(s.selectedReunionId,'reunion-2029');assert.equal(s.rsvp.count,2);assert.equal(move(s,'legacy').rsvp,null);assert.equal(resetPreview(storage).reunions.length,1);
});
test('outdated forms and wrong-year planning record caches cannot cross year boundary',()=>{
 let s=reducer(initialState(),{type:'CREATE_REUNION',year:2028});s=move(s,'reunion-2028');assert.throws(()=>reducer(s,{type:'SET_PAYMENT',reunionId:'legacy',value:{}}),/selected reunion/);
 s.planningRecords={accountId:s.selfId,reunionId:'legacy',feeReports:[{status:'confirmed'}]};assert.equal(derivePlanning(s).hasConfirmedFee,false);
});
test('payment methods preserve old destinations and validate known service URLs',()=>{
 const p=normalizePayment({amount:' $50 ',paypal:'https://paypal.me/FamilyFixture',cashApp:'https://cash.app/$FamilyFixture'});assert.equal(p.methods.length,2);assert.equal(p.amount,'$50');assert.equal(p.paypal,'https://paypal.me/FamilyFixture');
 const manual=normalizePayment({methods:[{provider:'zelle',recipient:'Family treasurer',instructions:'Ask the treasurer for the approved address.'},{provider:'other',label:'Cash at check-in',instructions:'Bring your contribution to the welcome desk.'}]});assert.equal(manual.methods[1].url,'');
 for(const url of ['javascript:alert(1)','http://cash.app/$User','https://user:password@cash.app/$User','https://cash.app.evil.test/$User','https://cash.app/$User?amount=100'])assert.throws(()=>normalizePayment({methods:[{provider:'cashApp',url}]}));
 assert.throws(()=>normalizePayment({methods:[{provider:'other',label:'',recipient:'Someone'}]}));assert.throws(()=>normalizePayment({methods:[{provider:'paypal'}]}));
});
