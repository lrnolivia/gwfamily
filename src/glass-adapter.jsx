// A small React island for the exact liquid-glass engine. The app remains vanilla JS.
import React, {useEffect, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {LiquidGlass, LiquidGlassFilter} from '@sohumsuthar/liquid-glass';
import {useLiquidGlassEffects} from '@sohumsuthar/liquid-glass/hooks';
import {useLiquidLens} from '@sohumsuthar/liquid-glass/hooks/useLiquidLens';
import {buildDisplacementLUT,renderDisplacementMap} from '@sohumsuthar/liquid-glass/optics';

function sharedDisplacementMap() {
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=512;
  const context=canvas.getContext('2d');
  const image=context.createImageData(512,512);
  renderDisplacementMap(image.data,{width:512,height:512,radius:48,bezel:48,
    lut:buildDisplacementLUT(255).lut,channelDepth:127});
  context.putImageData(image,0,0);
  return canvas.toDataURL('image/png');
}

function Effects() {
  useLiquidGlassEffects({cursor:true,spotlight:false,reveal:false,scroll:false});
  return null;
}
function Navigation({node}) {
  const content=useRef(null);
  useEffect(()=>{if (content.current) content.current.append(node)},[node]);
  return <LiquidGlass macro variant="clear" dimmed lens
    lensOptions={{bezel:16,refraction:1.2,dispersion:5,radius:40}}
    className="gw-glass-nav" contentClassName="gw-glass-nav-content">
    <div ref={content}/>
  </LiquidGlass>;
}
function LensBridge({target, options}) {
  const ref=useRef(target);
  const lens=useLiquidLens(ref,options);
  useEffect(()=>{target.style.setProperty('--lg-refract',lens.filter||'url(#lg-refract-sm)')},[target,lens.filter]);
  return lens.svg;
}
function enableMenuGlass(panel,options) {
  if (!panel || panel.dataset.glassMounted) return;
  panel.dataset.glassMounted='true';
  panel.classList.add('liquid-glass','lg-dimmed','gw-glass-menu');
  const content=document.createElement('div');
  content.className='liquid-glass-content gw-menu-content';
  while (panel.firstChild) content.append(panel.firstChild);
  for (const name of ['effect','tint','shine']) {
    const layer=document.createElement('div');
    layer.className='liquid-glass-'+name;
    panel.append(layer);
  }
  panel.append(content);
  const island=document.createElement('span');
  island.className='gw-lens-island';
  panel.append(island);
  createRoot(island).render(<LensBridge target={panel} options={options}/>);
}
function boot() {
  const nav=document.querySelector('.bottom');
  const mount=document.createElement('div');
  mount.id='gw-glass-root';
  document.body.append(mount);
  // Shared filter is the documented fallback while a per-element lens initializes.
  createRoot(mount).render(<><Effects/><LiquidGlassFilter displacementMap={sharedDisplacementMap()}/>
    <Navigation node={nav}/></>);
  document.addEventListener('toggle',e=>{
    if (!e.target.matches?.(':popover-open')) return;
    if (e.target.matches('#profile-popout,#notifications-popout')) {
      enableMenuGlass(e.target,{bezel:9,refraction:.9,dispersion:3,radius:40});
    }
  },true);
}
boot();
