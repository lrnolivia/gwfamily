import manifest from './install-guide-flow.json' with {type:'json'};
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
export const guideAsset=(device,accent,theme,step)=>`approved-v4/screens/${accent}-${device}-${theme}-${step+1}.png`;
export function guideDeviceForPlatform(device,platform){return platform==='apple'?(device==='ipad'||device==='androidTablet'?'ipad':'ios'):(device==='ipad'||device==='androidTablet'?'androidTablet':'android');}

const dimensions={ios:[482,360],ipad:[940,440],android:[521,360],androidTablet:[991,440]};
export const guideDimensions=(device,accent)=>dimensions[device];

const guideCopy={
 'open-page-menu':'In Safari’s Compact layout, tap Page Menu beside the address bar. If your layout has a direct Share button, continue to Share.',
 'share':'Tap Share. On iPad, use the Share button in the Safari toolbar. Expand the share sheet if needed.',
 'add-to-home-screen':'Scroll through the actions and choose Add to Home Screen. If it is missing on iPhone, scroll to Edit Actions and add it there.',
 'add':'Turn on Open as Web App if that switch appears, then tap Add. Open the new icon from your Home Screen.',
 'open-chrome-menu':'In Chrome, tap More: the vertical three-dot button on the right of the address bar.',
 'install':'Review the app name and website, then confirm Install. Open Green & White Family from your Home Screen or app drawer.'
};
export const guideStepCount=device=>manifest.deviceStepCounts[device]||0;
export const guideSteps=device=>(manifest.flows[device]||[]).map(step=>({...step,title:step.instruction,text:device.startsWith('android')&&step.action==='add-to-home-screen'?'Tap Add to home screen. Older versions may instead say Install app or Install and create shortcut.':guideCopy[step.action]}));
