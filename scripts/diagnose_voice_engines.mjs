// Credentials arrive only on stdin and remain in this diagnostic process.
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {authFixture} from '../test/auth-fixture.mjs';
import {speechSegments} from '../public/speech-text.js';
const exec=promisify(execFile);let input='';for await(const chunk of process.stdin)input+=chunk;
const {fishKey}=JSON.parse(input);input='';
const fixture=await authFixture(),dir=await mkdtemp(join(tmpdir(),'streamvoice-engine-audit-'));
const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14329',AUTH_ACCOUNTS_FILE:fixture.path,FISH_API_KEY:fishKey,FISH_MODEL:'s2.1-pro-free',EDGE_TTS_PYTHON:resolve('dist/entregas-1.4.0/StreamVoice-APP-macos-arm64-admin-v1.4.0/runtime/python/bin/python3')},stdio:['ignore','pipe','pipe']});
child.stderr.resume();const results=[];
try {
 await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Diagnostic server did not start')),5000).unref())]);
 const base='http://127.0.0.1:14329';const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'test-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const texts=['Hola como estás {20} ','¿Cómo estás? Sí, él tomó café y pidió más azúcar.','Mañana iré a Valparaíso. Tú también vendrás.'];
 for(const provider of ['edge','fish'])for(let i=0;i<texts.length;i++) {
  const text=speechSegments(texts[i].normalize('NFD')).filter(s=>s.type==='speech').map(s=>s.text).join(' '),start=Date.now();
  const response=await fetch(base+'/api/speech',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({provider,voiceId:provider==='fish'?'dfcda842af714d7ab87960f87a2b8deb':'es-CL-CatalinaNeural',text,speed:1}),signal:AbortSignal.timeout(60000)});
  const row={provider,case:i+1,text,status:response.status,elapsedMs:Date.now()-start};
  if(response.ok){const bytes=Buffer.from(await response.arrayBuffer()),path=join(dir,provider+i+'.mp3');await writeFile(path,bytes);row.bytes=bytes.length;try{row.duration=JSON.parse((await exec('/opt/homebrew/bin/ffprobe',['-v','error','-show_entries','format=duration','-of','json',path])).stdout).format.duration;}catch{row.invalidAudio=true;}}
  else {const data=await response.json();row.error=String(data.error||'Request failed').replace(/sk-fish-[\w-]+/g,'[REDACTED]');}
  results.push(row);console.log(JSON.stringify(row));
 }
 await writeFile(process.argv[2] || 'docs/voice-engine-audit-1.4.1.json',JSON.stringify({date:new Date().toISOString(),platform:process.platform,arch:process.arch,paidFallback:false,results},null,2)+'\n');
}finally{child.kill('SIGTERM');await fixture.cleanup();await rm(dir,{recursive:true,force:true});}
