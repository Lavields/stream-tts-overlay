import {createMouthDriver,systemSpeechRms} from '/mouth.js';
import {createAvatarPresence,SLIDE_MS} from '/presence.js';
import {avatars,countryAvatars,characterAvatars,avatarSVG,setMouth,blink} from '/avatars.js';
import {speechSegments} from '/speech-text.js';
import {expressionSpeech} from '/chat-reactions.js';
import {playSoundEffect} from '/sound-files.js';
import {createSoundCooldown} from '/sound-cooldown.js';
import {playbackGain} from '/voice-volume.js';
import '/overlay.js';

const $=selector=>document.querySelector(selector);
const catalog=await (await fetch('/voice-catalog.json')).json();
const defaults={voice:'fish:'+catalog.requested[0].id};
const settings={...defaults,ttsEnabled:true,profiles:{},readName:false,expandAbbreviations:true,
  describeEmojis:true,soundEffectsEnabled:true,streamReactionsEnabled:true,volume:80,soundVolume:60,
  voiceVolumes:{},speed:1,delay:0,avatar:'sock'};
const mainPresence=createAvatarPresence($('#main-avatar'),blink);
const soundCooldown=createSoundCooldown();
const soundsReady=Promise.resolve(),customSoundFiles=new Map();
const voiceList=()=>catalog.requested.map(v=>({...v,id:'fish:'+v.id}));
const key=(platform,user)=>platform+':'+user;
let current=null,previewAvatar='sock',blinkId='',blinkAt=0,nextAt=0,total=0;
let analyser,gainNode,mouthFrame,level=0,overlayBusy=false,overlayPending=null,lastOverlay=0;
const audioContext=new AudioContext();
await audioContext.resume();
const failures=[],scenarios=[],frameWork=[],frameIntervals=[],longTasks=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};
const toast=message=>failures.push('Reproductor: '+message);
const pump=()=>{},updateVoicePreviewControls=()=>{},updateSoundCooldownUI=()=>{};
const updateLiveState=()=>{};
const cooldownNotice=()=>false;
async function api(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
function updateStage(message){
  previewAvatar=settings.avatar;
  if(message)$('#main-avatar').innerHTML=avatarSVG(settings.avatar);
  setMouth($('#main-avatar'),0);
  mainPresence.update({speaking:Boolean(current?.started)});
  sendOverlay(0,true);
}

// The runner inserts the current app's run, playback, animation and overlay
// functions verbatim here; tests do not maintain a second playback algorithm.
/* APP_PLAYBACK_FUNCTIONS */

const nativeRAF=window.requestAnimationFrame.bind(window),nativeCancelRAF=window.cancelAnimationFrame.bind(window);
const pendingMouthFrames=new Set();let maxMouthLoops=0;
window.requestAnimationFrame=callback=>{
  const id=nativeRAF(t=>{
    pendingMouthFrames.delete(id);const start=performance.now();
    try{callback(t);}finally{if(callback.name==='frame')frameWork.push(performance.now()-start);}
  });
  if(callback.name==='frame'){pendingMouthFrames.add(id);maxMouthLoops=Math.max(maxMouthLoops,pendingMouthFrames.size);}
  return id;
};
window.cancelAnimationFrame=id=>{pendingMouthFrames.delete(id);nativeCancelRAF(id);};
try{new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});}catch{}

