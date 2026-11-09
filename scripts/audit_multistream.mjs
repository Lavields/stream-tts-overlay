// Read-only live observation. No messages are posted and no credentials are saved.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import {authFixture} from '../test/auth-fixture.mjs';
import {speechSegments} from '../public/speech-text.js';
import {expressionSpeech} from '../public/chat-reactions.js';
const input = process.stdin.isTTY ? {} : JSON.parse(await Array.fromAsync(process.stdin).then(parts=>parts.join('')) || '{}');
const fixture=await authFixture(),port=Number(process.env.AUDIT_PORT||15341),base=`http://127.0.0.1:${port}`;
const targets=[['twitch','streamer1'],['tiktok','streamer1'],['kick','streamer1'],['starvios','streamer1']].map(([platform,channel])=>({platform,channel}));
let finishObservation;const allReceived=new Promise(resolve=>{finishObservation=resolve;});
const records=new Map(targets.map(target=>[target.platform,{...target,states:[],messages:0}]));
const report={startedAt:new Date().toISOString(),mode:'read-only; isolated accounts; no chat posting; message contents not retained',durationSeconds:Number(process.env.AUDIT_SECONDS||120),results:[...records.values()],speech:[]};
const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),AUTH_ACCOUNTS_FILE:fixture.path,FISH_API_KEY:input.fishKey||'',FISH_MODEL:'s2.1-pro-free',KICK_ACCESS_TOKEN:'',KICK_WEBHOOK_READY:'false',TWITCH_USERNAME:'',TWITCH_OAUTH_TOKEN:'',EULER_API_KEY:''},stdio:['ignore','pipe','pipe']});
child.stderr.resume();
let cookie,reading;const abort=new AbortController(),pendingSpeech=[];
const post=async(path,data)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(65000)});if(!r.ok)throw Error((await r.json()).error);return r;};
async function synthesize(platform,text,kind){
 const start=Date.now();
 try{let bytes=0,segments=0;for(const segment of speechSegments(text)){if(segment.type!=='speech')continue;const response=await post('/api/speech',{provider:'fish',voiceId:'dfcda842af714d7ab87960f87a2b8deb',text:expressionSpeech(segment,'fish'),speed:1});bytes+=(await response.arrayBuffer()).byteLength;segments++;}report.speech.push({platform,kind,ok:true,bytes,segments,elapsedMs:Date.now()-start});}
 catch(error){report.speech.push({platform,kind,ok:false,error:error.message,elapsedMs:Date.now()-start});}
}
try{
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Audit server exited before startup');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Audit startup timeout')),5000))]);
 cookie=(await post('/api/auth/login',{username:'streamer1',password:'test-password'})).headers.get('set-cookie').split(';')[0];
 if(input.fishKey)await post('/api/settings',{FISH_API_KEY:input.fishKey});
 delete input.fishKey;
 const config=await (await fetch(base+'/api/config',{headers:{Cookie:cookie}})).json();report.fishConfigured=config.configured.FISH_API_KEY;
 report.account='streamer1';
 const stream=await fetch(base+'/api/events',{headers:{Cookie:cookie},signal:abort.signal});
 reading=(async()=>{let buffer='';const decoder=new TextDecoder();for await(const chunk of stream.body){buffer+=decoder.decode(chunk,{stream:true});let at;while((at=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,at);buffer=buffer.slice(at+2);const type=block.match(/^event: (.+)$/m)?.[1],raw=block.match(/^data: (.+)$/m)?.[1];if(!raw)continue;const data=JSON.parse(raw);if(type==='connections')for(const c of data){const row=records.get(c.platform);if(!row)continue;row.id=c.id;if(row.states.at(-1)?.state!==c.state||row.states.at(-1)?.detail!==c.detail){row.states.push({atMs:Date.now()-began,state:c.state,detail:c.detail});console.log(c.platform,c.state,c.detail);}}if(type==='chat'){const row=records.get(data.platform);if(!row)continue;row.messages++;if([...records.values()].every(record=>record.messages>0))finishObservation();if(row.messages===1)console.log(data.platform,'received first live message');row.shapeValid=Boolean(data.id&&data.user&&data.displayName&&typeof data.text==='string');row.firstMessageAfterMs??=Date.now()-began;if(row.messages===1&&report.fishConfigured)pendingSpeech.push(synthesize(data.platform,data.text,'first-live-message'));}}}})().catch(error=>{if(!abort.signal.aborted)report.eventError=error.message;});
 const began=Date.now();
 await Promise.all(targets.map(target=>post('/api/connect',target)));
 console.log('Four connection requests submitted concurrently.');
 if(report.fishConfigured)for(const target of targets)await synthesize(target.platform,`Prueba de ${target.platform}. ¿Cómo estás? Hola {20}`,'controlled-sequential');
 let observationTimer;await Promise.race([new Promise(resolve=>{observationTimer=setTimeout(resolve,Math.max(0,report.durationSeconds*1000-(Date.now()-began)));}),...(process.env.AUDIT_UNTIL_ALL ? [allReceived] : [])]);clearTimeout(observationTimer);
 await Promise.allSettled(pendingSpeech);
 report.observedSeconds=Number(((Date.now()-began)/1000).toFixed(2));report.finishedAt=new Date().toISOString();await writeFile(process.env.AUDIT_OUTPUT||'docs/multistream-live-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{abort.abort();child.kill('SIGTERM');await reading;await fixture.cleanup();}
