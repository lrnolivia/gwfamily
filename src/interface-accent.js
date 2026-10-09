// Profile identity colors remain untouched; the device interface uses GW presets.
import {THEME_PRESETS} from './theme-presets.js';
export const CUSTOM_ACCENT_PICKER_ENABLED=false;
export const INTERFACE_ACCENT_KEY='gw-interface-accent:v1';
export const validAccentColor=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const channels=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
export function interfacePreset(value){
 if(!validAccentColor(value))return null;
 const color=value.toLowerCase(),exact=THEME_PRESETS.find(p=>p.color===color);if(exact)return exact;
 const rgb=channels(color),distance=p=>channels(p.color).reduce((sum,c,i)=>sum+(c-rgb[i])**2,0);
 return THEME_PRESETS.reduce((best,p)=>distance(p)<distance(best)?p:best);
}
export function readInterfaceAccent(storage){
 try{const saved=JSON.parse(storage?.getItem(INTERFACE_ACCENT_KEY)||'null');if(saved&&['family','profile','custom'].includes(saved.mode)&&validAccentColor(saved.color))return {mode:saved.mode,color:interfacePreset(saved.color).color};}catch{}
 return {mode:'family',color:'#4f996c'};
}
export function interfaceAccentColor(preference,profileColor,previewColor){
 if(preference.mode==='custom')return interfacePreset(preference.color)?.color||null;
 if(preference.mode==='profile')return interfacePreset(previewColor||profileColor)?.color||null;
 return null;
}
export function unlinkInterfaceAccent(preference,profileColor){return {...preference,mode:'custom',color:interfacePreset(preference.mode==='profile'?profileColor:preference.color)?.color||THEME_PRESETS[3].color};}
