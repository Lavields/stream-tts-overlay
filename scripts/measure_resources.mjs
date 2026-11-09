import { fork } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { authFixture } from '../test/auth-fixture.mjs';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const output=process.argv[2] || root+'/docs/resource-current.json';
const fixture=await authFixture();
const env={...process.env,PORT:'15329',AUTH_ACCOUNTS_FILE:fixture.path};
for(const key of ['NODE_OPTIONS','ELEVENLABS_API_KEY','FISH_API_KEY','YOUTUBE_API_KEY','TWITCH_USERNAME','TWITCH_OAUTH_TOKEN','KICK_ACCESS_TOKEN','EULER_API_KEY']) delete env[key];
const child=fork(root+'/server.mjs',[],{cwd:root,env,execArgv:['--import',fileURLToPath(new URL('./resource-monitor.mjs',import.meta.url))],silent:true});
let errors='';child.stderr.on('data',b=>errors+=b.toString());
const sample=async()=>{const p=once(child,'message');child.send('sample');return (await p)[0];};
const summarize=(a,b)=>({rssMiB:b.memory.rss/1048576,heapMiB:b.memory.heapUsed/1048576,cpuPercentOneCore:100*(b.cpu.user+b.cpu.system-a.cpu.user-a.cpu.system)/1000/(b.at-a.at),elapsedSeconds:(b.at-a.at)/1000,maxRssMiB:b.resource.maxRSS/1024});
const out={platform:process.platform,node:process.version,cpu:cpus()[0].model,logicalCpus:cpus().length,systemRamGiB:totalmem()/1073741824,scenarios:[]};
try{
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error(errors)}),delay(5000).then(()=>{throw Error('Startup timeout')})]);
 let a=await sample();await delay(10000);let b=await sample();out.scenarios.push({name:'idle before login',...summarize(a,b)});
 const base='http://127.0.0.1:15329';
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'test-password'})});
 if(!login.ok)throw Error('Login failed');
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const ac=new AbortController();const stream=await fetch(base+'/api/events?overlay=1',{headers:{Cookie:cookie},signal:ac.signal});
 const reader=stream.body.getReader();const draining=(async()=>{try{while(!(await reader.read()).done){}}catch{}})();
 a=await sample();await delay(10000);b=await sample();out.scenarios.push({name:'idle authenticated with 1 SSE',...summarize(a,b)});
 a=await sample();
 for(let i=0;i<200;i++){
 const r=await fetch(base+'/api/overlay',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({avatar:'sock',user:'Prueba',text:'Mensaje de prueba para medir recursos del overlay.',level:(i%10)/10,speaking:true})});
 if(!r.ok)throw Error('Overlay failed '+r.status);await r.arrayBuffer();await delay(90);
 }
 b=await sample();out.scenarios.push({name:'200 overlay updates, 90ms between requests, 1 SSE',...summarize(a,b)});
 a=await sample();let bytes=0;
 for(let i=0;i<30;i++){const r=await fetch(base+'/assets/avatars/sock-sprites.png',{headers:{Cookie:cookie}});if(!r.ok)throw Error('Asset failed');bytes+=(await r.arrayBuffer()).byteLength;}
 b=await sample();out.scenarios.push({name:'30 repeated sprite downloads',bytes,...summarize(a,b)});
 a=await sample();await delay(10000);b=await sample();out.scenarios.push({name:'idle after load',...summarize(a,b)});
 ac.abort();await draining;
 await writeFile(output,JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify(out,null,2));
} finally {if(child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}await fixture.cleanup();}
