// Relationship records alone establish edges; households never imply ancestry.
export function familyBranch(state,focusId){
 const people=[...(state.members||[]),...(state.memorials||[])],known=new Set(people.map(person=>person.id)),edges=(state.relationships||[]).filter(edge=>known.has(edge.from)&&known.has(edge.to)&&edge.from!==edge.to);
 const unique=rows=>rows.filter((row,index)=>rows.findIndex(other=>other.id===row.id&&other.type===row.type)===index);
 return {person:people.find(person=>person.id===focusId),parents:unique(edges.filter(edge=>['parent','stepparent'].includes(edge.type)&&edge.to===focusId).map(edge=>({id:edge.from,type:edge.type}))),children:unique(edges.filter(edge=>['parent','stepparent'].includes(edge.type)&&edge.from===focusId).map(edge=>({id:edge.to,type:edge.type}))),siblings:unique(edges.filter(edge=>edge.type==='siblings'&&(edge.from===focusId||edge.to===focusId)).map(edge=>({id:edge.from===focusId?edge.to:edge.from,type:edge.type})))};
}
