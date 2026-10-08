import React,{useState} from 'react';
import {useApp} from './ui-core.jsx';
import {installDevice,guideAccent,guideAsset,guideDeviceForPlatform,guideDimensions} from './install-guide-selection.js';
import './install-guide-visuals.css';

// These are original, tightly cropped native-control recreations. They never
// invoke OS controls, installation, sharing, permissions or a device setting.
export const installVisualSequences={
 apple:['ios-safari-compact','ios-safari-share-sheet','ios-safari-add-screen'],
 android:['android-chrome-more','android-chrome-install-option','android-chrome-confirm'],
 mac:['macos-safari-file-menu','macos-safari-add-dialog','macos-spotlight-open'],
 windows:['desktop-chrome-install-menu','desktop-chrome-confirm','windows-chrome-apps-open'],
 chromeos:['desktop-chrome-install-menu','desktop-chrome-confirm','chromeos-launcher-open'],
};
export const safariVisualLayouts={compact:'ios-safari-compact',direct:'ios-safari-direct-share',ipad:'ipados-safari-share'};
const mobileDescriptions={
 apple:['Safari page menu with Share.','Fully expanded Safari share sheet with Add to Home Screen.','Add to Home Screen confirmation with Add.'],
 android:['Chrome toolbar with the More menu.','Chrome overflow menu with Add to Home screen.','GW Family install confirmation with Install.']
};
function ApprovedInstallRecreation({device,accent,theme,platform,step}){
 const [unavailable,setUnavailable]=useState(false),file=guideAsset(device,accent,theme,step),id=[accent,device,theme,step+1].join('-'),[width,height]=guideDimensions(device,accent);
 return <figure className="install-native-visual install-mobile-visual" data-recreation="true" data-asset-id={id}>
  <div className="install-native-frame">{unavailable?<p className="install-visual-unavailable" role="status">The visual couldn’t load. Follow the written steps above.</p>:<img src={'install-guide/'+file} width={width} height={height} alt="" decoding="async" onError={()=>setUnavailable(true)}/>}</div>
  <figcaption><span>{mobileDescriptions[platform][step]}</span></figcaption>
 </figure>;
}
export function InstallGuideVisual({platform,step}){
 const app=useApp(),native=installDevice();
 if(!native||!['apple','android'].includes(platform)||step<0||step>2)return null;
 const device=guideDeviceForPlatform(native,platform),accent=guideAccent(app?.installAccentColor),theme=app?.theme==='light'?'light':'dark',id=[device,accent,theme,step].join('-');
 return <div className="install-visual-group is-mobile-guide"><ApprovedInstallRecreation key={id} device={device} accent={accent} theme={theme} platform={platform} step={step}/></div>;
}
