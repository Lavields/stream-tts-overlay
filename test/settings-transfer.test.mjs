import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsTransfer,parseSettingsTransfer} from '../public/settings-transfer.js';
import {createRequire} from 'node:module';
const {portCandidates}=createRequire(import.meta.url)('../desktop/port-policy.cjs');

test('los ajustes se trasladan únicamente para la misma cuenta y omiten claves ajenas',()=>{
 const payload=createSettingsTransfer('usuario',{volume:42,appearance:{theme:'azul-hielo'},profiles:{},FISH_API_KEY:'secret'});
 assert.deepEqual(parseSettingsTransfer(JSON.stringify(payload),'usuario'),{volume:42,appearance:{theme:'azul-hielo'},profiles:{}});
 assert.throws(()=>parseSettingsTransfer(JSON.stringify(payload),'otra'),/otra cuenta/);
 assert.throws(()=>parseSettingsTransfer('x'.repeat(1024*1024+1),'usuario'),/1 MB/);
 assert.throws(()=>parseSettingsTransfer(JSON.stringify({...payload,settings:{profiles:{x:null}}}),'usuario'),/perfiles/i);
});
test('un puerto guardado no cambia aunque existan alternativas',()=>{
 assert.deepEqual(portCandidates(4317,true,[4317,4319],true),[4317]);
 assert.throws(()=>portCandidates(NaN,true,[4317],true),/puerto anterior/);
 assert.deepEqual(portCandidates(undefined,false,[4317,4319],true),[4317,4319]);
 assert.deepEqual(portCandidates(4318,true,[4318,4350],false),[4318,4350]);
});
