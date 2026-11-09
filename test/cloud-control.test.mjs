import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import worker from '../control/cloud/worker.mjs';
import { createRemoteAuth } from '../remote-auth.mjs';

test('servicio de nube administra usuarios y revoca sesiones ante cambios',async()=>{
  const sql=new DatabaseSync(':memory:');
  sql.exec(await readFile(new URL('../control/cloud/schema.sql',import.meta.url),'utf8'));
  const DB={prepare(query){return {bind(...args){const stmt=sql.prepare(query);return {
    async first(){return stmt.get(...args)||null;},
    async all(){return {results:stmt.all(...args)};},
    async run(){return stmt.run(...args);},
  };}};}};
  const env={DB,BOOTSTRAP_TOKEN:'test-private-bootstrap'};
  async function request(path,{method='GET',data,token,bootstrap}={}){
    const headers={}; if(data!==undefined)headers['content-type']='application/json';if(token)headers.authorization='Bearer '+token;if(bootstrap)headers['x-bootstrap-token']=bootstrap;
    return worker.fetch(new Request('https://test.invalid'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env);
  }
  try{
    assert.equal((await request('/v1/bootstrap',{method:'POST',data:{password:'administrator-password'}})).status,403);
    assert.equal((await request('/v1/bootstrap',{method:'POST',bootstrap:env.BOOTSTRAP_TOKEN,data:{password:'administrator-password'}})).status,201);
    assert.equal((await request('/v1/bootstrap',{method:'POST',bootstrap:env.BOOTSTRAP_TOKEN,data:{password:'new-password'}})).status,409);
    let r=await request('/v1/login',{method:'POST',data:{username:'admin',password:'administrator-password'}});assert.equal(r.status,200);const admin=(await r.json()).token;
    const friend={username:'amiga',password:'friend-password',active:true,channels:{twitch:['mi_canal']},avatars:['sock'],voices:['edge:es-CL-CatalinaNeural']};
    assert.equal((await request('/v1/admin/users',{method:'POST',token:admin,data:friend})).status,201);
    r=await request('/v1/login',{method:'POST',data:{username:'amiga',password:'friend-password'}});assert.equal(r.status,200);const token=(await r.json()).token;
    assert.equal((await request('/v1/admin/users',{token})).status,403);
    assert.equal((await request('/v1/me',{token})).status,200);
    const oldFetch=globalThis.fetch, oldUrl=process.env.STREAMVOICE_CLOUD_CONTROL_URL;
    try {
      process.env.STREAMVOICE_CLOUD_CONTROL_URL='https://control.streamvoice.workers.dev';
      globalThis.fetch=async (url,options)=>worker.fetch(new Request(url,options),env);
      const auth=await createRemoteAuth();
      assert.deepEqual(await auth.status(),{remote:true,owner:false,cloud:true,configured:true,needsSetup:false});
      let cookie;const res={setHeader(name,value){if(name==='Set-Cookie')cookie=value.split(';')[0];}};
      await auth.login({},res,{username:'amiga',password:'friend-password'});
      assert.equal(auth.session({headers:{cookie}}),'amiga');
      assert.equal(auth.allowedChannel('amiga','twitch','mi_canal'),true);
      await assert.rejects(auth.configure('https://wrong.example'),/configura/);
    } finally {globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.STREAMVOICE_CLOUD_CONTROL_URL;else process.env.STREAMVOICE_CLOUD_CONTROL_URL=oldUrl;}
    assert.equal((await request('/v1/admin/user',{method:'POST',token:admin,data:{...friend,password:'',active:false}})).status,200);
    assert.equal((await request('/v1/me',{token})).status,401);
    assert.equal((await request('/v1/login',{method:'POST',data:{username:'amiga',password:'friend-password'}})).status,401);
    assert.equal((await request('/v1/admin/user',{method:'POST',token:admin,data:{...friend,username:'admin'}})).status,403);
    for(let i=0;i<8;i++) assert.equal((await request('/v1/login',{method:'POST',data:{username:'inexistente',password:'wrong'}})).status,401);
    assert.equal((await request('/v1/login',{method:'POST',data:{username:'inexistente',password:'wrong'}})).status,429);
    assert.equal((await request('/v1/admin/users',{method:'POST',token:admin,data:{...friend,username:'otro',voices:['edge:inventada']}})).status,400);
  } finally {sql.close();}
});