const voiceBuffers=new WeakSet(),sources=[],activeSources=new Set();
let voiceScale=1,lastEnded=performance.now(),lastSample=0,sampling=true,offAudioMainFrames=0,offAudioOverlayFrames=0;
const decode=audioContext.decodeAudioData.bind(audioContext);
audioContext.decodeAudioData=async bytes=>{
  // Speech is the local WAV fixture; bundled effects are MP3. Identify the
  // buffer independently of job.playingSound so a stale flag cannot mask a bug.
  const voice=new Uint8Array(bytes,0,4).every((b,i)=>b===[82,73,70,70][i]);
  const buffer=await decode(bytes);if(voice)voiceBuffers.add(buffer);
  if(voice && voiceScale!==1)for(let c=0;c<buffer.numberOfChannels;c++){
    const data=buffer.getChannelData(c);for(let i=0;i<data.length;i++)data[i]*=voiceScale;
  }
  return buffer;
};
const createSource=audioContext.createBufferSource.bind(audioContext);
audioContext.createBufferSource=()=>{
  const source=createSource(),start=source.start.bind(source);
  source.start=(...args)=>{
    const record={type:voiceBuffers.has(source.buffer)?'voice':'effect',startedAt:performance.now(),
      duration:source.buffer.duration,voiceScale,mainOpenFrames:0,overlayOpenFrames:0,audibleFrames:0,
      wrongMainFrames:0,wrongOverlayFrames:0,analyser,bins:new Uint8Array(256)};
    sources.push(record);activeSources.add(record);
    source.addEventListener('ended',()=>{record.endedAt=performance.now();activeSources.delete(record);lastEnded=record.endedAt;});
    return start(...args);
  };
  return source;
};
function sample(t){
  if(lastSample)frameIntervals.push(t-lastSample);lastSample=t;
  const main=$('#main-avatar').classList.contains('talking');
  const overlay=$('#overlay-avatar').classList.contains('talking');
  for(const record of activeSources){
    record.analyser.getByteTimeDomainData(record.bins);
    let power=0;for(const b of record.bins)power+=((b-128)/128)**2;
    const audible=Math.sqrt(power/record.bins.length)>=.009;
    const elapsed=t-record.startedAt;
    if(record.type==='voice' && audible){record.audibleFrames++;record.firstAudible??=t;}
    if(main){record.mainOpenFrames++;record.firstMainOpen??=t;}
    if(overlay){record.overlayOpenFrames++;record.firstOverlayOpen??=t;}
    if(record.type==='effect' || record.voiceScale===0){
      if(elapsed>50 && main)record.wrongMainFrames++;
      if(elapsed>180 && overlay)record.wrongOverlayFrames++;
    }
  }
  if(!activeSources.size){
    if(t-lastEnded>80 && main)offAudioMainFrames++;
    if(t-lastEnded>220 && overlay)offAudioOverlayFrames++;
  }
  if(sampling)nativeRAF(sample);
}
nativeRAF(sample);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){const start=performance.now();while(!predicate()){if(performance.now()-start>6000)throw Error('No se alcanzó el estado esperado. '+JSON.stringify({failures,sources:sources.slice(-4).map(({analyser,bins,...rest})=>rest)}));await sleep(10);}}
const activeType=type=>[...activeSources].some(s=>s.type===type);
async function runCase(name,avatar,text,{scale=1,action,expectedVoice=true}={}){
  globalThis.avatarProgress=name;
  settings.avatar=avatar;voiceScale=scale;settings.soundEffectsEnabled=true;
  const image=new Image();image.src=`/assets/avatars/${avatar}-sprites.png`;
  const imageStart=performance.now();await image.decode();const imageDecodeMs=performance.now()-imageStart;
  const index=sources.length,startedAt=performance.now();
  const pending=run({id:crypto.randomUUID(),platform:'test',user:'benchmark',displayName:name,text,previewVoice:true});
  if(action)await action();
  await pending;await sleep(180);
  const records=sources.slice(index);
  const voices=records.filter(s=>s.type==='voice'),effects=records.filter(s=>s.type==='effect');
  if(expectedVoice)check(voices.some(s=>s.mainOpenFrames>0),name+': la voz nunca abrió la boca principal');
  for(const record of voices){
    if(scale>0 && record.audibleFrames>3){
      check(record.mainOpenFrames>0,name+': boca principal bloqueada durante la voz');
      check(record.overlayOpenFrames>0,name+': overlay bloqueado durante la voz');
    }
  }
  for(const record of records){
    check(record.wrongMainFrames===0,name+': la boca principal habló durante un efecto o audio mudo');
    check(record.wrongOverlayFrames===0,name+': el overlay habló durante un efecto o audio mudo');
  }
  check(!$('#main-avatar').classList.contains('talking'),name+': la boca principal quedó abierta');
  check(!$('#overlay-avatar').classList.contains('talking'),name+': la boca del overlay quedó abierta');
  check(!$('#main-avatar').classList.contains('is-present'),name+': el avatar principal quedó visible al terminar');
  check(!$('#overlay-stage').classList.contains('is-present'),name+': el overlay quedó visible al terminar');
  check(pendingMouthFrames.size===0,name+': quedó un bucle de boca activo');
  const summaries=records.map(({analyser,bins,...rest})=>({...rest,
    mainResponseMs:rest.firstAudible!==undefined && rest.firstMainOpen!==undefined?Math.max(0,rest.firstMainOpen-rest.firstAudible):null,
    overlayResponseMs:rest.firstAudible!==undefined && rest.firstOverlayOpen!==undefined?Math.max(0,rest.firstOverlayOpen-rest.firstAudible):null,
  }));
  scenarios.push({name,avatar,imageDecodeMs,elapsedMs:performance.now()-startedAt,voiceSegments:voices.length,effectSegments:effects.length,sources:summaries});
}
try{
  const params=new URLSearchParams(location.search);
  const candidates=params.has('characters')?characterAvatars:params.has('countries')?countryAvatars:avatars;
  const selectedAvatars=params.has('quick')?candidates.slice(0,1):candidates;
  for(const avatar of selectedAvatars)await runCase('voz → efecto → voz: '+avatar.id,avatar.id,'hola {3} otra voz');
  await runCase('efectos consecutivos y retorno a voz','sock','hola {58}{45} otra voz');
  await runCase('solo efectos','male','{20}{3}',{expectedVoice:false});
  await runCase('voz baja después del efecto','female','hola {3} otra voz',{scale:.15});
  await runCase('audio de voz sin señal','cat-black','silencio',{scale:0,expectedVoice:false});
  await runCase('pausa y reanudación','chibi-ruby','hola {3} otra voz',{action:async()=>{
    await until(()=>activeType('voice'));await sleep(200);current.pausePlayback();await sleep(180);
    check(!$('#main-avatar').classList.contains('talking'),'pausa: boca principal abierta');
    check(!$('#overlay-avatar').classList.contains('talking'),'pausa: overlay abierto');
    current.pausePlayback();
  }});
  await runCase('desactivar efecto durante reproducción','chibi-black','hola {58} otra voz',{action:async()=>{
    await until(()=>activeType('effect'));await sleep(100);settings.soundEffectsEnabled=false;current.skipSound?.();
  }});
  await runCase('cancelación durante efecto','cat-calvo','hola {58} otra voz',{action:async()=>{
    await until(()=>activeType('effect'));await sleep(100);stopCurrent();
  }});
  await runCase('voz después de cancelar un efecto','cat-calvo','siguiente mensaje');
  await sleep(250);sampling=false;
  check(offAudioMainFrames===0,'la boca principal se movió fuera del audio');
  check(offAudioOverlayFrames===0,'el overlay se movió fuera del audio');
  check(maxMouthLoops<=1,'se acumularon varios bucles de animación de boca');
  const stats=values=>{const v=[...values].sort((a,b)=>a-b);return {samples:v.length,p50Ms:v[Math.floor(v.length*.5)]||0,p95Ms:v[Math.floor(v.length*.95)]||0,maxMs:v.at(-1)||0};};
  const response=scenarios.flatMap(s=>s.sources).filter(s=>s.type==='voice' && s.mainResponseMs!==null);
  globalThis.avatarResult={measuredAt:new Date().toISOString(),scope:'Chrome headless, Web Audio real, voz local y efectos procedurales y MP3 incluidos; salida de audio silenciada. Reproductor extraído de app.js y overlay.js real; sin Fish ni OBS real.',
    failures,avatarsTested:selectedAvatars.length,scenarios,animationWork:stats(frameWork),frameIntervals:stats(frameIntervals),
    mainResponse:stats(response.map(s=>s.mainResponseMs)),overlayResponse:stats(response.filter(s=>s.overlayResponseMs!==null).map(s=>s.overlayResponseMs)),
    longTasks,offAudioMainFrames,offAudioOverlayFrames,maxMouthLoops,pendingMouthFrames:pendingMouthFrames.size,
    audioSampleRate:audioContext.sampleRate,userAgent:navigator.userAgent};
  $('#results').textContent=JSON.stringify(globalThis.avatarResult,null,2);
  await audioContext.close();
}catch(error){stopCurrent();globalThis.avatarError=error.stack;$('#results').textContent=error.stack;}
