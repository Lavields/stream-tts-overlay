import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {VOICE_TAG_NAMES,countChatWords,limitChatWords} from '../public/chat-limit.js';
import {speechSegments} from '../public/speech-text.js';

test('all catalog aliases switch voices without consuming the spoken word budget',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../public/voice-catalog.json',import.meta.url)));
  assert.deepEqual([...catalog.requested.map(v=>v.tag)].sort(),[...VOICE_TAG_NAMES].sort());
  assert.equal(new Set(VOICE_TAG_NAMES).size,9);
  for(const tag of VOICE_TAG_NAMES){
    for(const code of [`{${tag}}`,`{ ${tag.toUpperCase()} }`,`｛\u200b${tag}\uFEFF｝`]){
      assert.equal(countChatWords(`${code} hola`),1,code);
      assert.deepEqual(speechSegments(`${code} hola`),[{type:'speech',text:'hola.',voiceTag:tag}]);
      const boundary=`${code} ${'uno '.repeat(55)}fuera`;
      assert.equal(countChatWords(limitChatWords(boundary)),55);
      assert.equal(speechSegments(boundary).reduce((n,s)=>n+countChatWords(s.text),0),55);
    }
  }
});

test('voice changes preserve speech and sounds in order and reset for the next message',()=>{
  assert.deepEqual(speechSegments('inicio {verity} hola {58} otra {chilena} final'),[
    {type:'speech',text:'inicio.'},
    {type:'speech',text:'hola.',voiceTag:'verity'},
    {type:'sound',id:58},
    {type:'speech',text:'otra.',voiceTag:'verity'},
    {type:'speech',text:'final.',voiceTag:'chilena'},
  ]);
  assert.deepEqual(speechSegments('siguiente mensaje'),[{type:'speech',text:'siguiente mensaje.'}]);
  assert.deepEqual(speechSegments('{verity}{chilena} hola'),[{type:'speech',text:'hola.',voiceTag:'chilena'}]);
  assert.deepEqual(speechSegments('https://example.com/{personaje}'),[{type:'speech',text:'https://example.com/{personaje}.'}]);
  assert.equal(speechSegments('{verity} jajaja')[0].voiceTag,'verity');
  assert.equal(speechSegments(VOICE_TAG_NAMES.map(tag=>`{${tag}} hola`).join(' ')).length,9);
});
