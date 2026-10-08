// Device appearance only; profile identity colors remain in the member record.
// Release flag: retain saved custom colors without offering or applying them.
export const CUSTOM_INTERFACE_ACCENTS_ENABLED=false;
export function interfaceAccentOptions(enabled=CUSTOM_INTERFACE_ACCENTS_ENABLED){return [{value:'family',label:'Default'},{value:'profile',label:'Profile'},...(enabled?[{value:'custom',label:'Custom'}]:[])];}
export function interfaceAccentMode(preference,enabled=CUSTOM_INTERFACE_ACCENTS_ENABLED){return preference.mode==='custom'&&!enabled?'family':preference.mode;}
export const INTERFACE_ACCENT_KEY='gw-interface-accent:v1';
export const validAccentColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function readInterfaceAccent(storage){
 let mode='family';try{const saved=JSON.parse(storage?.getItem(INTERFACE_ACCENT_KEY)||'null');if(saved&&['family','profile','custom'].includes(saved.mode)&&validAccentColor(saved.color))return {mode:saved.mode,color:saved.color.toLowerCase()};}catch{}
 return {mode,color:'#4f996c'};
}
export function interfaceAccentColor(preference,profileColor,previewColor,enabled=CUSTOM_INTERFACE_ACCENTS_ENABLED){const mode=interfaceAccentMode(preference,enabled);return mode==='custom'?preference.color:mode==='profile'?(previewColor||profileColor||null):null;}
export function unlinkInterfaceAccent(preference,profileColor){return {...preference,mode:'custom',color:preference.mode==='profile'&&validAccentColor(profileColor)?profileColor:preference.color};}
