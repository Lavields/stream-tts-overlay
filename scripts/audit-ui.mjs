// Read-only UX audit of the real app using isolated credentials and a temporary Chrome profile.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {authFixture} from '../test/auth-fixture.mjs';
const root=new URL('../',import.meta.url),fixture=await authFixture();
const base='http://127.0.0.1:14333';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let server,chrome,profile,ws;
try{
  server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'14333',AUTH_ACCOUNTS_FILE:fixture.path,FISH_API_KEY:'',ELEVENLABS_API_KEY:'',YOUTUBE_API_KEY:'',KICK_ACCESS_TOKEN:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),sleep(5000).then(()=>{throw Error('El servidor no inició');})]);
  profile=await mkdtemp(join(tmpdir(),'streamvoice-ux-audit-'));
  chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--autoplay-policy=no-user-gesture-required','--mute-audio','--window-size=1440,1100','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  let port;
  for(let i=0;i<100;i++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{}await sleep(100);}
  if(!port)throw Error('Chrome no inició');
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await once(ws,'open');
  let id=0;const pending=new Map(),errors=[];
  ws.on('message',bytes=>{const m=JSON.parse(bytes);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});ws.send(JSON.stringify({id:requestId,method,params}));});
  const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100);}throw Error('Esperando '+expression);};
  await cdp('Runtime.enable');await cdp('Page.enable');
  const output=new URL('docs/ux-refresh-2026-10-27/',root);
  await (await import('node:fs/promises')).mkdir(output,{recursive:true});
  const records=[];
  const capture=async(name)=>{
    const metrics=await evaluate(`(()=>{const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';return {viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},targets:Object.fromEntries(['#page-title','#stage','#avatar-grid','#default-voice-search','#tts-toggle','#pause','#queue-list','#test-form','#overlay-dialog','#user-dialog'].map(s=>[s,rect(document.querySelector(s))])),smallButtons:[...document.querySelectorAll('button')].filter(visible).map(e=>({text:e.textContent.trim().slice(0,55),label:e.getAttribute('aria-label'),...rect(e)})).filter(r=>r.width<36||r.height<36),unlabeledInputs:[...document.querySelectorAll('input,select')].filter(visible).filter(e=>!e.getAttribute('aria-label')&&!document.querySelector('label[for="'+e.id+'"]')&&!e.closest('label')).map(e=>e.id)};})()`);
    records.push({name,...metrics});
    const image=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(new URL(name+'.png',output),Buffer.from(image.data,'base64'));
    console.log(name+': '+JSON.stringify({width:metrics.document.width,height:metrics.document.height,smallButtons:metrics.smallButtons.length,unlabeledInputs:metrics.unlabeledInputs}));
  };
  await cdp('Page.navigate',{url:base+'/login'});
  await until('Boolean(document.querySelector("#login-user"))');
  await capture('desktop-login');
  await evaluate('document.querySelector("#login-user").value="admin";document.querySelector("#login-password").value="test-password";document.querySelector("#login-form").requestSubmit();true');
  await until('document.querySelectorAll("#avatar-grid [data-avatar]").length===29');
  await until('document.querySelectorAll("#default-voice option").length>10');
  for(const [width,height]of [[1440,1000],[1280,720],[768,1024],[390,844]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await evaluate('document.querySelector("[data-view=studio]").click();window.scrollTo(0,0);true');await sleep(200);
    await capture(width+'-studio-top');
    await evaluate('document.querySelector("#tts-toggle").scrollIntoView({block:"center"});true');await sleep(100);
    await capture(width+'-studio-controls');
    await evaluate('document.querySelector("#test-form").scrollIntoView({block:"center"});true');await sleep(100);
    await capture(width+'-studio-queue');
    await evaluate('document.querySelector("[data-view=voices]").click();window.scrollTo(0,0);true');await sleep(150);
    await capture(width+'-voices');
    await evaluate('document.querySelector("#add-user-page").click();true');await sleep(100);
    await capture(width+'-assignment');
    await evaluate('document.querySelector("#user-avatar-search").focus();document.querySelector("#user-avatar-search").value="gato";document.querySelector("#user-avatar-search").dispatchEvent(new Event("input",{bubbles:true}));true');await sleep(100);
    await capture(width+'-assignment-search');
    await evaluate('document.querySelector("#user-dialog").close();document.querySelector("#overlay-open").click();true');await sleep(100);
    await capture(width+'-overlay-help');
    await evaluate('document.querySelector("#overlay-dialog").close();document.querySelector("[data-view=connections]").click();window.scrollTo(0,0);true');await sleep(100);
    await capture(width+'-connections');
  }
  const semantics=await evaluate(`(()=>({dialogs:[...document.querySelectorAll('dialog')].map(e=>({id:e.id,ariaLabel:e.getAttribute('aria-label'),ariaLabelledby:e.getAttribute('aria-labelledby')})),nav:[...document.querySelectorAll('nav button')].map(e=>({text:e.textContent.trim(),current:e.getAttribute('aria-current'),pressed:e.getAttribute('aria-pressed')})),workspace:{tag:document.querySelector('.workspace').tagName,role:document.querySelector('.workspace').getAttribute('role')},voiceFilter:document.querySelector('#voice-filter').value}))()`);
  await writeFile(new URL('measurements.json',output),JSON.stringify({date:'2026-10-27',scope:'Cuenta y navegador temporales, sin conexiones ni credenciales de proveedores. Evaluación sin cambios en la interfaz.',records,semantics,browserErrors:errors},null,2)+'\n');
  assert.deepEqual(errors,[]);
}finally{
  ws?.close();
  for(const child of [chrome,server])if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
  if(profile)await rm(profile,{recursive:true,force:true});
  await fixture.cleanup();
}
