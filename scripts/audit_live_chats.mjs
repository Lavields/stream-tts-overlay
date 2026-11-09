// Authorized read-only live audit. Uses an isolated server: no TTS or chat posting.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
const port=14318,base=`http://127.0.0.1:${port}`;
let targets=[{platform:'twitch',channel:process.env.AUDIT_TWITCH || 'xqc'},
  {platform:'starvios',channel:process.env.AUDIT_STARVIOS || 'tortugod'}];
if(process.env.AUDIT_TIKTOK) targets.push({platform:'tiktok',channel:process.env.AUDIT_TIKTOK});
if(process.env.AUDIT_ONLY) targets=targets.filter(t=>t.platform===process.env.AUDIT_ONLY);
if(!process.env.AUDIT_PASSWORD)throw Error('Configura AUDIT_PASSWORD localmente para autenticar la auditoría.');
const env={...process.env,PORT:String(port)};
delete env.AUDIT_PASSWORD;
for(const key of ['FISH_API_KEY','ELEVENLABS_API_KEY','YOUTUBE_API_KEY','KICK_ACCESS_TOKEN','EULER_API_KEY','TWITCH_USERNAME','TWITCH_OAUTH_TOKEN'])env[key]='';
const child=spawn(process.execPath,['server.mjs'],{env,stdio:['ignore','pipe','pipe']});
const records=new Map(targets.map(t=>[t.platform+':'+t.channel,{...t,states:[],messages:0}]));
const abort=new AbortController();let reading,cookie;
const post=async(path,data)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};
try {
  await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('El servidor de auditoría no inició.')),5000).unref())]);
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:process.env.AUDIT_USER||'admin',password:process.env.AUDIT_PASSWORD})});
  if(!login.ok)throw Error('No se pudo autenticar la auditoría.');
  cookie=login.headers.get('set-cookie').split(';')[0];
  const stream=await fetch(base+'/api/events',{headers:{Cookie:cookie},signal:abort.signal});
  reading=(async()=>{
    let buffer='';const decoder=new TextDecoder();
    for await(const chunk of stream.body){
      buffer+=decoder.decode(chunk,{stream:true});let at;
      while((at=buffer.indexOf('\n\n'))>=0){
        const event=buffer.slice(0,at);buffer=buffer.slice(at+2);
        const type=event.match(/^event: (.+)$/m)?.[1],raw=event.match(/^data: (.+)$/m)?.[1];if(!raw)continue;
        const data=JSON.parse(raw);
        if(type==='connections')for(const connection of data){const record=records.get(connection.platform+':'+connection.channel);if(record){record.id=connection.id;const last=record.states.at(-1);if(last?.state!==connection.state || last?.detail!==connection.detail)record.states.push({state:connection.state,detail:connection.detail});}}
        if(type==='chat'){const record=records.get(data.platform+':'+data.channel);if(record){record.messages++;record.messageShapeValid=Boolean(data.id&&data.user&&data.displayName&&typeof data.text==='string');}}
      }
    }
  })().catch(error=>{if(!abort.signal.aborted)throw error;});
  for(const target of targets)await post('/api/connect',target);
  await new Promise(resolve=>setTimeout(resolve,35000));
  const result={localDate:'2026-10-15',mode:'Solo lectura; sin síntesis ni envío de mensajes',results:[...records.values()]};
  if(process.env.AUDIT_ONLY){try{const previous=JSON.parse(await readFile('docs/live-chat-audit.json','utf8'));result.results=[...previous.results.filter(r=>!targets.some(t=>t.platform===r.platform)),...result.results];}catch{}}
  await writeFile('docs/live-chat-audit.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {
  for(const record of records.values())if(record.id)try{await post('/api/disconnect',{id:record.id});}catch{}
  abort.abort();await reading?.catch(()=>{});child.kill('SIGTERM');
}
