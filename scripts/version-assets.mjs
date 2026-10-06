import {readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';
const js=await readFile('dist/react-app.js'),css=await readFile('dist/react-app.css'),version=createHash('sha256').update(js).update(css).digest('hex').slice(0,20);
let html=await readFile('dist/index.html','utf8');html=html.replace(/(react-app\.(?:js|css))(?:\?[^"']*)?/g,'$1?v='+version).replace(/<meta name="gw-build"[^>]*>/g,'');html=html.replace('</head>',`<meta name="gw-build" content="${version}"></head>`);await writeFile('dist/index.html',html);await writeFile('dist/build.json',JSON.stringify({version})+'\n');
console.log('GW asset version',version);
