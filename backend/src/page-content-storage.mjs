import {sharedPageDefaults} from '../../src/shared-content-schema.js';
// Retain a complete previous-version representation in the original columns.
// The additive column holds new presentation metadata so a source rollback can
// still render every original/custom panel and serve the unchanged media IDs.
export function pageStorageSnapshots(page,value){
 const media=files=>files.map(({id,alt=''})=>({id,alt})),hero={mode:value.hero.mode,media:media(value.hero.media)},panels=value.panelLayout.panels.filter(panel=>panel.kind!=='native').map(({elements,...panel})=>panel.kind==='content'?{...panel,media:media(panel.media)}:{...panel}),ids=new Set(panels.map(panel=>panel.id));
 const panelLayout={version:1,panels,desktopOrder:value.panelLayout.desktopOrder.filter(id=>ids.has(id)),mobileOrder:value.panelLayout.mobileOrder.filter(id=>ids.has(id))},removed=panels.some(panel=>panel.id==='hero'&&panel.removed),defaults=sharedPageDefaults(page);
 return {content:{text:Object.fromEntries(Object.entries(value.text).filter(([key,text])=>text!==defaults.text[key])),hero:removed?{mode:'default',media:[]}:hero},extension:{bodyFormats:value.bodyFormats,panelLayout,...(removed?{hero}:{})},presentation:{hero:value.hero,panelLayout:value.panelLayout,cardLayouts:value.cardLayouts||{}}};
}
export function storedPageSnapshot(content,extension,presentation){return {...JSON.parse(content),...(extension?JSON.parse(extension):{}),...(presentation?JSON.parse(presentation):{})}}
