import test from 'node:test';
import assert from 'node:assert/strict';
import { speechText, speechSegments, describeEmojiText } from '../public/speech-text.js';
import { soundEffects, createSoundBuffer, MAX_SOUND_EFFECTS } from '../public/sound-effects.js';

test('chat shorthand and the requested emoticons are spoken without altering ordinary words', () => {
  assert.equal(speechText('xq tmbn ntp tqm q bn'), 'porque también no te preocupes te quiero mucho que bien.');
  assert.equal(speechText('XD xd xDD =P :p'), 'cara cagándose de la risa cara cagándose de la risa cara cagándose de la risa hueón sacando la lengua hueón sacando la lengua.');
  assert.equal(speechText('NextDoor CM GB TB'), 'NextDoor centímetro gigabyte terabyte.');
});
test('Spanish labels describe faces, animals, flags and combined emoji as whole graphemes', () => {
  assert.equal(speechText('😀 😊 🐧 👨‍🦲 👨🏽‍🦲'), 'cara feliz cara sonriendo pingüino emoji de un hombre pelado emoji de un hombre pelado.');
  for (const emoji of ['🐶','🐈','🐘','🦊','🐳','🐢','🇨🇱','👩🏽‍💻','👨‍👩‍👦','❤️']) {
    const label = describeEmojiText(emoji);
    assert.ok(label.length > 1 && label !== 'emoji', emoji);
    assert.doesNotMatch(label, /[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d]/u);
  }
  assert.equal(speechText('XD 🐧',true,650,false), 'XD 🐧.');
});
test('emoji and sound transformations preserve links, emails, word boundaries and original input', () => {
  const input = 'https://ejm.com/XD/{58}/🐧 a@cm.com XD';
  const before = input;
  assert.deepEqual(speechSegments(input), [{type:'speech',text:'https://ejm.com/XD/{58}/🐧 a@cm.com cara cagándose de la risa.'}]);
  assert.equal(input, before);
});
test('the example produces text, falling sound, text, heartbeat in exactly that order', () => {
  assert.deepEqual(speechSegments('Máximo se cayó de un puente {58} y despertó en una cama de hospital{45}'), [
    {type:'speech',text:'Máximo se cayó de un puente.'}, {type:'sound',id:58},
    {type:'speech',text:'y despertó en una cama de hospital.'}, {type:'sound',id:45},
  ]);
  assert.deepEqual(speechSegments('{45}{58}!!'), [{type:'sound',id:45},{type:'sound',id:58}]);
});
test('disabled, unknown and excessive effects do not add voice requests or spoken codes', () => {
  assert.deepEqual(speechSegments('Hola{58}adiós{45}', {sounds:false}), [{type:'speech',text:'Hola adiós.'}]);
  assert.deepEqual(speechSegments('Hola {999} chat {123456}'), [{type:'speech',text:'Hola chat.'}]);
  const segments = speechSegments('{45}'.repeat(40)+' final');
  assert.equal(segments.filter(s=>s.type==='sound').length, MAX_SOUND_EFFECTS);
  assert.deepEqual(segments.at(-1), {type:'speech',text:'final.'});
  const expanded = speechSegments(('🐧 '.repeat(200))+'{58}'+('CM '.repeat(100)));
  assert.ok(expanded.filter(s=>s.type==='speech').reduce((n,s)=>n+s.text.length,0)<=650);
});
test('every procedural sound is finite, quiet at its boundaries, bounded and small in memory', () => {
  const context = { createBuffer(channels,length,sampleRate) {
    const data = new Float32Array(length);
    return { length, sampleRate, duration:length/sampleRate, numberOfChannels:channels, getChannelData:()=>data };
  }};
  assert.equal(new Set(soundEffects.map(s=>s.id)).size, soundEffects.length);
  for (const effect of soundEffects) {
    if (effect.fileOnly) continue;
    const buffer = createSoundBuffer(context,effect.id), samples=buffer.getChannelData(0);
    let peak=0;
    for (const sample of samples) { assert.ok(Number.isFinite(sample)); peak=Math.max(peak,Math.abs(sample)); }
    assert.ok(peak>0 && peak<=.701, effect.name);
    assert.ok(Math.abs(samples[0])<.001 && Math.abs(samples.at(-1))<.001, effect.name);
    assert.ok(samples.byteLength<250_000, effect.name);
  }
  assert.throws(()=>createSoundBuffer(context,999), /no disponible/);
});

