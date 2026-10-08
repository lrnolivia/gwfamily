import {installPlatform} from './install-capabilities.js';
const accents={'#e64f59':'red','#ff7a00':'orange','#ec9d00':'yellow','#387b51':'green','#3985e6':'blue','#a267d5':'violet','#ff6685':'coral-pink','#8a8178':'stone'};
// Native identity selects artwork independently of the chosen Glass/Flat material.
// iPadOS can advertise a desktop Mac identity. Width alone does not identify it.
export function installDevice(nav=globalThis.navigator){
 if(!nav)return null;
 const {userAgent='',platform='',maxTouchPoints=0}=nav,os=installPlatform(nav);
 if(os==='apple')return /iPad/.test(userAgent)||(platform==='MacIntel'&&maxTouchPoints>1)?'ipad':'ios';
 if(os==='android')return nav.userAgentData?.mobile===false||! /Mobile/i.test(userAgent)?'androidTablet':'android';
 return null;
}
export const guideAccent=color=>accents[String(color||'').toLowerCase()]||'default';
export const guideAsset=(device,accent,theme,step)=>`approved-v2/screens/${accent}-${device}-${theme}-${step+1}.png`;
export function guideDeviceForPlatform(device,platform){return platform==='apple'?(device==='ipad'||device==='androidTablet'?'ipad':'ios'):(device==='ipad'||device==='androidTablet'?'androidTablet':'android');}

const dimensions={"default-ios":[482,985],"default-ipad":[940,1300],"default-android":[522,1008],"default-androidTablet":[992,1463],"green-ios":[482,985],"green-ipad":[940,1300],"green-android":[522,1008],"green-androidTablet":[992,1463],"orange-ios":[482,985],"orange-ipad":[940,1300],"orange-android":[522,1008],"orange-androidTablet":[992,1463],"yellow-ios":[472,983],"yellow-ipad":[940,1300],"yellow-android":[522,1008],"yellow-androidTablet":[992,1463],"red-ios":[482,985],"red-ipad":[940,1300],"red-android":[522,1008],"red-androidTablet":[992,1463],"blue-ios":[482,985],"blue-ipad":[940,1300],"blue-android":[522,1008],"blue-androidTablet":[992,1463],"violet-ios":[482,985],"violet-ipad":[940,1300],"violet-android":[522,1008],"violet-androidTablet":[992,1463],"stone-ios":[482,985],"stone-ipad":[940,1300],"stone-android":[522,1008],"stone-androidTablet":[992,1463],"coral-pink-ios":[482,985],"coral-pink-ipad":[940,1300],"coral-pink-android":[522,1008],"coral-pink-androidTablet":[992,1463]};
export const guideDimensions=(device,accent)=>dimensions[accent+'-'+device];
