// Server refreshes may update a clean field, but never replace a typed draft.
// A conversation/account change deliberately seeds its own authorized name.
export function synchronizeConversationName(draft,previous,current){
 if(!current||typeof current.id!=='string')return draft;
 const name=typeof current.name==='string'?current.name:'';
 if(previous?.scope!==current.scope||previous?.id!==current.id)return name;
 return draft===previous.name?name:draft;
}