test('imported audio preserves file metadata and enforces duration and size before storing', async () => {
  const { validateSoundFile, MAX_SOUND_BYTES } = await import('../public/sound-files.js');
  const file = new File([new Uint8Array([1,2,3])], 'yunque-original.wav', {type:'audio/wav'});
  const context = {decodeAudioData:async bytes => {assert.equal(bytes.byteLength,3);return {duration:1.75};}};
  const metadata = await validateSoundFile(context,15,file);
  assert.equal(metadata.id,15);
  assert.equal(metadata.name,'yunque-original.wav');
  assert.equal(metadata.duration,1.75);
  assert.equal(metadata.size,3);
  assert.equal(metadata.type,'audio/wav');
  let decoded = false;
  const noDecode = {decodeAudioData:async()=>{decoded=true;return {duration:1};}};
  await assert.rejects(validateSoundFile(noDecode,15,{size:MAX_SOUND_BYTES+1}), /5 MB/);
  await assert.rejects(validateSoundFile(noDecode,15,{size:0}), /5 MB/);
  await assert.rejects(validateSoundFile(noDecode,999,file), /Código/);
  assert.equal(decoded,false);
  for (const duration of [0,11,Infinity,NaN])
    await assert.rejects(validateSoundFile({decodeAudioData:async()=>({duration})},15,file), /10 segundos/);
  await assert.rejects(validateSoundFile({decodeAudioData:async()=>{throw Error('bad codec');}},15,file), /MP3 o WAV/);
});
test('sound loading still works without storage when using synthesized effects and honors cancellation', async () => {
  const { loadSoundBuffer } = await import('../public/sound-files.js');
  const context={createBuffer(channels,length,sampleRate){const data=new Float32Array(length);return {duration:length/sampleRate,getChannelData:()=>data};}};
  const sound=await loadSoundBuffer(context,1,false);
  assert.ok(sound.duration>0);
  const abort=new AbortController();abort.abort();
  await assert.rejects(loadSoundBuffer(context,15,false,abort.signal),{name:'AbortError'});
  await assert.rejects(loadSoundBuffer(context,999,false),/Código/);
});

test('all catalog codes survive spaces, pasted invisible characters and full-width keyboards', () => {
  for (const {id} of soundEffects) {
    const wide=String(id).replace(/\d/g,d=>String.fromCharCode(0xFF10+Number(d)));
    for (const code of [`{${id}}`,`{ ${id} }`,`{\u00a0${id}\u00a0}`,`{\u200b${id}\uFEFF}`,`｛${wide}｝`]) {
      assert.deepEqual(speechSegments(`inicio ${code} final`),[
        {type:'speech',text:'inicio.'},{type:'sound',id},{type:'speech',text:'final.'}
      ],code);
      assert.deepEqual(speechSegments(code,{sounds:false}),[],code);
    }
  }
  assert.deepEqual(speechSegments('Tengo 58 puntos y 200 monedas.'),[{type:'speech',text:'Tengo 58 puntos y 200 monedas.'}]);
  assert.deepEqual(speechSegments('{ 999 } ｛９９９｝'),[]);
  assert.deepEqual(speechSegments('https://ejm.com/{58} a@cm.com'),[{type:'speech',text:'https://ejm.com/{58} a@cm.com.'}]);
});

test('the reported Mac message keeps the accent and plays effect 20 without speaking its number', () => {
 assert.deepEqual(speechSegments('Hola como estás {20} '),[
  {type:'speech',text:'Hola como estás.'},{type:'sound',id:20}
 ]);
 for(const text of ['¿Cómo estás? Sí, él tomó café y pidió más azúcar.','Mañana iré a Valparaíso. Tú también vendrás.']) {
  assert.equal(speechText(text.normalize('NFD')),text);
  assert.equal(speechText(text),text);
 }
 assert.equal(speechText('q\u0301'), 'q\u0301.');
});
