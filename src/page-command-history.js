// Session-scoped semantic commands. Undo is a compensating edit against the
// current document, never replacement with an old whole-page snapshot.
const copy=value=>value===undefined?undefined:structuredClone(value);
const stable=value=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}':JSON.stringify(value);
const same=(a,b)=>stable(a)===stable(b);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function changes(before,after,path=[],patches=[]){
 if(same(before,after))return patches;
 if(path.at(-1)==='panels'&&Array.isArray(before)&&Array.isArray(after)&&[...before,...after].every(row=>object(row)&&typeof row.id==='string')){
  for(const id of new Set([...before,...after].map(row=>row.id)))changes(before.find(row=>row.id===id),after.find(row=>row.id===id),[...path,{id}],patches);
 }else if(object(before)&&object(after)){
  for(const key of new Set([...Object.keys(before),...Object.keys(after)]))changes(before[key],after[key],[...path,key],patches);
 }else patches.push({path,before:copy(before),after:copy(after),beforeExists:before!==undefined,afterExists:after!==undefined});
 return patches;
}
function at(value,path){for(const key of path){if(value===undefined||value===null)return undefined;value=typeof key==='object'?Array.isArray(value)?value.find(row=>row.id===key.id):undefined:value[key]}return value}
function write(value,path,next,exists){let parent=value;for(const key of path.slice(0,-1))parent=typeof key==='object'?parent.find(row=>row.id===key.id):parent[key];const last=path.at(-1);if(typeof last==='object'){const index=parent.findIndex(row=>row.id===last.id);if(exists){if(index<0)parent.push(copy(next));else parent[index]=copy(next)}else if(index>=0)parent.splice(index,1)}else if(exists)parent[last]=copy(next);else delete parent[last]}
export function createPageCommand(page,label,before,after){
 const patches=changes(before,after);
 // Undoing an addition archives the new panel. The server deliberately keeps
 // every authored panel recoverable, including panels whose add was autosaved.
 for(const patch of patches)if(patch.path.at(-2)==='panels'&&typeof patch.path.at(-1)==='object'&&!patch.beforeExists&&patch.afterExists){patch.before={...copy(patch.after),removed:true};patch.beforeExists=true}
 return patches.length?{page,label,patches}:null;
}
export function canApplyPageCommand(content,command,direction='undo'){
 if(!content||!command?.patches?.length)return false;const expected=direction==='undo'?'after':'before';return command.patches.every(patch=>{const parent=at(content,patch.path.slice(0,-1));if(!patch.path.length||(typeof patch.path.at(-1)==='object'?!Array.isArray(parent):!object(parent)))return false;const value=at(content,patch.path);return (value!==undefined)===patch[expected+'Exists']&&same(value,patch[expected])});
}
export function applyPageCommand(content,command,direction='undo'){
 if(!canApplyPageCommand(content,command,direction))throw Error('This part of the page changed after that edit. Review the latest content before undoing it.');const next=copy(content),destination=direction==='undo'?'before':'after';for(const patch of command.patches)write(next,patch.path,patch[destination],patch[destination+'Exists']);return next;
}
export function recordPageCommand(history,command,limit=50){return command?{past:[...history.past,command].slice(-limit),future:[]}:history}
export function stepPageCommand(history,direction='undo'){const undo=direction==='undo',source=undo?history.past:history.future,command=source.at(-1);if(!command)return history;return undo?{past:source.slice(0,-1),future:[...history.future,command]}:{past:[...history.past,command],future:source.slice(0,-1)}}
export function forgetPageCommands(history,page){return {past:history.past.filter(command=>command.page!==page),future:history.future.filter(command=>command.page!==page)}}
