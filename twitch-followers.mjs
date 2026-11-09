import {BoundedTTLCache} from './resource-utils.mjs';

// One instance per app account; credentials and follower caches never cross tenants.
export function createTwitchFollowers({getToken,fetchImpl=fetch,now=Date.now}) {
  const cache=new BoundedTTLCache(2000,60_000,now);
  const inFlight=new Map(),waiting=[];
  let token='',metadata=null,metadataUntil=0,validation=null,active=0,cooldownUntil=0,credentialError=null,errorUntil=0;
  const failure=message=>Object.assign(Error(message),{status:409});
  async function request(url,headers) {
    let response;
    try { response=await fetchImpl(url,{headers,signal:AbortSignal.timeout(5000)}); }
    catch { throw failure('Twitch no respondió al verificar seguidores. Los usuarios sin verificar no se leerán.'); }
    const data=await response.json().catch(()=>null);
    if(response.status===401){metadata=null;metadataUntil=0;cache.clear();throw failure('El OAuth de Twitch expiró o no es válido. Actualízalo en Ajustes.');}
    if(response.status===403)throw failure('Twitch no permite leer seguidores de este canal con ese OAuth.');
    if(response.status===429){cooldownUntil=now()+30_000;throw failure('Twitch limitó las consultas de seguidores. Espera unos segundos.');}
    if(!response.ok||!data)throw failure('No se pudo comprobar seguidores en Twitch. Reintenta en unos segundos.');
    return data;
  }
  async function credentials() {
    const current=String(getToken()||'').replace(/^oauth:/i,'').trim();
    if(current!==token){token=current;metadata=null;metadataUntil=0;validation=null;cache.clear();inFlight.clear();cooldownUntil=0;credentialError=null;errorUntil=0;}
    if(!current)throw failure('Para verificar seguidores, configura un OAuth de Twitch con permiso moderator:read:followers.');
    if(credentialError&&now()<errorUntil)throw credentialError;
    if(metadata&&now()<metadataUntil)return metadata;
    if(validation)return validation;
    const task=(async()=>{
      const data=await request('https://id.twitch.tv/oauth2/validate',{Authorization:'OAuth '+current});
      if(!data.client_id||!data.user_id||!data.login||!Array.isArray(data.scopes)||!data.scopes.includes('moderator:read:followers'))
        throw failure('El OAuth de Twitch necesita el permiso moderator:read:followers del dueño o de un moderador del canal.');
      const result={clientId:data.client_id,userId:data.user_id,login:String(data.login).toLowerCase(),accessToken:current};
      if(current===token){metadata=result;metadataUntil=now()+Math.min(900_000,Math.max(0,(Number(data.expires_in)||0)*1000-10_000));}
      return result;
    })();
    validation=task;
    try{return await task;}catch(error){if(current===token){credentialError=error;errorUntil=now()+15_000;}throw error;}
    finally{if(validation===task)validation=null;}
  }
  function authorized(meta,connection) {
    return meta.login===connection.channel || (connection.twitchRoomId && meta.userId===connection.twitchRoomId) ||
      (connection.twitchModerator===true&&meta.login===connection.twitchChatLogin);
  }
  function checkPermission(meta,connection) {
    if(!connection||connection.closed||connection.state!=='connected')throw failure('Conecta primero un canal de Twitch para verificar seguidores.');
    if(!authorized(meta,connection))throw failure('Usa el OAuth del dueño o de un moderador de este canal. Si es moderador, reconecta Twitch con su usuario y OAuth.');
  }
  async function limited(task) {
    if(active>=4){
      if(waiting.length>=32)throw failure('Hay muchas consultas de seguidores pendientes. Reintenta en unos segundos.');
      await new Promise(resolve=>waiting.push(resolve));
    }else active++;
    try{return await task();}finally{const next=waiting.shift();if(next)next();else active--;}
  }
  async function status(connections=[]) {
    try {
      const meta=await credentials();
      if(!connections.length)return {ready:false,action:'connect',message:'OAuth con permiso de seguidores configurado. Conecta tu canal de Twitch.'};
      const channels=connections.map(connection=>{
        try{checkPermission(meta,connection);return {channel:connection.channel,ready:true};}
        catch(error){return {channel:connection.channel,ready:false,message:error.message};}
      });
      return {ready:channels.every(c=>c.ready),channels,message:channels.every(c=>c.ready)?'Seguidores verificados con Twitch.':channels.find(c=>!c.ready).message};
    }catch(error){return {ready:false,message:error.message};}
  }
  async function follows(connection,userId) {
    if(!/^\d{1,25}$/.test(String(userId||'')))throw failure('El mensaje de Twitch no incluye un ID de usuario verificable.');
    const meta=await credentials();checkPermission(meta,connection);
    if(now()<cooldownUntil)throw failure('Twitch limitó las consultas de seguidores. Espera unos segundos.');
    const key=meta.accessToken+':'+connection.channel+':'+userId;
    const known=cache.get(key);if(known!==undefined)return {follows:known};
    if(inFlight.has(key))return inFlight.get(key);
    const task=limited(async()=>{
      const headers={'Client-Id':meta.clientId,Authorization:'Bearer '+meta.accessToken};
      let broadcaster=connection.twitchRoomId;
      if(!/^\d{1,25}$/.test(String(broadcaster||''))){
        const users=await request('https://api.twitch.tv/helix/users?login='+encodeURIComponent(connection.channel),headers);
        broadcaster=users.data?.find(user=>String(user.login).toLowerCase()===connection.channel)?.id;
        if(!/^\d{1,25}$/.test(String(broadcaster||'')))throw failure('Twitch no pudo identificar el canal para verificar seguidores.');
        connection.twitchRoomId=broadcaster;
      }
      const url=new URL('https://api.twitch.tv/helix/channels/followers');
      url.searchParams.set('broadcaster_id',broadcaster);url.searchParams.set('user_id',userId);url.searchParams.set('first','1');
      const data=await request(url.toString(),headers);
      if(!Array.isArray(data.data))throw failure('Twitch no devolvió un estado de seguidor verificable.');
      const result=data.data.some(user=>String(user.user_id)===String(userId));
      if(meta.accessToken===token)cache.set(key,result);
      return {follows:result};
    });
    inFlight.set(key,task);
    try{return await task;}finally{if(inFlight.get(key)===task)inFlight.delete(key);}
  }
  return {status,follows};
}
