import {authFixture} from './auth-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocketServer} from 'ws';

const port=14641,ircPort=14642,base=`http://127.0.0.1:${port}`;
const sockets=[],received=[],events=[];
let child,fixture,irc,cookie,stream;
const until=async(check,label,ms=6000)=>{const end=Date.now()+ms;while(Date.now()<end){const value=check();if(value)return value;await new Promise(r=>setTimeout(r,20));}throw Error('Tiempo agotado: '+label);};
const send=line=>sockets.at(-1).send(line+'\r\n');
const chat=(id,text)=>send(`@id=${id};user-id=2;room-id=777 :ana!ana@ana.tmi.twitch.tv PRIVMSG #canal :${text}`);
const state=()=>events.filter(e=>e.type==='connections').at(-1)?.data.find(c=>c.channel==='canal')?.state;
const ofType=type=>events.filter(e=>e.type===type);

test.before(async()=>{
  fixture=await authFixture();
  irc=new WebSocketServer({port:ircPort,host:'127.0.0.1'});
  irc.on('connection',socket=>{sockets.push(socket);socket.on('message',data=>{const line=data.toString();received.push(line);if(line.startsWith('JOIN'))socket.send('@room-id=777 :tmi.twitch.tv ROOMSTATE #canal\r\n');});});
  child=spawn(process.execPath,['--import','./test/fixtures/twitch-ws.mjs','server.mjs'],{env:{...process.env,PORT:String(port),AUTH_ACCOUNTS_FILE:fixture.path,TEST_TWITCH_IRC:`ws://127.0.0.1:${ircPort}`,TWITCH_OAUTH_TOKEN:'',TWITCH_USERNAME:''},stdio:['ignore','pipe','inherit']});
  await once(child.stdout,'data');
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'test-password'})});
  cookie=login.headers.get('set-cookie').split(';')[0];
  stream=new AbortController();
  const response=await fetch(base+'/api/events',{headers:{Cookie:cookie},signal:stream.signal});
  (async()=>{let buffer='';for await(const chunk of response.body.pipeThrough(new TextDecoderStream())){buffer+=chunk;const parts=buffer.split('\n\n');buffer=parts.pop();for(const part of parts){const type=part.match(/^event: (.+)$/m)?.[1],data=part.match(/^data: (.+)$/m)?.[1];if(type)events.push({type,data:JSON.parse(data)});}}})().catch(()=>{});
});
test.after(async()=>{stream?.abort();child?.kill('SIGTERM');if(child&&child.exitCode===null)await once(child,'exit');for(const socket of sockets)socket.terminate();await new Promise(r=>irc.close(r));await fixture.cleanup();});

test('un espectador no puede cortar la conexión ni vaciar la cola; los comandos reales sí actúan',async()=>{
  const response=await fetch(base+'/api/connect',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({platform:'twitch',channel:'canal'})});
  assert.equal(response.status,200);
  await until(()=>state()==='connected','conexión inicial');

  const hostile=['Login authentication failed','msg_channel_suspended','hola RECONNECT','x CLEARCHAT #canal','x CLEARCHAT #canal :pepe'];
  hostile.forEach((text,i)=>chat('m'+i,text));
  chat('fin','fin');
  await until(()=>ofType('chat').some(e=>e.data.text==='fin'),'mensaje final');
  await new Promise(r=>setTimeout(r,300));
  assert.deepEqual(ofType('chat').map(e=>e.data.text),[...hostile,'fin']);
  assert.equal(state(),'connected');
  assert.equal(sockets.length,1);
  assert.equal(ofType('purge').length,0);

  send('PING :tmi.twitch.tv');
  await until(()=>received.includes('PONG :tmi.twitch.tv'),'respuesta PONG');
  send('@login=ana;target-msg-id=abc :tmi.twitch.tv CLEARMSG #canal :hola');
  await until(()=>ofType('delete').some(e=>e.data.id.endsWith(':abc')),'borrado de mensaje');
  send('@target-user-id=2 :tmi.twitch.tv CLEARCHAT #canal :ana');
  await until(()=>ofType('purge').some(e=>e.data.user==='ana'),'purga de usuario');

  send(':tmi.twitch.tv RECONNECT');
  await until(()=>sockets.length===2,'reconexión real');
  await until(()=>state()==='connected','conectado tras reconexión');
  send(':tmi.twitch.tv NOTICE * :Login authentication failed');
  await until(()=>state()==='error','rechazo real');
  await new Promise(r=>setTimeout(r,2500));
  assert.equal(sockets.length,2,'un rechazo real no debe reintentar');
});
