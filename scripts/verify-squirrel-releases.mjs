// Verify the published index against local package bytes before any publication.
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createReadStream } from 'node:fs';
const file=process.argv[2];
if (!file) { console.error('Uso: node scripts/verify-squirrel-releases.mjs RUTA/RELEASES'); process.exit(2); }
const releasePath=resolve(file), content=await readFile(releasePath,'utf8');
const lines=content.split(/\r?\n/).filter(line=>line.trim());
if (!lines.length) throw Error('RELEASES está vacío.');
const names=new Set();
for(const line of lines){
 const match=/^([0-9a-fA-F]{40})\s+([^\s]+)\s+(\d+)$/.exec(line.trim());
 if(!match) throw Error('Línea inválida en RELEASES.');
 const [,expected,name,size]=match;
 if(name!==basename(name) || !/^[A-Za-z0-9_.-]+\.nupkg$/.test(name) || names.has(name)) throw Error('Nombre de paquete inválido o duplicado.');
 names.add(name);
 const path=join(dirname(releasePath),name), st=await stat(path);
 if(st.size!==Number(size)) throw Error(`Tamaño incorrecto: ${name}`);
 const sha1=createHash('sha1'),sha256=createHash('sha256');
 for await (const chunk of createReadStream(path)){sha1.update(chunk);sha256.update(chunk);}
 if(sha1.digest('hex')!==expected.toLowerCase()) throw Error(`SHA-1 incorrecto: ${name}`);
 console.log(`${name}  ${st.size} bytes  SHA-256 ${sha256.digest('hex')}`);
}
console.log('RELEASES coincide con los archivos locales; esto no audita secretos ni firma.');
