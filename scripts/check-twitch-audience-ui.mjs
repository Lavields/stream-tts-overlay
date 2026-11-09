// Exercise the real app using isolated credentials and a temporary Chrome profile.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {authFixture} from '../test/auth-fixture.mjs';
const root=new URL('../',import.meta.url),fixture=await authFixture();
const base='http://127.0.0.1:14335';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let server,chrome,profile,ws;
try{
  server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'14335',AUTH_ACCOUNTS_FILE:fixture.path,FISH_API_KEY:'',ELEVENLABS_API_KEY:'',YOUTUBE_API_KEY:'',KICK_ACCESS_TOKEN:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),sleep(5000).then(()=>{throw Error('El servidor no inició');})]);
  profile=await mkdtemp(join(tmpdir(),'streamvoice-twitch-ui-'));
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
  const output=new URL('docs/twitch-audience-2026-10-27/',root);
  await(await import('node:fs/promises')).mkdir(output,{recursive:true});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
    const OriginalEventSource=window.EventSource;
    window.EventSource=class extends OriginalEventSource {
      constructor(url,...options){super(url,...options);if(url==='/api/events')window.testChatSource=this;}
    };
    if(!localStorage.getItem('vocalive-settings:admin'))localStorage.setItem('vocalive-settings:admin',JSON.stringify({twitchAudience:'all',profiles:{'twitch:blocked':{blocked:true}}}));
    window.testChatEvent=(type,data)=>window.testChatSource.dispatchEvent(new MessageEvent(type,{data:JSON.stringify(data)}));
  `});
  let failLookup=false;const lookupUsers=[];
  ws.on('message',bytes=>{const m=JSON.parse(bytes);if(m.method==='Fetch.requestPaused'){
    const body=JSON.parse(m.params.request.postData||'{}');lookupUsers.push(body.userId);
    const failed=failLookup;
    setTimeout(()=>cdp('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:failed?503:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(failed?{error:'Twitch no respondió al verificar seguidores.'}:{follows:body.userId==='111'})).toString('base64')}).catch(error=>errors.push(error.message)),250);
  }});
  await cdp('Fetch.enable',{patterns:[{urlPattern:base+'/api/twitch/follower',requestStage:'Request'}]});
  await cdp('Page.navigate',{url:base+'/login'});
  await until('typeof document.querySelector("#login-form")?.onsubmit === "function"');
  await evaluate('document.querySelector("#login-user").value="admin";document.querySelector("#login-password").value="test-password";document.querySelector("#login-form").requestSubmit();true');
  await until('typeof document.querySelector("#twitch-audience-open")?.onclick === "function"');
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click();true`);
  const emit=(type,data)=>evaluate(`window.testChatEvent(${JSON.stringify(type)},${JSON.stringify(data)});true`);
  const queueIds=()=>evaluate('Array.from(document.querySelectorAll("#queue-list [data-play]")).map(b=>b.dataset.play)');
  const mode=async value=>{await click('#twitch-audience-open');await click('[data-twitch-audience='+value+']');};
  const message=(id,roles={},extra={})=>({id,platform:'twitch',channel:'canal',user:id,displayName:id,userId:'100',roles,text:'hola comunidad',...extra});
  const messages=[message('viewer'),message('follower',{}, {userId:'111'}),message('mod',{moderator:true}),message('sub',{subscriber:true}),message('owner',{broadcaster:true}),message('vip',{vip:true},{userId:'222'}),message('other',{}, {platform:'kick'}),message('blocked',{moderator:true})];
  await click('#pause');
  const expected={all:['viewer','follower','mod','sub','owner','vip','other'],followers:['other','follower','mod','sub','owner'],subscribers:['mod','sub','owner','other'],moderators:['mod','owner','other']};
  for(const value of Object.keys(expected)){
    await click('#clear-queue');await mode(value);
    for(const m of messages)await emit('chat',m);
    await until(`document.querySelectorAll('#queue-list [data-play]').length===${expected[value].length}`);
    await sleep(350);assert.deepEqual(await queueIds(),expected[value],value);
    assert.equal(await evaluate('document.querySelector("[data-twitch-audience][aria-pressed=true]").dataset.twitchAudience'),value);
    console.log(value+': '+JSON.stringify(await queueIds()));
  }
  assert.deepEqual(lookupUsers.sort(),['100','111','222']);
  // Tightening a filter removes queued messages immediately.
  await click('#clear-queue');await mode('all');
  for(const m of messages.slice(0,4))await emit('chat',m);
  await mode('moderators');assert.deepEqual(await queueIds(),['mod']);
  // Moderation, clear and off must invalidate work still awaiting a follower response.
  await click('#clear-queue');await mode('followers');
  await emit('chat',message('deleted',{}, {userId:'111'}));await emit('delete',{id:'deleted'});await sleep(400);assert.deepEqual(await queueIds(),[]);
  await emit('chat',message('cleared',{}, {userId:'111'}));await click('#clear-queue');await sleep(400);assert.deepEqual(await queueIds(),[]);
  await emit('chat',message('off',{}, {userId:'111'}));await click('#tts-toggle');await click('#tts-toggle');await sleep(400);assert.deepEqual(await queueIds(),[]);
  // Restore queue pause after the off/on action resets it.
  await click('#pause');failLookup=true;
  await emit('chat',message('unverified',{}, {userId:'111'}));await sleep(500);assert.deepEqual(await queueIds(),[]);
  assert.ok(await evaluate('document.querySelector("#twitch-audience-note").textContent.includes("no respondió")'));
  failLookup=false;
  const sizes=[];
  for(const [width,height]of [[1440,1000],[1280,720],[390,844],[360,640]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await mode('moderators');await click('#twitch-audience-open');await sleep(100);
    const bounds=await evaluate(`(()=>{const r=document.querySelector('#twitch-audience-panel').getBoundingClientRect(),b=document.querySelector('#twitch-audience-open').getBoundingClientRect();return {panel:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},button:{y:b.y,bottom:b.bottom},pageHeight:document.documentElement.scrollHeight,pageWidth:document.documentElement.scrollWidth};})()`);
    assert.ok(bounds.panel.x>=0&&bounds.panel.y>=0&&bounds.panel.right<=width&&bounds.panel.bottom<=height,JSON.stringify({width,height,bounds}));
    assert.ok(bounds.button.y>=0&&bounds.button.bottom<=height);assert.ok(bounds.pageWidth<=width);
    const image=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile(new URL(width+'-audience.png',output),Buffer.from(image.data,'base64'));
    sizes.push({width,height,...bounds});await click('[data-twitch-audience=moderators]');
  }
  await cdp('Page.reload');
  await until('document.querySelector("[data-twitch-audience=moderators]")?.getAttribute("aria-pressed")==="true"');
  assert.equal(await evaluate('document.querySelector("#twitch-audience-label").textContent'),'Solo mods');
  await mode('followers');await until('!document.querySelector("#twitch-followers-settings").hidden');
  await click('#twitch-audience-open');await click('#twitch-followers-settings');
  await until('document.querySelector("#settings-dialog").open&&document.querySelector("#twitch-settings").open');
  assert.equal(await evaluate('document.activeElement.name'),'TWITCH_OAUTH_TOKEN');
  assert.deepEqual(errors,[]);
  const report={date:'2026-10-27',matrix:expected,sizes,lookupUsers,persistence:true,filterPrunesQueue:true,moderationCancelsPending:true,clearCancelsPending:true,offCancelsPending:true,errorDoesNotGrantAccess:true,otherPlatformsUnaffected:true,settingsShortcut:true,browserErrors:errors,scope:'App y SSE reales con mensajes inyectados de prueba; comprobaciones de seguidores interceptadas localmente. Sin conexión a Twitch ni síntesis externa.'};
  await writeFile(new URL('functionality.json',output),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{
  ws?.close();
  for(const child of [chrome,server])if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
  if(profile)await rm(profile,{recursive:true,force:true});
  await fixture.cleanup();
}
