import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {authFixture} from './auth-fixture.mjs';
import {allowedChannel,allowedAvatar} from '../auth.mjs';
const base='http://127.0.0.1:14319';let child,fixture;
const post=(path,data,cookie='')=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
const login=async username=>{const r=await post('/api/auth/login',{username,password:'test-password'});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
test.before(async()=>{fixture=await authFixture();child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'14319',AUTH_ACCOUNTS_FILE:fixture.path,FISH_API_KEY:'',YOUTUBE_API_KEY:'',KICK_ACCESS_TOKEN:''},stdio:['ignore','pipe','pipe']});await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('No inició servidor de prueba')),5000).unref())]);});
test.after(async()=>{child?.kill('SIGTERM');await fixture?.cleanup();});
test('sin login no hay API; credenciales inválidas no crean sesión y hay protección de origen',async()=>{
 assert.equal((await fetch(base+'/api/config')).status,401);
 assert.equal((await post('/api/auth/login',{username:'streamer1',password:'incorrecta'})).status,401);
 assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:'{}'})).status,403);
 const r=await post('/api/auth/login',{username:'admin',password:'test-password'});assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);
});
test('políticas exactas de canales y avatares',()=>{
 assert.ok(allowedChannel('admin','youtube','anything'));
 for(const [p,c]of Object.entries({starvios:'streamer1',twitch:'streamer1',kick:'streamer1',tiktok:'streamer1'}))assert.ok(allowedChannel('streamer1',p,c));
 assert.ok(allowedChannel('streamer2','kick','streamer2'));assert.ok(allowedChannel('streamer2','tiktok','streamer2'));
 assert.equal(allowedChannel('streamer2','starvios','streamer1'),false);
 assert.equal(allowedChannel('streamer1','twitch','xqc'),false);
 assert.equal(allowedAvatar('streamer1','chibi-ruby'),false);assert.ok(allowedAvatar('streamer2','cat-black'));assert.equal(allowedAvatar('streamer2','chibi-black'),false);assert.equal(allowedAvatar('streamer2','cat-chile'),false);assert.ok(allowedAvatar('streamer1','cat-calvo'));
});
test('no se puede saltar permisos cambiando POST o URL de imagen',async()=>{
 const cookie=await login('streamer1');
 assert.equal((await post('/api/connect',{platform:'twitch',channel:'xqc'},cookie)).status,403);
 assert.equal((await post('/api/connect',{platform:'youtube',channel:'dQw4w9WgXcQ'},cookie)).status,403);
 assert.equal((await post('/api/overlay',{avatar:'cat-black',text:'no'},cookie)).status,403);
 assert.equal((await fetch(base+'/assets/avatars/chibi-black-sprites.png',{headers:{Cookie:cookie}})).status,403);
 assert.equal((await fetch(base+'/assets/avatars/cat-calvo-sprites.png',{headers:{Cookie:cookie}})).status,200);
});
test('claves, overlay, tokens de OBS y logout están aislados por cuenta',async()=>{
 const admin=await login('admin'),streamer1=await login('streamer1');
 await post('/api/settings',{FISH_API_KEY:'isolated-test-key'},admin);
 const w=await (await fetch(base+'/api/config',{headers:{Cookie:streamer1}})).json();assert.equal(w.configured.FISH_API_KEY,false);
 await post('/api/overlay',{avatar:'cat-chile',text:'Solo Streamer1',user:'Streamer1',speaking:true},streamer1);
 const meW=await (await fetch(base+'/api/auth/me',{headers:{Cookie:streamer1}})).json();const meA=await (await fetch(base+'/api/auth/me',{headers:{Cookie:admin}})).json();assert.notEqual(meW.overlayUrl,meA.overlayUrl);
 const ac=new AbortController();const s=await fetch(base+'/api/events',{headers:{Cookie:admin},signal:ac.signal});const reader=s.body.getReader();const first=new TextDecoder().decode((await reader.read()).value);assert.ok(!first.includes('Solo Streamer1'));ac.abort();
 const overlay=await fetch(base+meW.overlayUrl);assert.equal(overlay.status,200);const overlayCookie=overlay.headers.get('set-cookie').split(';')[0];
 assert.equal((await post('/api/settings',{FISH_API_KEY:'forged'},overlayCookie)).status,401);
 const oc=new AbortController();const os=await fetch(base+'/api/events?overlay=1',{headers:{Cookie:overlayCookie},signal:oc.signal});const or=os.body.getReader();const event=new TextDecoder().decode((await or.read()).value);assert.match(event,/Solo Streamer1/);assert.ok(!event.includes('event: connections'));oc.abort();
 await post('/api/auth/logout',{},streamer1);assert.equal((await fetch(base+'/api/config',{headers:{Cookie:streamer1}})).status,401);
});
test('los intentos de login se limitan y logout cierra la sesión SSE activa',async()=>{
 for(let i=0;i<8;i++)assert.equal((await post('/api/auth/login',{username:'missing-rate-test',password:'wrong'})).status,401);
 assert.equal((await post('/api/auth/login',{username:'missing-rate-test',password:'wrong'})).status,429);
 const cookie=await login('streamer2');const stream=await fetch(base+'/api/events',{headers:{Cookie:cookie}});const reader=stream.body.getReader();await reader.read();await post('/api/auth/logout',{},cookie);assert.equal((await reader.read()).done,true);
});
