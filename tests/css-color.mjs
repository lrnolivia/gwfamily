// Computed styles may serialize modern colors as color(srgb ... / alpha),
// rather than legacy rgb()/rgba(). Unknown input must fail, never imply opaque.
export function cssColorAlpha(value){
 const text=String(value||'').trim().toLowerCase();
 if(text==='transparent')return 0;
 if(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/.test(text))return 1;
 if(/^#[0-9a-f]{4}$/.test(text))return parseInt(text[4]+text[4],16)/255;
 if(/^#[0-9a-f]{8}$/.test(text))return parseInt(text.slice(7),16)/255;
 const fn=/^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((.*)\)$/.exec(text);if(!fn)return NaN;
 const body=fn[2],slash=body.split('/');let alpha;
 if(slash.length===2)alpha=slash[1].trim();else if(slash.length>2)return NaN;
 else if(body.includes(',')){const parts=body.split(',');if(parts.length===4)alpha=parts[3].trim();else if(parts.length!==3)return NaN;}
 if(alpha===undefined)return 1;
 if(!/^(?:\d*\.)?\d+%?$/.test(alpha))return NaN;
 const result=parseFloat(alpha)/(alpha.endsWith('%')?100:1);
 return result>=0&&result<=1?result:NaN;
}
