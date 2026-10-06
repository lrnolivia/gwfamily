import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// Transitional recovery of immutable approved artwork. Existing bytes are preferred.
const assets=JSON.parse(await readFile(new URL('./asset-manifest.json',import.meta.url),'utf8'));
for(const asset of assets){
 const target=new URL('../dist/'+asset.path,import.meta.url);
 let bytes;try{bytes=await readFile(target)}catch{}
 const hash=b=>createHash('sha256').update(b).digest('hex');
 if(bytes&&hash(bytes)===asset.sha256)continue;
 const response=await fetch(asset.url,{redirect:'error'});if(!response.ok)throw new Error('Missing approved asset '+asset.path);
 bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!==asset.sha256)throw new Error('Approved asset identity changed: '+asset.path);
 await mkdir(new URL('.',target),{recursive:true});await writeFile(target,bytes);
}

const installIcons=JSON.parse(await readFile(new URL('./install-icons.json',import.meta.url),'utf8'));for(const [name,data] of Object.entries(installIcons))await writeFile(new URL('../dist/'+name,import.meta.url),Buffer.from(data,'base64'));
