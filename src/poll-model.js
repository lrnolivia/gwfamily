// Server and preview poll totals exclude this account's vote. Add its saved
// selection exactly once, so changing a vote or reloading never adds a duplicate.
export function pollResults(poll,selection=[]){
 const options=Array.isArray(poll?.options)?poll.options:[],valid=[...new Set(selection)].filter(value=>Number.isInteger(value)&&value>=0&&value<options.length),selected=poll?.mode==='multiple'?valid:valid.slice(0,1),counts=options.map((_,index)=>(Number.isFinite(Number(poll?.votes?.[index]))?Math.max(0,Number(poll?.votes?.[index])):0)+(selected.includes(index)?1:0)),total=counts.reduce((sum,count)=>sum+count,0);
 return {selected,counts,total,percentages:counts.map(count=>total?count/total*100:0)};
}
export function nextPollSelection(selected,index,multiple=false){return multiple?selected.includes(index)?selected.filter(value=>value!==index):[...selected,index]:[index]}
