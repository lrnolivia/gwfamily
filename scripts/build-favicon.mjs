import {readFile, writeFile} from 'node:fs/promises';

// Browser-tab artwork has a transparent canvas. Installed-app and maskable
// icons keep their existing solid backgrounds and are not changed here.
// Use the approved artwork bytes directly, preserving the existing mark and
// its app-icon.svg geometry without introducing a second raster asset.
const artwork = await readFile(new URL('../dist/tree-artwork.png', import.meta.url));
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image x="70" y="134" width="372" height="244" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${artwork.toString('base64')}"/></svg>\n`;
await writeFile(new URL('../dist/favicon.svg', import.meta.url), favicon);
