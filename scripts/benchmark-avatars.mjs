import http from 'node:http';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir,cpus} from 'node:os';
import {join,extname} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import WebSocket from 'ws';
import {macSystemSpeech} from '../system-voice.mjs';

const root=new URL('../',import.meta.url);
const app=await readFile(new URL('public/app.js',root),'utf8');
const extracts=[
  ['function overlayData(', 'function animateMouth('],
  ['function animateMouth(', 'function normalizeMessage('],
  ['async function run(', 'function updatePause('],
];
const playback=extracts.map(([start,end])=>{
  const a=app.indexOf(start),b=app.indexOf(end,a);
  if(a<0||b<0)throw Error(`No se encontró el código de reproducción: ${start}`);
  return app.slice(a,b);
}).join('\n');
const harness=(await readFile(new URL('test/fixtures/avatar-browser.mjs',root),'utf8')).replace('/* APP_PLAYBACK_FUNCTIONS */',playback);
const voice=await macSystemSpeech('Hola, comunidad.', 'default', '');
const streams=new Set();
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{margin:20px;background:#202029;color:white;font:16px sans-serif}.main-avatar,.overlay-stage{position:relative!important;display:block;width:320px;height:320px;min-height:0;inset:auto!important;margin:0;transition-duration:0s!important}.main-avatar .character,.overlay-avatar .character{width:300px;height:300px}.overlay-avatar{width:300px;height:300px}#stages{display:flex;gap:24px}#results{white-space:pre-wrap}</style><h1>Prueba de voz, efectos y avatares</h1><div id="stages"><div id="main-avatar" class="main-avatar"></div><div id="overlay-stage" class="overlay-stage"><div id="overlay-avatar" class="overlay-avatar"></div><span id="overlay-user"></span><span id="overlay-text"></span></div></div><div id="stage-status"></div><div id="speech-error"></div><div id="library-speech-error"></div><pre id="results">Ejecutando…</pre><script type="module" src="/harness.mjs"></script></html>`;
const server=http.createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
    if(path==='/harness.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(harness);}
    if(path==='/api/events'){
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
      res.write(': ready\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;
    }
    if(path==='/api/overlay'){
      let body='';for await(const chunk of req)body+=chunk;
      for(const client of streams)client.write(`event: overlay\ndata: ${body}\n\n`);
      res.setHeader('Content-Type','application/json');return res.end('{"ok":true}');
    }
    if(path==='/api/speech'){
      for await(const chunk of req){} // Isolated local speech fixture; no provider requests.
      await new Promise(resolve=>setTimeout(resolve,120));
      res.setHeader('Content-Type','audio/wav');return res.end(voice);
    }
    const relative=path.slice(1);
    if(!/^(?:[\w-]+\.(?:js|css|json)|assets\/avatars\/[a-z-]+-sprites\.png|assets\/sounds\/[\w-]+\.mp3)$/.test(relative)){res.writeHead(404);return res.end();}
    const bytes=await readFile(new URL('public/'+relative,root));
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.mp3':'audio/mpeg'})[extname(relative)]);
    res.end(bytes);
  }catch(error){res.writeHead(500);res.end(error.message);}
});
let chrome,ws,profile;
try{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  profile=await mkdtemp(join(tmpdir(),'streamvoice-avatar-bench-'));
  chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
    '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--autoplay-policy=no-user-gesture-required','--mute-audio','--window-size=1280,900',
    '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank',
  ],{stdio:['ignore','ignore','pipe']});
  let log='';chrome.stderr.on('data',d=>{log+=d;});
  let port;
  for(let i=0;i<100;i++){
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{}
    if(chrome.exitCode!==null)throw Error('Chrome no inició: '+log.slice(-1500));
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!port)throw Error('Chrome no publicó el puerto de depuración.');
  const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(ws,'open');
  let id=0;const pending=new Map(),browserErrors=[];
  ws.on('message',data=>{
    const message=JSON.parse(data);
    if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p?.reject(Error(message.error.message)):p?.resolve(message.result);}
    if(message.method==='Runtime.exceptionThrown')browserErrors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
  });
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});ws.send(JSON.stringify({id:requestId,method,params}));});
  await cdp('Runtime.enable');await cdp('Page.enable');
  const params=new URLSearchParams();
  if(process.argv.includes('--quick'))params.set('quick','1');
  if(process.argv.includes('--countries'))params.set('countries','1');
  if(process.argv.includes('--characters'))params.set('characters','1');
  await cdp('Page.navigate',{url:base+(params.size?'/?'+params:'')});
  let result,lastProgress='';
  for(let i=0;i<240;i++){
    const response=await cdp('Runtime.evaluate',{expression:'JSON.stringify({progress:globalThis.avatarProgress,result:globalThis.avatarResult,error:globalThis.avatarError})',returnByValue:true});
    const state=JSON.parse(response.result.value||'{}');
    if(state.progress && state.progress!==lastProgress){lastProgress=state.progress;console.log(state.progress);}
    if(state.error)throw Error(state.error);
    if(state.result){result=state.result;break;}
    if(browserErrors.length)throw Error(browserErrors.join('\n'));
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!result)throw Error('Prueba del navegador agotó el tiempo.');
  result.environment={node:process.version,cpu:cpus()[0]?.model,browser:(await cdp('Browser.getVersion')).product};
  const output=process.argv.slice(2).find(arg=>!arg.startsWith('--'))||'docs/performance-avatars-2026-10-27.json';
  await writeFile(new URL(output,root),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({output,avatarsTested:result.avatarsTested,scenarios:result.scenarios.length,
    failures:result.failures,animationWork:result.animationWork,frameIntervals:result.frameIntervals,
    mainResponse:result.mainResponse,overlayResponse:result.overlayResponse,
    offAudioMainFrames:result.offAudioMainFrames,offAudioOverlayFrames:result.offAudioOverlayFrames,
    maxMouthLoops:result.maxMouthLoops,pendingMouthFrames:result.pendingMouthFrames,environment:result.environment},null,2));
  if(result.failures.length)process.exitCode=1;
}finally{
  ws?.close();
  if(chrome && chrome.exitCode===null){chrome.kill('SIGTERM');await once(chrome,'exit');}
  for(const stream of streams)stream.end();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  if(profile)await rm(profile,{recursive:true,force:true});
}
