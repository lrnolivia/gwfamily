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
 apple:[{title:'Open the Share menu',text:'In Safari, tap Share. If you see a Page Menu first, open it, then choose Share.',art:'share'},{title:'Add to Home Screen',text:'Scroll through the actions and choose Add to Home Screen. If it is missing, check Edit Actions.',art:'add'},{title:'Keep it as an app',text:'Turn on Open as Web App if that switch appears, then tap Add. Open the new icon from your Home Screen.',art:'icon'}],
 android:[{title:'Open the browser menu',text:'In Chrome, tap the three-dot menu near the address bar.',art:'menu'},{title:'Choose the install option',text:'Tap Install and create shortcut, then Install. Your menu may instead say Add to home screen or Install app.',art:'add'},{title:'Open your family app',text:'Find Green & White on your Home Screen or in your app drawer and open it.',art:'icon'}],
 mac:[{title:'Choose the app option in your browser',text:'In Safari on macOS Sonoma or later, choose File or Share, then Add to Dock. In Chrome or Edge, look for the install option in the address bar or browser menu.',art:'menu'},{title:'Open from your Dock or applications',text:'Installation is optional for supported Mac push notifications. Safari Web Push needs macOS Ventura or later. Firefox can use the website even if no install option is shown.',art:'icon'}],
 windows:[{title:'Use Chrome or Edge’s install option',text:'Look for the install icon in the address bar. In Edge, you can also use Settings and more, More tools, Apps, then Install this site as an app.',art:'menu'},{title:'Open from your Start menu',text:'Installation is optional for supported desktop push notifications. You can also keep using GW in Chrome, Edge or Firefox.',art:'icon'}],
 chromeos:[{title:'Install from Chrome',text:'Look for Install in Chrome’s address bar or browser menu, then confirm if you want an app shortcut.',art:'menu'},{title:'Open from your Launcher',text:'Installation is optional for supported Chrome push notifications. Your school or work administrator may control notifications or app installation.',art:'icon'}],
 other:[{title:'Look for your browser’s install option',text:'Check the address bar or browser menu for Install app or Add to Home Screen.',art:'menu'},{title:'Confirm, then open the new icon',text:'If your browser does not offer installation, you can keep using this website or save a bookmark.',art:'icon'}]
};
