export const heritageRoles={
 'ancestral-head':{label:'Ancestral heads',titles:['Ancestral head','Matriarch','Patriarch'],defaultTitle:'Ancestral head',personKind:'ancestor'},
 'torch-bearer':{label:'Torch bearers',titles:['Torch bearer','Matriarch','Patriarch'],defaultTitle:'Torch bearer',personKind:'member'}
};
export function heritageTitle(entry){return heritageRoles[entry.role]?.titles.includes(entry.title)?entry.title:heritageRoles[entry.role]?.defaultTitle||'Family heritage'}
