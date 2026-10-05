import React,{useEffect,useState} from 'react';
import {Button,Control,Glyph,useApp} from './ui-core.jsx';
let availablePrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();availablePrompt=event;window.dispatchEvent(new Event('gw-install-ready'));});
export const isInstalled=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
export function InstallGuide(){
 const {openSheet}=useApp();const [ready,setReady]=useState(!!availablePrompt),[installed,setInstalled]=useState(isInstalled());
 useEffect(()=>{const ready=()=>setReady(!!availablePrompt),done=()=>setInstalled(true);window.addEventListener('gw-install-ready',ready);window.addEventListener('appinstalled',done);return()=>{window.removeEventListener('gw-install-ready',ready);window.removeEventListener('appinstalled',done)}},[]);
 const dismiss=()=>{localStorage.setItem('gw-install-dismissed','yes');openSheet(null)};
 const install=async()=>{const prompt=availablePrompt;if(!prompt)return;availablePrompt=null;setReady(false);await prompt.prompt();await prompt.userChoice;setInstalled(isInstalled())};
 return <div className="stack install-guide"><img src="tree-artwork.png" alt=""/><h3>{installed?'Already on your Homescreen':'Keep family close.'}</h3>{installed?<p>Open Green &amp; White from your app icon.</p>:<><p>Add Green &amp; White to your Homescreen for a full-screen view.</p>{ready?<Button onClick={install}><Glyph name="plus"/>Add to Homescreen</Button>:<><h4>On iPhone or iPad</h4><ol><li>Open this page in Safari.</li><li>Tap Share, then Add to Home Screen.</li><li>Turn on Open as Web App, then tap Add.</li></ol><p className="small muted">On Android or desktop, use your browser menu’s Install app or Add to Home screen option.</p></>}</>}<Control className="text-button" onClick={dismiss}>{installed?'Done':'Not now'}</Control></div>
}

if('serviceWorker' in navigator&&location.protocol==='https:'&&!location.pathname.startsWith('/__review/')){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}),{once:true});}
