import {themePreset} from './theme-presets.js';
export function emailAppearance(value={}){
 if(!['light','dark'].includes(value.theme)||!['sans','serif'].includes(value.headingFont)||!themePreset(value.preset)||themePreset(value.preset).id!==value.preset)throw new TypeError('Choose a GW email color, heading font and appearance.');
 return {preset:value.preset,theme:value.theme,headingFont:value.headingFont};
}
export function initialEmailAppearance({theme,headingFont,interfaceAccent,profileColor}={}){
 const color=interfaceAccent?.mode==='custom'?interfaceAccent.color:interfaceAccent?.mode==='profile'?profileColor:null;
 return {preset:(themePreset(color)||themePreset('green')).id,theme:theme==='dark'?'dark':'light',headingFont:headingFont==='serif'?'serif':'sans'};
}
