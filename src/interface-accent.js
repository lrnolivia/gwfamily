// Device appearance only; profile identity colors remain in the member record.
// Hide only Appearance's free-form color picker; preset accents stay available.
export const CUSTOM_ACCENT_PICKER_ENABLED=false;
export const INTERFACE_ACCENT_KEY='gw-interface-accent:v1';
export const validAccentColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function readInterfaceAccent(storage){
 let mode='family';try{const saved=JSON.parse(storage?.getItem(INTERFACE_ACCENT_KEY)||'null');if(saved&&['family','profile','custom'].includes(saved.mode)&&validAccentColor(saved.color))return {mode:saved.mode,color:saved.color.toLowerCase()};}catch{}
 return {mode,color:'#4f996c'};
}
export function interfaceAccentColor(preference,profileColor,previewColor){return preference.mode==='custom'?preference.color:preference.mode==='profile'?(previewColor||profileColor||null):null;}
export function unlinkInterfaceAccent(preference,profileColor){return {...preference,mode:'custom',color:preference.mode==='profile'&&validAccentColor(profileColor)?profileColor:preference.color};}
