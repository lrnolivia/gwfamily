import React,{useEffect,useState} from 'react';
import {Button,Control,Glyph,useApp} from './ui-core.jsx';
let availablePrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();availablePrompt=event;window.dispatchEvent(new Event('gw-install-ready'));});
export const isInstalled=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
export function InstallGuide(){
 const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);const {openSheet}=useApp();const [ready,setReady]=useState(!!availablePrompt),[installed,setInstalled]=useState(isInstalled());
 useEffect(()=>{const ready=()=>setReady(!!availablePrompt),done=()=>setInstalled(true);window.addEventListener('gw-install-ready',ready);window.addEventListener('appinstalled',done);return()=>{window.removeEventListener('gw-install-ready',ready);window.removeEventListener('appinstalled',done)}},[]);
 const dismiss=()=>{localStorage.setItem('gw-install-dismissed','yes');openSheet(null)};
 const install=async()=>{const prompt=availablePrompt;if(!prompt)return;availablePrompt=null;setReady(false);await prompt.prompt();await prompt.userChoice;setInstalled(isInstalled())};
 return <div className="stack install-guide"><img src="tree-artwork.png" alt=""/><h3>{installed?'Already on your Homescreen':'Keep family close.'}</h3>{installed?<p>Open Green &amp; White from your app icon.</p>:<><p>Add Green &amp; White to your Homescreen for a full-screen view.</p>{ready?<Button onClick={install}><Glyph name="plus"/>Add to Homescreen</Button>:<>{apple?<><h4>On iPhone or iPad</h4><ol><li>Open this page in Safari.</li><li>Tap Share, then Add to Home Screen.</li><li>Turn on Open as Web App, then tap Add.</li></ol></>:<><h4>Install from your browser</h4><p>Open the browser menu and choose Install app or Add to Home screen, then confirm. An install button appears here when your browser makes it available.</p></>}</>}</>}<Control className="text-button" onClick={dismiss}>{installed?'Done':'Not now'}</Control></div>
}

if('serviceWorker' in navigator&&location.protocol==='https:'&&!location.pathname.startsWith('/__review/')){const register=()=>navigator.serviceWorker.register('/sw.js').catch(()=>{});if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});}
