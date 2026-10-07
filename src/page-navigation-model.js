export function previousRouteForPush(current,next){return current?.type&&current.type!==next?.type||current?.id!==next?.id?{...current}:null}
export function pageIdentity(route,state={}){
 const lookup={home:'Home',reunion:'Reunion',family:'Family',you:'You',appearance:'Appearance','preview-help':'About this preview',install:'Add to your device',rsvp:'Your RSVP','family-checklist':'Planning checklist','planning-history':'Saved plans',tutorial:'Quick guide','notification-settings':'Notifications',inbox:'Messages','chat-new':'New conversation','chat-settings':'Conversation details','household-children':'Children','household-manage':'Manage household','household-invite':'Household invitation',birthdays:'Family birthdays',contact:'Contact card','edit-profile':'Edit profile',post:'Family post',memory:'Memory',shop:'Merchandise',planner:'Reunion plans',memories:'Memories','all-family':'All Family'};
 if(route?.type==='profile')return state.members?.find(m=>m.id===route.id)?.name||'Family profile';
 if(route?.type==='household')return state.households?.find(h=>h.id===(route.id||state.householdId))?.name||'Household';
 if(route?.type==='leader-tools')return ({overview:'Leader Tools',details:'Reunion details',shirts:'Merchandise',members:'People',fees:'Fees',calendar:'Calendar & Events'})[route.section]||'Leader Tools';
 return lookup[route?.type]||'Family';
}
export function backUnread(previous,messaging,{accountMatches=true}={}){
 if(!accountMatches||!previous||messaging?.loading||messaging?.error)return 0;
 if(previous.type==='inbox')return Math.max(0,Number(messaging.unread)||0);
 if(previous.type==='chat'){const c=messaging.conversations?.find(x=>x.id===previous.id);return Math.max(0,Number(c?.unreadCount)||0)}
 return 0;
}
