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
const base='http://127.0.0.1:14334';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let server,chrome,profile,ws;
try{
  server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'14334',AUTH_ACCOUNTS_FILE:fixture.path,FISH_API_KEY:'',ELEVENLABS_API_KEY:'',YOUTUBE_API_KEY:'',KICK_ACCESS_TOKEN:''},stdio:['ignore','pipe','pipe']});
  await Promise.race([once(server.stdout,'data'),sleep(5000).then(()=>{throw Error('El servidor no inició');})]);
  profile=await mkdtemp(join(tmpdir(),'streamvoice-studio-ux-'));
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
  const until=async expression=>{for(let i=0;i<100;i++){if(errors.length)throw Error(errors.join('\n'));if(await evaluate(expression))return;await sleep(100);}throw Error('Esperando '+expression);};
  await cdp('Runtime.enable');await cdp('Page.enable');
  const output=new URL('docs/ux-refresh-2026-10-27/',root);
  await (await import('node:fs/promises')).mkdir(output,{recursive:true});
  // A local, four-second speech-like waveform exercises the actual player.
  const rate=24000,samples=rate*4,wav=Buffer.alloc(44+samples*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++){const t=i/rate,envelope=Math.sin(t*15)**2>.12?.18:0;wav.writeInt16LE(Math.round(Math.sin(t*2*Math.PI*180)*envelope*32767),44+i*2);}
  let speechRequests=0;
  ws.on('message',bytes=>{const m=JSON.parse(bytes);if(m.method==='Fetch.requestPaused'){speechRequests++;cdp('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'audio/wav'}],body:wav.toString('base64')}).catch(error=>errors.push(error.message));}});
  await cdp('Fetch.enable',{patterns:[{urlPattern:base+'/api/speech',requestStage:'Request'}]});
  await cdp('Page.navigate',{url:base+'/login'});
  await until('typeof document.querySelector("#login-form")?.onsubmit === "function"');
  await evaluate('document.querySelector("#login-user").value="admin";document.querySelector("#login-password").value="test-password";document.querySelector("#login-form").requestSubmit();true');
  await until('document.querySelectorAll("#avatar-grid [data-avatar]").length===29');
  await until('document.querySelectorAll("#default-voice option").length>10');
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click();true`);
  const query=(id,text)=>evaluate(`(()=>{const i=document.getElementById(${JSON.stringify(id)});i.focus();i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  const screenshot=async name=>{await sleep(120);const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL(name+'.png',output),Buffer.from(r.data,'base64'));};
  const geometry=()=>evaluate(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};const ids=['tts-toggle','pause','skip','jump-queue','twitch-audience-open','volume'];return {viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},controls:Object.fromEntries(ids.map(id=>{const e=document.getElementById(id),r=box(e),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return [id,{...r,usable:hit===e||e.contains(hit)}];})),queue:box(document.querySelector('#queue-panel')),form:box(document.querySelector('#test-form')),idleVisibility:getComputedStyle(document.querySelector('#main-avatar')).visibility};})()`);
  const sizes=[];
  for(const [width,height]of [[1440,1000],[1280,720],[768,1024],[390,844],[360,640]]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await click('[data-view=studio]');await sleep(400);
    const initial=await geometry();assert.ok(initial.document.width<=width,JSON.stringify(initial));
    for(const [id,r]of Object.entries(initial.controls)){assert.ok(r.usable,`${width}: ${id} tapado`);assert.ok(r.y>=0&&r.bottom<=height,`${width}: ${id} fuera de vista`);}
    assert.equal(initial.idleVisibility,'hidden');
    if(width>900)assert.ok(initial.form.bottom<=height,`${width}: prueba/cola fuera de la primera pantalla: ${initial.form.bottom}`);
    await screenshot(width+'-studio');
    await evaluate('window.scrollTo(0,document.documentElement.scrollHeight);true');await sleep(100);
    const scrolled=await geometry();for(const [id,r]of Object.entries(scrolled.controls))assert.ok(r.usable,`${width}: ${id} inaccesible al desplazar`);
    await click('#jump-queue');await sleep(100);
    const jumped=await geometry();assert.ok(jumped.queue.y<height&&jumped.queue.bottom>0,'El acceso a cola no la muestra: '+JSON.stringify({width,height,jumped}));
    sizes.push({width,height,initial,scrolled,jumped});
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  // Voice pages and tabs work without losing access to the operation bar.
  await click('[data-view=voices]');
  assert.equal(await evaluate('document.querySelectorAll("#voice-library .voice-item").length'),9);
  const first=await evaluate('document.querySelector("[data-voice-default]").dataset.voiceDefault');
  await click('#voice-next');assert.notEqual(await evaluate('document.querySelector("[data-voice-default]").dataset.voiceDefault'),first);
  await query('voice-search','lena');assert.ok(await evaluate('Array.from(document.querySelectorAll("#voice-library .voice-item > strong")).every(e=>e.textContent.toLowerCase().includes("lena"))'));
  await click('[data-voice-default]');
  const chosenVoice=await evaluate('document.querySelector("#default-voice").value');
  assert.equal(await evaluate('document.querySelector("[data-voice-default][aria-pressed=true]")?.dataset.voiceDefault'),chosenVoice);
  await click('[data-voice-favorite]');
  await evaluate('document.querySelector("#voice-filter").value="favorites";document.querySelector("#voice-filter").dispatchEvent(new Event("change"));true');
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('[data-voice-default]')).some(e=>e.dataset.voiceDefault===${JSON.stringify(chosenVoice)})`));
  await click('#tab-avatars');assert.equal(await evaluate('document.querySelector("#voice-panel").hidden'),true);
  await query('library-avatar-search','fion');assert.equal(await evaluate('document.querySelectorAll("#library-avatars [data-avatar]").length'),1);
  await click('#library-avatars [data-avatar=cat-calvo]');
  assert.equal(await evaluate('document.querySelector("#current-avatar-name").textContent'),'Gato Calvo');
  await click('[data-view=studio]');await click('#change-avatar');
  await query('avatar-search','alvo');await click('#avatar-grid [data-avatar=cat-calvo]');
  assert.equal(await evaluate('document.querySelector("#avatar-picker-dialog").open'),false);
  assert.equal(await evaluate('document.querySelector("#current-avatar-name").textContent'),'Gato Calvo');
  // Search stays above the fixed save action and does not grow the dialog.
  await click('#add-user');
  const before=await evaluate('document.querySelector("#user-dialog").getBoundingClientRect().height');
  await query('user-avatar-search','gato');
  const popup=await evaluate(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {list:box(document.querySelector('#user-avatar-results')),save:box(document.querySelector('#user-form [type=submit]')),dialog:box(document.querySelector('#user-dialog')),popover:document.querySelector('#user-avatar-results').matches(':popover-open')};})()`);
  assert.equal(popup.dialog.height,before);assert.ok(popup.popover);assert.ok(popup.list.bottom<=popup.save.top||popup.list.top>=popup.save.bottom,'La búsqueda tapa Guardar');
  await screenshot('mobile-assignment-search');
  await query('user-avatar-search','fion');await click('#user-avatar-results [role=option]');
  await evaluate('document.querySelector("#user-platform").value="test";document.querySelector("#user-platform").dispatchEvent(new Event("change"));document.querySelector("#user-name").value="usuario_prueba";true');
  await click('#user-form [type=submit]');
  assert.equal(await evaluate('document.querySelector("#user-dialog").open'),false);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("vocalive-settings:admin")).profiles["test:usuario_prueba"].avatar'),'cat-calvo');
  // Exercise actual queue controls and the real player with an intercepted local fixture.
  await click('#pause');
  assert.equal(await evaluate('document.querySelector("#pause").getAttribute("aria-pressed")'),'true');
  for(let i=0;i<3;i++)await evaluate(`document.querySelector('#test-message').value='mensaje de prueba ${i}';document.querySelector('#test-form').requestSubmit();true`);
  assert.equal(await evaluate('document.querySelector("#live-queue-count").textContent'),'3');
  await click('#clear-queue');assert.equal(await evaluate('document.querySelector("#live-queue-count").textContent'),'0');
  await evaluate('document.querySelector("#test-message").value="Hola comunidad, una prueba";document.querySelector("#test-form").requestSubmit();true');
  await click('#pause');
  await until('document.querySelector("#main-avatar").classList.contains("is-present")');
  await until('document.querySelector("#main-avatar").classList.contains("talking")');
  assert.equal(await evaluate('document.querySelector("#live-status").textContent'),'Leyendo un mensaje');
  await screenshot('mobile-speaking');
  await click('#skip');
  await until('!document.querySelector("#main-avatar").classList.contains("is-present")');await sleep(400);
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#main-avatar")).visibility'),'hidden');
  await click('#pause');
  await evaluate('document.querySelector("#test-message").value="mensaje pendiente";document.querySelector("#test-form").requestSubmit();true');
  await click('#tts-toggle');
  assert.equal(await evaluate('document.querySelector("#live-queue-count").textContent'),'0');
  assert.equal(await evaluate('document.querySelector("#live-status").textContent'),'Lectura apagada');
  assert.equal(await evaluate('document.querySelector("#pause").disabled'),true);
  await click('#tts-toggle');
  await evaluate('document.querySelector("#volume").value="35";document.querySelector("#volume").dispatchEvent(new Event("input",{bubbles:true}));true');
  assert.equal(await evaluate('document.querySelector("#volume-out").textContent'),'35%');
  await click('[data-view=users]');assert.equal(await evaluate('document.querySelector("[data-view=users]").getAttribute("aria-current")'),'page');
  const semantics=await evaluate('Array.from(document.querySelectorAll("dialog")).every(e=>e.hasAttribute("aria-labelledby")&&document.getElementById(e.getAttribute("aria-labelledby")))');
  assert.ok(semantics);assert.deepEqual(errors,[]);
  const result={date:'2026-10-27',sizes,searchPopup:popup,checks:{controlsStayVisible:true,queueDirectAccess:true,voicePagination:true,partialSearch:true,favoritePreserved:true,avatarSelection:true,assignmentSaved:true,queuePauseResume:true,skipPlayback:true,ttsClearsPending:true,volumeSaved:true,idleAvatarHidden:true,dialogNames:true},speechRequests,browserErrors:errors,scope:'App real, cuenta temporal y audio local interceptado. Sin síntesis ni conexiones externas.'};
  await writeFile(new URL('functionality.json',output),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({sizes:sizes.map(s=>({width:s.width,height:s.height,pageHeight:s.initial.document.height,queueY:s.initial.queue.y})),checks:result.checks,speechRequests,browserErrors:errors},null,2));
}finally{
  ws?.close();
  for(const child of [chrome,server])if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
  if(profile)await rm(profile,{recursive:true,force:true});
  await fixture.cleanup();
}
