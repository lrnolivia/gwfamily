import React from 'react';
import {useApp} from './ui-core.jsx';
import {guideAccent} from './install-guide-selection.js';
// Approved native paths exported from Figma; decorative beside readable actions.
export function InstallStepText({platform,step,text}){
 const app=useApp(),theme=app?.theme==='light'?'light':'dark',accent=guideAccent(app?.installAccentColor);
 if(!['apple','android'].includes(platform))return text;
 const apple=platform==='apple',names=apple?(step===0?['Page Menu','Share']:step===1?['Add to Home Screen']:['Add']):(step===0?['More']:step===1?['Add to home screen']:['Install']);
 const expression=new RegExp('('+names.join('|')+')','g');
 return text.split(expression).map((part,index)=>{
  if(!names.includes(part))return part;
  const symbol=part==='Page Menu'?'ios-page-menu':part==='Share'?'ios-share':part==='More'?'android-more':/home screen/i.test(part)?(apple?'ios':'android')+'-add-to-home-screen':null;
  return <React.Fragment key={index}>{part}<span className="install-inline-control" aria-hidden="true">{symbol?<span className="install-inline-symbol" style={{maskImage:`url(install-guide/approved-v2/inline-controls/${symbol}.svg)`,WebkitMaskImage:`url(install-guide/approved-v2/inline-controls/${symbol}.svg)`}}/>:<img src={'install-guide/'+'approved-v2/inline-controls/'+(apple?'ios-add':'android-install-'+accent)+'-'+theme+'.svg'} width={apple?64:82} height={apple?44:48} alt=""/>}</span></React.Fragment>;
 });
}
