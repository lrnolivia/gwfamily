// Platform hints choose instructions only. Browser capability decides whether
// an install prompt exists; a prompt acceptance is not proof of installation.
export function installPlatform({userAgent='',platform='',maxTouchPoints=0}={}){
 if(/iPad|iPhone|iPod/.test(userAgent)||(platform==='MacIntel'&&maxTouchPoints>1))return 'apple';
 if(/Android/i.test(userAgent))return 'android';
 if(/CrOS/i.test(userAgent))return 'chromeos';
 if(/Windows/i.test(userAgent)||/^Win/.test(platform))return 'windows';
 if(/Macintosh|Mac OS X/i.test(userAgent)||/^Mac/.test(platform))return 'mac';
 return 'other';
}
export function embeddedBrowser(userAgent=''){return /FBAN|FBAV|Instagram|\bwv\b|Line\//i.test(userAgent)}
export function installedDisplay(win=globalThis.window,nav=globalThis.navigator){return !!(win?.matchMedia?.('(display-mode: standalone)').matches||nav?.standalone===true)}
export const installSteps={
 apple:[{title:'Open the Share menu',text:'In Safari’s Compact layout, tap Page Menu or More, then Share. Top and Bottom layouts have a direct Share button. On iPad, tap Share, then More or View More.',art:'share'},{title:'Add to Home Screen',text:'Scroll through the actions and choose Add to Home Screen. If it is missing on iPhone, scroll to Edit Actions and add it there.',art:'add'},{title:'Keep it as an app',text:'Turn on Open as Web App if that switch appears, then tap Add. Open the new icon from your Home Screen.',art:'confirm'}],
 android:[{title:'Open the browser menu',text:'In Chrome, tap More: the vertical three-dot button on the right of the address bar.',art:'menu'},{title:'Choose the install option',text:'Tap Install and create shortcut, then Install. Older versions or other browsers may instead say Add to home screen or Install app.',art:'add'},{title:'Confirm, then open GW',text:'Review the app name and website, then confirm Install. Once installation finishes, open Green & White Family from your Home Screen or app drawer.',art:'confirm'}],
 mac:[{title:'Add to Dock in Safari',text:'In Safari on macOS Sonoma 14 or later, choose File, then Add to Dock. You can also open Share and choose Add to Dock. The examples below show Safari.',art:'menu'},{title:'Review the name and add it',text:'Check the website and app name, then click Add. Installation is optional for supported Mac push notifications. Safari Web Push needs macOS Ventura or later.',art:'confirm'},{title:'Open your family app',text:'Open GW from the Dock, Applications or Spotlight. In Chrome, use More, Cast, save, and share, then Install page as app. Edge also offers app installation. Firefox can keep using the website.',art:'launch'}],
 windows:[{title:'Choose your browser’s install option',text:'In Chrome, use More, Cast, save, and share, then Install page as app. The address-bar Install icon is another route when shown. In Edge, use Settings and more, More tools, Apps, then Install this site as an app.',art:'menu'},{title:'Review and confirm',text:'Check the name and website in your browser’s confirmation. Choose Install only when you want to add GW. The confirmation example shows Chrome; Edge’s dialog can look different.',art:'confirm'},{title:'Open GW again',text:'Use the Start or desktop shortcut if your browser created one. Otherwise, open Chrome Apps or Edge Apps. Installation is optional for supported desktop push notifications. You can also keep using GW in Chrome, Edge or Firefox.',art:'launch'}],
 chromeos:[{title:'Choose Chrome’s install option',text:'Open More, then Cast, save, and share, then Install page as app. Some websites also show an Install icon in the address bar.',art:'menu'},{title:'Review and confirm',text:'Check the GW app name and website, then choose Install. Follow the browser’s remaining instructions.',art:'confirm'},{title:'Open from your Launcher',text:'Find Green & White Family in the Launcher. Installation is optional for supported Chrome push notifications. Your school or work administrator may control notifications or app installation.',art:'launch'}],
 other:[{title:'Look for your browser’s install option',text:'Check the address bar or browser menu for Install app or Add to Home Screen.',art:'menu'},{title:'Confirm, then open the new icon',text:'If your browser does not offer installation, you can keep using this website or save a bookmark.',art:'icon'}]
};
// Links back up control semantics; the guide assets do not claim exact native
// screenshot pixels or a build we could not observe. Versioned Apple guides
// prevent the documented iOS 26 layout from silently becoming a newer example.
export const installGuideSources={
 apple:[{label:'Apple: iPhone steps',url:'https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/26/ios/26'},{label:'Apple: iPad steps',url:'https://support.apple.com/guide/ipad/open-as-web-app-ipad8f1f7a29/26/ipados/26'}],
 android:[{label:'Google: Android steps',url:'https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DAndroid'}],
 mac:[{label:'Apple: Safari on Mac',url:'https://support.apple.com/en-us/104996'},{label:'Google: Chrome steps',url:'https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DDesktop'}],
 windows:[{label:'Google: Chrome steps',url:'https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DDesktop'},{label:'Microsoft: Edge steps',url:'https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge'}],
 chromeos:[{label:'Google: Chrome steps',url:'https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DDesktop'}],
 other:[]
};
