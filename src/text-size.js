export const textSizes=[.9,1,1.1,1.2,1.3];
export const validTextStep=value=>Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<textSizes.length?Number(value):1;
export function applyTextSize(step){const root=document.documentElement;root.style.removeProperty('font-size');const base=parseFloat(getComputedStyle(root).fontSize)||16;root.style.setProperty('--text-scale',String(textSizes[step]));if(step!==1)root.style.fontSize=base*textSizes[step]+'px';}
