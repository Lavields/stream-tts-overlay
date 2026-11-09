import test from 'node:test';
import assert from 'node:assert/strict';
import {retryEdgeSpeech} from '../edge-tts.mjs';
test('Edge retries transient failures once, with the same operation',async()=>{
 let attempts=0;const bytes=Buffer.from('ID3audio');
 const result=await retryEdgeSpeech(async()=>{if(++attempts===1)throw Object.assign(Error('temporary'),{retryable:true});return bytes;});
 assert.equal(result,bytes);assert.equal(attempts,2);
 attempts=0;await assert.rejects(retryEdgeSpeech(async()=>{attempts++;throw Object.assign(Error('still unavailable'),{retryable:true});}),/unavailable/);assert.equal(attempts,2);
});
test('Edge does not retry configuration failures or cancelled requests',async()=>{
 let attempts=0;await assert.rejects(retryEdgeSpeech(async()=>{attempts++;throw Error('missing Python');}),/missing/);assert.equal(attempts,1);
 const abort=new AbortController();attempts=0;
 await assert.rejects(retryEdgeSpeech(async()=>{attempts++;abort.abort();throw Object.assign(Error('cancelled'),{retryable:true});},abort.signal),/cancelled/);assert.equal(attempts,1);
 const waiting=new AbortController();attempts=0;
 const pending=retryEdgeSpeech(async()=>{attempts++;setTimeout(()=>waiting.abort(),10);throw Object.assign(Error('temporary'),{retryable:true});},waiting.signal);
 await assert.rejects(pending,{name:'AbortError'});assert.equal(attempts,1);
});
