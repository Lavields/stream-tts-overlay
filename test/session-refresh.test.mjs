import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const controlPort=14651,port=14652,base=`http://127.0.0.1:${port}`;
const account={username:'tester',active:true,channels:null,avatars:null,voices:null};
let control,child,cookie,mode='ok',meCalls=0,meDelay=0;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function handler(req,res){
  res.setHeader('Content-Type','application/json');
  if(req.url==='/v1/login')return res.end(JSON.stringify({token:'a'.repeat(64),account}));
  if(req.url==='/v1/me'){
    meCalls++;
    if(mode==='error'){res.statusCode=500;return res.end('{"error":"fallo interno"}');}
    if(mode==='html'){return res.end('<html>puerta de enlace</html>');}
    if(mode==='revoked'){res.statusCode=401;return res.end('{"error":"La sesión no está activa."}');}
    return setTimeout(()=>res.end(JSON.stringify(account)),meDelay);
  }
  res.end('{"ready":true}');
}
const startControl=async()=>{control=http.createServer(handler);control.listen(controlPort,'127.0.0.1');await once(control,'listening');};
const stopControl=async()=>{control.closeAllConnections();const closed=once(control,'close');control.close();await closed;};
const me=async()=>(await fetch(base+'/api/auth/me',{headers:{Cookie:cookie}})).status;

test.before(async()=>{
  await startControl();
  child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),STREAMVOICE_REMOTE_AUTH:'1',STREAMVOICE_CONTROL_URL:`http://127.0.0.1:${controlPort}`,STREAMVOICE_AUTH_REFRESH_MS:'50'},stdio:['ignore','pipe','inherit']});
  await once(child.stdout,'data');
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'tester',password:'prueba-local-123'})});
  assert.equal(login.status,200);
  cookie=login.headers.get('set-cookie').split(';')[0];
});
test.after(async()=>{child?.kill('SIGTERM');if(child&&child.exitCode===null)await once(child,'exit');if(control.listening)await stopControl();});

test('los fallos temporales del servicio no cierran la sesión; una revocación real sí',async()=>{
  assert.equal(await me(),200);
  await stopControl();await wait(80);
  assert.equal(await me(),200,'servicio caído');
  await startControl();await wait(80);
  assert.equal(await me(),200,'servicio recuperado');
  for(const failure of ['error','html']){mode=failure;await wait(80);assert.equal(await me(),200,failure);}
  mode='ok';await wait(80);

  meDelay=150;meCalls=0;
  assert.deepEqual(await Promise.all([me(),me(),me(),me()]),[200,200,200,200]);
  assert.equal(meCalls,1,'las solicitudes simultáneas comparten una verificación');
  meDelay=0;

  mode='revoked';await wait(80);
  assert.equal(await me(),401);
  mode='ok';await wait(80);
  assert.equal(await me(),401,'la sesión revocada no vuelve aunque el servicio responda bien');
});
