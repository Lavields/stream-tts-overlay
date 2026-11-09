import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { avatars } from '../public/avatars.js';
import { freeVoices } from '../public/free-voices.js';
const source=await readFile(new URL('../control/cloud/worker.mjs',import.meta.url),'utf8');
const bundle=source
  .replace("import { avatars } from '../../public/avatars.js';",`const avatars = ${JSON.stringify(avatars.map(({id})=>({id})))};`)
  .replace("import { freeVoices } from '../../public/free-voices.js';",`const freeVoices = ${JSON.stringify(freeVoices.map(({id})=>({id})))};`);
if(bundle===source || bundle.includes("from '../../public/"))throw Error('No se pudieron incluir los catálogos.');
await mkdir(new URL('../.build-cache/',import.meta.url),{recursive:true});
await writeFile(new URL('../.build-cache/cloud-worker.mjs',import.meta.url),bundle);
console.log('Worker preparado en .build-cache/cloud-worker.mjs');
