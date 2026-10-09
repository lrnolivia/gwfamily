// A request may reduce the signed-in Leader's authority for a read. It can never
// grant authority or mutate the persisted member/session. Live view is read-only.
export function memberViewActor(actor,{enabled=false,expectedAccountId}={}){
 if(!enabled)return actor;
 if(expectedAccountId!==actor?.id)throw Object.assign(new Error('Your account changed. Exit member view and reload.'),{status:409});
 if(actor.isLeader!==true)throw Object.assign(new Error('Only a Family Leader can use member view.'),{status:403});
 return {...actor,isLeader:false,roles:[],viewAsMember:true};
}
