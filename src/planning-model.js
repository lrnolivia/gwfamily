// One read-only model for planning navigation, checklists and task nudges.
// A bag, a payment link click, and a self-reported payment are never completion.
export const PLANNING_TASKS=Object.freeze([
 {id:'rsvp',label:'RSVP',icon:'calendar',destination:'rsvp'},
 {id:'shirts',label:'Shirt selection',icon:'shirt',destination:'shop'},
 {id:'fees',label:'Reunion fees',icon:'wallet',destination:'planner'}
]);
export const PLANNING_STATUS=Object.freeze({complete:'Complete',todo:'To do',pending:'Awaiting confirmation',waiting:'After your decision','not-needed':'Not needed',review:'Check coverage',private:'Private'});
const savedAttendance=Object.freeze({'Planning to come':'attending','Still deciding':'undecided','Can’t make it':'not-attending',"Can't make it":'not-attending'});
export function attendanceFor(rsvp){return savedAttendance[rsvp?.status]||'unanswered'}
const array=value=>Array.isArray(value)?value:[];
const orderStatuses=new Set(['claimed','ordered','ready','shipped','delivered','received']);
function savedQuantity(order){
 if(!order?.id||!orderStatuses.has(order.status))return 0;
 return array(order.items||order.lines).reduce((total,line)=>total+(Number.isInteger(line.quantity)&&line.quantity>0?line.quantity:Object.values(line.sizes||{}).filter(n=>Number.isInteger(n)&&n>0).reduce((a,b)=>a+b,0)),0);
}
function task(id,status,detail){return {...PLANNING_TASKS.find(t=>t.id===id),status,statusLabel:PLANNING_STATUS[status],complete:status==='complete',required:!['not-needed','private','review'].includes(status),detail}}
export function deriveAccountPlan({memberId,rsvp=null,order=null,orders,feeStatus='unpaid',feeReports}={}){
 const attendance=attendanceFor(rsvp),saved=attendance!=='unanswered',notAttending=attendance==='not-attending';
 const savedOrders=Array.isArray(orders)?orders:order?[order]:[],quantity=savedOrders.reduce((n,o)=>n+savedQuantity(o),0);
 const reports=array(feeReports),confirmed=reports.some(r=>r.status==='confirmed')||(!Array.isArray(feeReports)&&feeStatus==='confirmed');
 const reported=!confirmed&&(reports.some(r=>r.status==='reported')||(!Array.isArray(feeReports)&&['paid','reported'].includes(feeStatus)));
 const rejected=!confirmed&&!reported&&(reports.some(r=>r.status==='rejected')||(!Array.isArray(feeReports)&&feeStatus==='rejected'));
 const attendanceStatus=attendance==='attending'?'todo':'waiting';
 const tasks=[task('rsvp',saved?'complete':'todo',saved?rsvp.status:'Save your household reply.'),
  task('shirts',notAttending?'not-needed':quantity?'complete':attendanceStatus,notAttending?(quantity?'Saved order retained. Your RSVP does not cancel it.':'You’re not attending. No selection needed.'):quantity?`${quantity} ${quantity===1?'item':'items'} in saved orders. This does not confirm payment.`:attendance==='attending'?'Choose sizes and place your order.':'Choose shirts after you decide to attend.'),
  task('fees',notAttending?'not-needed':confirmed?'complete':reported?'pending':attendanceStatus,notAttending?(confirmed?'Confirmed contribution retained. No refund is requested.':reported?'Your existing payment report is retained.':'You’re not attending. No contribution task.'):confirmed?'Receipt confirmed by the treasurer.':reported?'Reported as sent. Waiting for the treasurer.':rejected?'Not received. Review your report with the treasurer.':attendance==='attending'?'Report your contribution after sending it.':'Review fees after you decide to attend.')];
 const required=tasks.filter(t=>t.required),completed=required.filter(t=>t.complete).length,nextTask=tasks.find(t=>t.status==='todo')||null;
 const summary=notAttending?'RSVP saved. No attendance tasks needed.':reported&&!nextTask?'Waiting for contribution confirmation.':attendance==='undecided'?'RSVP saved. Update it when your plans are decided.':!nextTask&&completed===required.length?'Your planning tasks are complete.':`${completed} of ${required.length} tasks complete.`;
 return {memberId,attendance,tasks,byId:Object.fromEntries(tasks.map(t=>[t.id,t])),nextTask,summary,completed,required:required.length,quantity,hasConfirmedFee:confirmed,hasReportedFee:reported};
}
export function derivePlanning(state={}){
 const records=state.planningRecords?.accountId===state.selfId?state.planningRecords:null;
 const account=deriveAccountPlan({memberId:state.selfId,rsvp:state.rsvp,order:state.order,
  orders:records?.orders||(state.mode==='preview'&&state.previewOrders?.length?state.previewOrders:undefined),feeStatus:state.fees,
  feeReports:records?.feeReports||(state.mode==='preview'&&state.previewFeeReports?.length?state.previewFeeReports:undefined)});
 const people=array(state.members),me=people.find(m=>m.id===state.selfId),household=array(state.households).find(h=>h.id===state.householdId&&array(h.memberIds).includes(state.selfId));
 const own={memberId:state.selfId,name:me?.name||'You',relationship:'Your saved household records',tasks:account.tasks,private:false};
 // Household membership/headship does not authorize another adult's financial
 // or attendance records. Children remain visible only to their own guardian.
 const members=[own,...people.filter(m=>m.managedBy===state.selfId&&m.id!==state.selfId).map(m=>({memberId:m.id,name:m.name,relationship:'Managed by you · household coverage',private:false,tasks:account.tasks.map(t=>{
  if(t.status==='not-needed')return {...t};
  if(t.id==='rsvp')return task('rsvp',account.attendance==='not-attending'?'complete':'review',account.attendance==='not-attending'?'Your household replied Can’t make it.':state.rsvp?`Household reply saved for ${state.rsvp.count} ${state.rsvp.count===1?'person':'people'}. Confirm this person is included.`:'Include this person in your household reply.');
  if(t.id==='fees')return task('fees','review',account.hasConfirmedFee?'Household contribution confirmed. Individual coverage is not recorded.':account.hasReportedFee?'Household contribution reported. Individual coverage is not recorded.':'Covered through your household contribution; no separate payment is assumed.');
  return task('shirts','review',account.quantity?'Order saved. Sizes are not assigned to named family members.':'Include this person’s size in your household order.');
 })})),...people.filter(m=>m.id!==state.selfId&&!m.managedBy&&array(household?.memberIds).includes(m.id)).map(m=>({memberId:m.id,name:m.name,relationship:'Manages their own private plans',private:true,tasks:PLANNING_TASKS.map(t=>task(t.id,'private','This person manages their own saved records.'))}))];
 return {...account,members};
}
// Only task reminders use this function. Ordinary messages, account alerts,
// order updates and payment confirmations are deliberately outside its scope.
export function planningReminderAllowed(plan,taskId,{authorized=false,settings}={}){
 if(authorized!==true||!PLANNING_TASKS.some(t=>t.id===taskId)||!plan?.memberId)return false;
 if(settings?.globalOff||settings?.scope==='off'||settings?.categories?.[taskId==='rsvp'?'reunion':taskId==='shirts'?'orders':'fees']===false)return false;
 return plan.byId?.[taskId]?.status==='todo';
}
