import test from 'node:test';
import assert from 'node:assert/strict';
import {countChatWords,limitChatWords} from '../public/chat-limit.js';
import {speechSegments} from '../public/speech-text.js';
test('55 palabras sin contar puntuación, códigos adyacentes cuentan una palabra',()=>{
 assert.equal(countChatWords('Hola, !!! ¿qué? tal... {58}{45}'),5);
 const text=Array.from({length:60},(_,i)=>'palabra'+i).join(', ');const limited=limitChatWords(text);assert.equal(countChatWords(limited),55);assert.ok(!limited.includes('palabra55'));
 assert.equal(countChatWords(limitChatWords('uno '.repeat(54)+'{58}final')),55);
 assert.ok(limitChatWords('uno '.repeat(54)+'{58}final').endsWith('{58}'));
});
test('expansiones y efectos respetan el presupuesto total hablado',()=>{
 const s=speechSegments('tqm '.repeat(54)+'{58} último');const count=s.reduce((n,s)=>n+(s.type==='sound'?1:countChatWords(s.text)),0);assert.ok(count<=55);assert.ok(!s.some(s=>s.text?.includes('último')));
});

test('formatted codes count once and are not split at the 55 word boundary',()=>{
 for (const code of ['{ 58 }','{\u200b20\u200b}','｛１２｝']) {
  assert.equal(countChatWords(code),1);
  const input='uno '.repeat(54)+code+' fuera';
  assert.equal(limitChatWords(input),'uno '.repeat(54)+code);
  assert.deepEqual(speechSegments(input).at(-1),{type:'sound',id:code.includes('58')?58:code.includes('20')?20:12});
 }
 assert.equal(speechSegments('{ 58 }'.repeat(30)).filter(s=>s.type==='sound').length,6);
});
