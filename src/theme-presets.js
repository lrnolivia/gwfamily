// The eight current GW choices. Existing stored profile colors are not rewritten.
export const THEME_PRESETS=Object.freeze([
 ['red','Red','#e64f59'],['orange','Orange','#ff7a00'],['yellow','Yellow','#ec9d00'],['green','Green','#387b51'],
 ['blue','Blue','#3985e6'],['violet','Violet','#a267d5'],['coral-pink','Coral pink','#ff6685'],['stone','Stone','#8a8178']
].map(([id,label,color])=>Object.freeze({id,label,color})));
export const themePreset=value=>THEME_PRESETS.find(p=>p.id===value||p.color===String(value).toLowerCase())||null;
