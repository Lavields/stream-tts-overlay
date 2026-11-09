import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const executable=join(root,'dist/escritorio-1.6.0/StreamVoice Administrador-darwin-arm64/StreamVoice Administrador.app/Contents/MacOS/StreamVoice Administrador');
const data=await mkdtemp(join(tmpdir(),'streamvoice-desktop-release-'));
const child=spawn(executable,[],{env:{...process.env,STREAMVOICE_USER_DATA_DIR:data},stdio:'ignore',detached:true});
const post=(url,body,cookie)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
try{
 let base;
 for(let n=0;n<150;n++){
  if(child.exitCode!==null)throw Error('La aplicación se cerró al iniciar.');
  try{const p=JSON.parse(await readFile(join(data,'studio-port.json'),'utf8')).port;base=`http://127.0.0.1:${p}`;const status=await fetch(base+'/api/auth/status');if(status.ok)break;}catch{}
  await delay(100);
 }
 assert.ok(base,'La aplicación no abrió el servidor local.');
 const status=await (await fetch(base+'/api/auth/status')).json();assert.equal(status.needsSetup,true);
 assert.equal((await post(base+'/api/auth/setup',{password:'release-test-password'})).status,200);
 const login=await post(base+'/api/auth/login',{username:'admin',password:'release-test-password'});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const network=await (await fetch(base+'/api/admin/network',{headers:{Cookie:cookie}})).json();assert.equal(network.available,true);assert.equal(network.enabled,false);
 console.log('La app Mac empaquetada inició, creó la cuenta temporal y mostró el control remoto desactivado.');
} finally {try{process.kill(-child.pid,'SIGTERM');}catch{} await delay(500);try{process.kill(-child.pid,'SIGKILL');}catch{} await rm(data,{recursive:true,force:true});}
