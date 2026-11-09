import test from 'node:test';
import assert from 'node:assert/strict';
import {createTwitchFollowers} from '../twitch-followers.mjs';
const connection=()=>({channel:'canal',state:'connected',twitchRoomId:'777'});
const metadata={client_id:'client',user_id:'777',login:'canal',scopes:['moderator:read:followers'],expires_in:3600};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('OAuth validado, consultas con IDs y caché de 60 segundos para resultados verdaderos y falsos',async()=>{
  let now=0;const calls=[];
  const client=createTwitchFollowers({getToken:()=> 'oauth:test-token',now:()=>now,fetchImpl:async(url,options)=>{
    calls.push({url,options});return response(url.includes('validate')?metadata:{data:new URL(url).searchParams.get('user_id')==='123'?[{user_id:'123'}]:[]});
  }});
  assert.deepEqual(await client.follows(connection(),'123'),{follows:true});
  assert.deepEqual(await client.follows(connection(),'123'),{follows:true});
  assert.deepEqual(await client.follows(connection(),'456'),{follows:false});
  assert.deepEqual(await client.follows(connection(),'456'),{follows:false});
  assert.equal(calls.length,3);
  assert.equal(calls[0].options.headers.Authorization,'OAuth test-token');
  assert.equal(calls[1].options.headers['Client-Id'],'client');
  assert.equal(new URL(calls[1].url).searchParams.get('broadcaster_id'),'777');
  now=60_001;await client.follows(connection(),'123');assert.equal(calls.length,4);
});
test('no confunde ausencia de OAuth, scope o permiso del canal con no ser seguidor',async()=>{
  const missing=createTwitchFollowers({getToken:()=>'',fetchImpl:()=>{throw Error('No debe consultar');}});
  assert.equal((await missing.status()).ready,false);await assert.rejects(missing.follows(connection(),'123'),/OAuth/);
  let calls=0;
  const scope=createTwitchFollowers({getToken:()=> 'x',fetchImpl:async()=>{calls++;return response({...metadata,scopes:[]});}});
  await assert.rejects(scope.follows(connection(),'123'),/moderator:read:followers/);assert.equal(calls,1);
  const other=createTwitchFollowers({getToken:()=> 'x',fetchImpl:async()=>response({...metadata,user_id:'888',login:'otra'})});
  await assert.rejects(other.follows(connection(),'123'),/dueño o de un moderador/);
  assert.equal((await other.status([connection()])).ready,false);
});
test('permite OAuth de un moderador únicamente con rol IRC y usuario coincidentes',async()=>{
  const client=createTwitchFollowers({getToken:()=> 'x',fetchImpl:async url=>response(url.includes('validate')?{...metadata,login:'moderador',user_id:'888'}:{data:[{user_id:'123'}]})});
  await assert.rejects(client.follows({...connection(),twitchModerator:true,twitchChatLogin:'otro'},'123'));
  assert.deepEqual(await client.follows({...connection(),twitchModerator:true,twitchChatLogin:'moderador'},'123'),{follows:true});
});
test('coalesce usuarios repetidos, limita concurrencia y aísla credenciales entre instancias',async()=>{
  let calls=0,active=0,maxActive=0;
  const make=()=>createTwitchFollowers({getToken:()=> 'x',fetchImpl:async url=>{
    if(url.includes('validate'))return response(metadata);
    calls++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,5));active--;return response({data:[]});
  }});
  const a=make();await Promise.all(Array.from({length:12},(_,i)=>a.follows(connection(),String(i))));
  assert.ok(maxActive<=4);assert.equal(calls,12);
  await Promise.all(Array.from({length:8},()=>a.follows(connection(),'999')));assert.equal(calls,13);
  await make().follows(connection(),'999');assert.equal(calls,14);
});
test('OAuth modificado invalida caché y las respuestas de error nunca se cachean como false',async()=>{
  let token='a',broken=false,calls=0;
  const client=createTwitchFollowers({getToken:()=>token,fetchImpl:async url=>{
    if(url.includes('validate'))return response(metadata);
    calls++;return broken?response({message:'error'},500):response({data:[{user_id:'123'}]});
  }});
  await client.follows(connection(),'123');token='b';await client.follows(connection(),'123');assert.equal(calls,2);
  broken=true;await assert.rejects(client.follows(connection(),'456'));broken=false;
  await client.follows(connection(),'456');assert.equal(calls,4);
});
