import test from 'node:test';
import assert from 'node:assert/strict';
import {speechText,speechSegments} from '../public/speech-text.js';
import {streamPronunciations,phraseSoundTriggers,expressionSpeech} from '../public/chat-reactions.js';
import {countChatWords} from '../public/chat-limit.js';
import {MAX_SOUND_EFFECTS} from '../public/sound-effects.js';

test('requested pronunciation spellings are exact, including the accented qliá distinction',()=>{
 const requested={ctm:'conchetumadre','la pqtp':'la pucta que te parió',csm:'chesumare',ptm:'puctamare',alv:'a la velga',LPMQLP:'La pucta madre que lo parió',mrd:'mielda',wn:'hueón',qlia:'culiá','qliá':'culiao',xuxa:'chucha',puxa:'pucha',sexo:'setzo',sxo:'setzo',wea:'hueá',mmgv:'mamahuevo'};
 for(const [input,output] of Object.entries(requested))assert.equal(speechText(input),output+'.',input);
 for(const [input,output] of Object.entries(streamPronunciations))assert.equal(speechText(input.toUpperCase()),output+'.',input);
 assert.equal(speechText('hola q tal k haces K 10k'), 'hola que tal que haces K 10k.');
 assert.equal(speechText('ctm sexo k',false),'ctm sexo k.');
});
test('pronunciations and endings preserve full words, URLs, emails and original input',()=>{
 const input='https://ejm.com/ctm/sexo/peruano www.ejm.com/peruano ctm@sexo.com ctm123 sexualidad alumnado peruanos';
 assert.equal(speechText(input),input+'.');
 assert.deepEqual(speechSegments(input),[{type:'speech',text:input+'.'}]);
 assert.equal(speechText('Soy peruano.'),'Soy peruano hermoso.');
 assert.equal(speechText('Soy peruano! Tú también.'),'Soy peruano hermoso! Tú también.');
 assert.equal(speechText('Soy peruano y vivo aquí.'),'Soy peruano y vivo aquí.');
 assert.equal(speechText('Soy peruano hermoso.'),'Soy peruano hermoso.');
 assert.deepEqual(speechSegments('Soy peruano {20} y sigo aquí').filter(s=>s.type==='speech'),[{type:'speech',text:'Soy peruano.'},{type:'speech',text:'y sigo aquí.'}]);
 assert.equal(speechSegments('Soy peruano',{reactions:false})[0].text,'Soy peruano.');
});
test('laughs use the selected voice with Fish-only direction tags and bounded length',()=>{
 for(const [input,expression] of [['jaja','chuckle'],['jajaja','laugh'],['JAJAJAJA','laugh'],['muajaja','evilLaugh'],['muajajaja','evilLaugh']]) {
  const [segment]=speechSegments(input);assert.equal(segment.expression,expression);
  assert.match(expressionSpeech(segment,'fish'),/^\[(?:chuckling|laughing|evil laughing)\] /);
  assert.equal(expressionSpeech(segment,'edge'),segment.text);
  assert.doesNotMatch(segment.text,/\[/);
 }
 assert.equal(speechSegments('jaja'.repeat(500))[0].text.split(',').length,6);
 assert.deepEqual(speechSegments('jajaland muajajaland'),[{type:'speech',text:'jajaland muajajaland.'}]);
 const s=speechSegments('inicio jajaja después muajajaja fin');
 assert.deepEqual(s.map(s=>s.expression||s.text),['inicio.','laugh','después.','evilLaugh','fin.']);
 assert.deepEqual(speechSegments('jajaja',{reactions:false}),[{type:'speech',text:'jajaja.'}]);
});
test('automatic phrases use sound segments in message order and respect both toggles',()=>{
 for(const {phrase,id} of phraseSoundTriggers) {
  assert.deepEqual(speechSegments('antes '+phrase+' después'),[{type:'speech',text:'antes.'},{type:'sound',id},{type:'speech',text:'después.'}]);
  assert.ok(!speechSegments(phrase,{sounds:false}).some(s=>s.type==='sound'));
  assert.ok(!speechSegments(phrase,{reactions:false}).some(s=>s.type==='sound'));
 }
 // Sin clips incluidos, las frases se leen como texto normal.
 assert.deepEqual(speechSegments('smuack mua'),[{type:'speech',text:'smuack mua.'}]);
 assert.deepEqual(speechSegments('https://ejm.com/mua mua@beso.com hay una mujercita'),[{type:'speech',text:'https://ejm.com/mua mua@beso.com hay una mujercita.'}]);
 assert.deepEqual(speechSegments('mua',{reactions:false}),[{type:'speech',text:'mua.'}]);
});
test('reactions share the existing spam limit, word limit and speech character budget',()=>{
 const s=speechSegments(('jajaja mua {20} ').repeat(30));
 assert.ok(s.filter(s=>s.type==='sound'||s.expression).length<=MAX_SOUND_EFFECTS);
 assert.ok(s.reduce((n,s)=>n+(s.type==='sound'?1:countChatWords(s.text)),0)<=55);
 assert.ok(s.filter(s=>s.type==='speech').reduce((n,s)=>n+s.text.length,0)<=650);
 const limited=speechSegments('uno '.repeat(54)+'{20} fuera');
 assert.equal(limited.at(-1).id,20);
 assert.ok(!limited.some(s=>s.text?.includes('fuera')));
});

test('speaker names do not trigger kisses, memes or laughter',()=>{
 const s=speechSegments('hola {20}',{speaker:'mua jajaja hay una mujer'});
 assert.deepEqual(s,[{type:'speech',text:'mua jajaja hay una mujer dice: hola.'},{type:'sound',id:20}]);
 assert.ok(speechSegments('hola',{speaker:'{20}'}).every(s=>s.type==='speech'));
});
