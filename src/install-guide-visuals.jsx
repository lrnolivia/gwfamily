import React,{useState} from 'react';
import {ViewSwitcher} from './view-switcher.jsx';
import {installGuideAssets} from './install-guide-assets.js';
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
const annotation={
 'ios-safari-compact':'Compact layout: open the three-dot Page Menu, then Share.',
 'ios-safari-direct-share':'Top or Bottom layout: tap the square-and-up-arrow Share button.',
 'ipados-safari-share':'iPad: open Share, then More or View More to see the actions.',
 'ios-safari-share-sheet':'Scroll to the square-plus Add to Home Screen action.',
 'ios-safari-add-screen':'Keep the switch green, then tap Add at the top right.',
 'android-chrome-more':'More is the vertical three-dot button next to the address bar.',
 'android-chrome-install-option':'Choose Install and create shortcut, then Install. Menu layout varies by version.',
 'android-chrome-confirm':'Check the app name and website, then confirm Install.',
 'macos-safari-file-menu':'In Safari, open File and choose Add to Dock.',
 'macos-safari-add-dialog':'Review the name and website, then click Add.',
 'macos-spotlight-open':'After adding it, open GW from the Dock, Applications or Spotlight.',
 'desktop-chrome-install-menu':'Open More, then Cast, save, and share, then Install page as app. The address-bar install button is another route when shown.',
 'desktop-chrome-confirm':'Review your browser’s confirmation, then choose Install.',
 'windows-chrome-apps-open':'Use Chrome Apps if the browser did not create a Start or desktop shortcut.',
 'chromeos-launcher-open':'After installation finishes, search for GW in the Launcher.',
 'windows-edge-install-menu':'Edge alternative: Settings and more, More tools, Apps, then Install this site as an app.',
};
function NativeControlRecreation({id}){
 const [unavailable,setUnavailable]=useState(false),asset=installGuideAssets[id];
 if(!asset)return null;
 return <figure className="install-native-visual" data-recreation="true" data-asset-id={id}>
  <div className="install-native-frame">{unavailable
   ?<p className="install-visual-unavailable" role="status">The visual couldn’t load. Follow the written steps above.</p>
   :<img src={'install-guide/'+asset.file} width={asset.dimensions.width} height={asset.dimensions.height} alt={asset.alt} decoding="async" onError={()=>setUnavailable(true)}/>}</div>
  <figcaption><span className="install-recreation-label">Control recreation</span><span>{annotation[id]||asset.title}</span></figcaption>
 </figure>;
}
export function InstallGuideVisual({platform,step}){
 const [safariLayout,setSafariLayout]=useState(()=>globalThis.navigator?.platform==='MacIntel'&&globalThis.navigator?.maxTouchPoints>1?'ipad':'compact');
 const sequence=installVisualSequences[platform];
 if(!sequence)return null; // Unknown browsers get honest written help, never a fabricated OS.
 const id=platform==='apple'&&step===0?safariVisualLayouts[safariLayout]:sequence[step];
 return <div className="install-visual-group">
  {platform==='apple'&&step===0&&<div className="install-layout-choices"><ViewSwitcher label="Safari example" value={safariLayout} onChange={setSafariLayout} options={[{value:'compact',label:'iPhone: Compact',icon:'phone'},{value:'direct',label:'iPhone: Top / Bottom',icon:'phone'},{value:'ipad',label:'iPad',icon:'phone'}]}/><p className="choice-help">Choose the toolbar you see. This only changes the example.</p></div>}
  <NativeControlRecreation key={id} id={id}/>
  {platform==='windows'&&step===0&&<NativeControlRecreation id="windows-edge-install-menu"/>}
 </div>;
}
