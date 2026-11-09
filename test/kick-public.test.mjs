import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {connectKickPublic,kickMessage} from '../kick-public.mjs';

class Socket extends EventEmitter {
  static instances=[];
  constructor(url){super();this.url=url;this.readyState=1;this.sent=[];Socket.instances.push(this);}
  send(raw){this.sent.push(JSON.parse(raw));}
  close(){this.readyState=3;this.emit('close');}
  packet(event,data,channel='chatrooms.22.v2'){this.emit('message',Buffer.from(JSON.stringify({event,data:JSON.stringify(data),channel})));}
}
const fetcher=async(url,options)=>({ok:true,json:async()=>String(url).includes('/api/v2/channels/')?{id:11,chatroom:{id:22}}:{data:{mode:'websocket',connections:[{provider:'pusher',credentials:{app_key:'publicKey',cluster:'us2'}}]}}});
test('Kick público consulta configuración anónima y confirma la suscripción antes de indicar conectado',async()=>{
 const c={channel:'streamer1'},states=[],requests=[];
 try{
  await connectKickPublic(c,{Socket,onStatus:(state)=>states.push(state),fetcher:async(url,options)=>{requests.push({url,options});return fetcher(url,options);}});
  const ws=Socket.instances.at(-1);assert.match(ws.url,/^wss:\/\/ws-us2\.pusher\.com\/app\/publicKey\?/);
  assert.deepEqual(states,['connecting']);
  ws.packet('pusher:connection_established',{socket_id:'1.2'});
  assert.deepEqual(ws.sent[0],{event:'pusher:subscribe',data:{auth:'',channel:'chatrooms.22.v2'}});
  ws.packet('pusher_internal:subscription_succeeded',{});assert.equal(states.at(-1),'connected');
  const options=requests[1].options;assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);
  assert.equal(JSON.parse(options.body).client.type,'web');
 }finally{await c.stop();}
});
test('Kick público conserva identidad y entrega borrados y moderación del canal correcto',async()=>{
 const c={channel:'test'},messages=[],deleted=[],purged=[];
 try{
  await connectKickPublic(c,{Socket,fetcher,onMessage:m=>messages.push(m),onDelete:id=>deleted.push(id),onPurge:user=>purged.push(user)});
  const ws=Socket.instances.at(-1),data={id:'same-id',sender:{username:'Ana'},content:'¿Cómo estás? {20}'};
  ws.packet('App\\Events\\ChatMessageEvent',data,'chatrooms.other.v2');
  ws.packet('App\\Events\\ChatMessageEvent',data);
  ws.emit('message',Buffer.from('{broken'));
  ws.packet('App\\Events\\MessageDeletedEvent',{message:{id:'same-id'}});
  ws.packet('App\\Events\\UserBannedEvent',{user:{username:'Ana'}});
  ws.packet('App\\Events\\ChatroomClearEvent',{});
  assert.deepEqual(messages,[{id:'same-id',user:'Ana',displayName:'Ana',text:'¿Cómo estás? {20}'}]);
  assert.deepEqual(deleted,['same-id']);assert.deepEqual(purged,['Ana',undefined]);
  await c.stop();ws.packet('App\\Events\\ChatMessageEvent',data);assert.equal(messages.length,1);
 }finally{await c.stop();}
});
test('Kick público no inventa mensajes incompletos',()=>{
 assert.equal(kickMessage({id:'1',content:'hola'}),null);
 assert.equal(kickMessage({sender:{username:'ana'},content:'hola'}),null);
});
test('Kick público recupera una caída y cancela reconexiones al desconectar',async()=>{
 const c={channel:'test'};let calls=0;
 try{
  await connectKickPublic(c,{Socket,fetcher:async(...args)=>{calls++;return fetcher(...args);},retryMs:5});
  Socket.instances.at(-1).close();await new Promise(resolve=>setTimeout(resolve,30));assert.ok(calls>=4);
  await c.stop();const count=calls;await new Promise(resolve=>setTimeout(resolve,30));assert.equal(calls,count);
 }finally{await c.stop();}
});
test('Kick público rechaza configuración ajena y cancela consultas pendientes',async()=>{
 const c={channel:'test'},states=[],count=Socket.instances.length;
 await connectKickPublic(c,{Socket,fetcher:async()=>({ok:false,status:403}),onStatus:(s,d)=>states.push([s,d])});
 assert.equal(Socket.instances.length,count);assert.equal(states.at(-1)[0],'reconnecting');assert.match(states.at(-1)[1],/HTTP 403/);
 await c.stop();
});
