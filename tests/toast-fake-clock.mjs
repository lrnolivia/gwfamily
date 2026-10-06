import assert from 'node:assert/strict';
export function fakeClock(){
 let now=0,serial=0;const pending=new Map(),cancelled=[];
 const clock={now:()=>now,setTimeout(callback,delay){const id=++serial;pending.set(id,{callback,at:now+delay});return id;},clearTimeout(id){const item=pending.get(id);if(item)cancelled.push(item.callback);pending.delete(id);}};
 return {clock,pending,cancelled,elapse(ms){now+=ms;},advance(ms){const end=now+ms;let guard=0;while(true){const next=[...pending.entries()].filter(([,item])=>item.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;assert.ok(++guard<100,'No runaway timer loop');now=next[1].at;pending.delete(next[0]);next[1].callback();}now=end;}};
}
