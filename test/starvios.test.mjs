import test from 'node:test';
import assert from 'node:assert/strict';
import {connectStarvios,starviosMessage} from '../starvios.mjs';
import {channelName} from '../lib.mjs';
const config={url:'https://example.supabase.co',key:'public-test'};
const row=(id,body='hola')=>({id,user_id:'uid',body,created_at:'2026-10-15T10:00:00Z',profiles:{username:'ana',display_name:'Ana'}});
test('Starvios normaliza perfiles y rechaza URLs ajenas',()=>{
 assert.equal(channelName('https://starvios.com/@Tortugod','starvios'),'tortugod');
 assert.throws(()=>channelName('https://other.test/tortugod','starvios'));
 assert.deepEqual(starviosMessage(row('a')),{id:'a',user:'ana',displayName:'Ana',text:'hola'});
 assert.equal(starviosMessage({...row('a'),is_deleted:true}),null);
 assert.equal(starviosMessage(row('a',' ')),null);
});
test('Starvios omite historial, deduplica, filtra borrados y detiene consultas',async()=>{
 const messages=[],states=[],c={channel:'test'},requests=[];let chatCalls=0;
 const fetcher=async(url,options)=>{
  requests.push(url);assert.equal(options.headers.apikey,'public-test');
  const path=new URL(url).pathname;
  const data=path.endsWith('/profiles')?[{id:'profile'}]:path.endsWith('/live_streams')?[{id:'stream',status:'live'}]:++chatCalls===1?[row('old')]:[row('old'),row('new'),{...row('deleted'),is_deleted:true}];
  return {ok:true,json:async()=>data};
 };
 try{
  await connectStarvios(c,{config,fetcher,pollMs:5,onMessage:m=>messages.push(m),onStatus:s=>states.push(s)});
  await new Promise(resolve=>setTimeout(resolve,35));
  assert.deepEqual(messages.map(m=>m.id),['new']);assert.ok(states.includes('connected'));
  await c.stop();const count=requests.length;
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(requests.length,count);
 }finally{await c.stop?.();}
});
test('Starvios informa cuando el canal no está en directo',async()=>{
 const c={channel:'test'};let calls=0;
 await assert.rejects(connectStarvios(c,{config,fetcher:async()=>({ok:true,json:async()=>++calls===1?[{id:'profile'}]:[]})}),/no está en directo/);
 await c.stop();
});
