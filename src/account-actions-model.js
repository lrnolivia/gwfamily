// Preview presentation never changes the identity of the underlying session.
export function accountActionState({mode,preview,session,configured,reviewOnly=false}={}){
 const signedIn=session?.signedIn===true||mode==='live';
 return {signedIn,show:true,signOutRemote:!reviewOnly&&signedIn,canExitPreview:!reviewOnly&&Boolean(configured)&&Boolean(preview||mode==='preview')};
}
export const GW_HEADING_FONTS=Object.freeze([
 Object.freeze({value:'serif',label:'DM Serif Text',sample:'gw',className:'serif-sample'}),
 Object.freeze({value:'sans',label:'Momo Trust Display',sample:'gw',className:'sans-sample'})
]);
export const validHeadingFont=value=>GW_HEADING_FONTS.some(font=>font.value===value)?value:'sans';
