import {performance} from 'node:perf_hooks';
import {cpus,platform,arch} from 'node:os';
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {speechSegments} from '../public/speech-text.js';
import {VOICE_TAG_NAMES} from '../public/chat-limit.js';
import {authFixture} from '../test/auth-fixture.mjs';

// No real provider credentials or synthesis: the HTTP measurements use the
// existing Fish fixture and isolate application overhead from upstream latency.
const root=fileURLToPath(new URL('../',import.meta.url));
const catalog=JSON.parse(await readFile(new URL('../public/voice-catalog.json',import.meta.url)));
const voices=new Map(catalog.requested.map(v=>[v.tag,v.id]));
const multi='{verity} Hola soy verity {chilena} hola soy chilena {argentina} hola soy argentina {madre} hola soy madre {terror} hola';
const plain=multi.replace(/\{\w+\}/g,'');
const cases=[
  ['one_voice',plain,2000],
  ['five_voices',multi,2000],
  ['all_54_voices',VOICE_TAG_NAMES.map(tag=>`{${tag}} hola`).join(' '),1000],
  ['voices_sounds_reactions','{sage} hola jajaja {58} {reyna} tqm XD {45} {jett} final',2000],
  ['stress_100k_text','uno '.repeat(25000),100],
  ['stress_10k_tags','{verity}'.repeat(10000)+' hola',100],
];
function stats(samples,elapsed=samples.reduce((a,b)=>a+b,0)){
  const sorted=[...samples].sort((a,b)=>a-b);
  const percentile=q=>sorted[Math.max(0,Math.ceil(sorted.length*q)-1)];
  return {samples:samples.length,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),maxMs:sorted.at(-1),throughputPerSecond:samples.length*1000/elapsed};
}
const report={
  measuredAt:new Date().toISOString(),node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model,
  scope:'Node local parser and authenticated HTTP server with Fish mocked; no audio decoding, playback or live provider latency.',
  liveFishMeasured:false,parser:[],
};
for(const [name,text,iterations] of cases){
  for(let i=0;i<100;i++)speechSegments(text);
  global.gc?.();
  const samples=[],start=performance.now();
  for(let i=0;i<iterations;i++){
    const t=performance.now();speechSegments(text);samples.push(performance.now()-t);
  }
  report.parser.push({name,inputCharacters:text.length,segments:speechSegments(text).length,...stats(samples,performance.now()-start)});
}
if(global.gc){
  global.gc();const before=process.memoryUsage().heapUsed;
  for(let i=0;i<10000;i++)speechSegments(multi);
  global.gc();report.retainedHeapAfter10kMessagesBytes=process.memoryUsage().heapUsed-before;
}
const fixture=await authFixture();
let child;
try{
  // Dedicated port and temporary accounts; no access to the user's settings.
  const base='http://127.0.0.1:14329';
  child=spawn(process.execPath,['--import','./test/fixtures/fish-fetch.mjs','server.mjs'],{
    cwd:root,env:{...process.env,PORT:'14329',AUTH_ACCOUNTS_FILE:fixture.path,FISH_API_KEY:'test-only',FISH_MODEL:'',ELEVENLABS_API_KEY:''},
    stdio:['ignore','pipe','pipe'],
  });
  let errors='';child.stderr.on('data',d=>{errors+=d;});
  await Promise.race([
    once(child.stdout,'data'),
    once(child,'exit').then(()=>{throw Error(`Benchmark server exited: ${errors}`);}),
    new Promise((_,reject)=>setTimeout(()=>reject(Error('Benchmark server startup timeout')),5000).unref()),
  ]);
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'test-password'})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const payloads=text=>speechSegments(text).filter(s=>s.type==='speech').map(s=>({provider:'fish',voiceId:voices.get(s.voiceTag)||catalog.requested[0].id,text:s.text}));
  async function request(payload){
    const response=await fetch(base+'/api/speech',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(payload)});
    const bytes=await response.arrayBuffer();
    assert.equal(response.status,200,response.status===200?undefined:Buffer.from(bytes).toString());
    assert.ok(bytes.byteLength>0);
  }
  report.http=[];
  for(const [name,text] of [['one_voice',plain],['five_voices',multi]]){
    const requests=payloads(text);
    async function message(){for(const payload of requests)await request(payload);}
    for(let i=0;i<10;i++)await message();
    const samples=[],start=performance.now();
    for(let i=0;i<100;i++){const t=performance.now();await message();samples.push(performance.now()-t);}
    report.http.push({name,upstream:'mocked, zero intentional delay',requestsPerMessage:requests.length,...stats(samples,performance.now()-start)});
  }
  const samples=[],payload=payloads(plain)[0],concurrency=10,total=300;
  let next=0;const start=performance.now();
  await Promise.all(Array.from({length:concurrency},async()=>{
    while(next<total){next++;const t=performance.now();await request(payload);samples.push(performance.now()-t);}
  }));
  report.httpLoad={requests:total,concurrency,errors:0,...stats(samples,performance.now()-start)};
}finally{
  if(child && child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
  await fixture.cleanup();
}
const json=JSON.stringify(report,null,2)+'\n';
if(process.argv[2])await writeFile(process.argv[2],json);
console.log(json);
