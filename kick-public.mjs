// Unofficial read-only connection, matching Kick's anonymous web chat.
// No session cookies, viewer account, broadcaster token or chat posting.
import WebSocket from 'ws';
import {randomUUID} from 'node:crypto';

export function kickMessage(data) {
  if (!data?.id || typeof data.content !== 'string' || !data.sender?.username) return null;
  return {id:String(data.id),user:data.sender.username,displayName:data.sender.username,text:data.content};
}
export async function connectKickPublic(c,{onMessage,onStatus,onDelete,onPurge,fetcher=fetch,Socket=WebSocket,retryMs=2000}={}) {
  const abort=new AbortController();let socket,timer,handshake,heartbeat,retries=0;
  const active=()=>!c.closed&&!abort.signal.aborted;
  c.stop=async()=>{abort.abort();clearTimeout(timer);clearTimeout(handshake);clearInterval(heartbeat);socket?.close();};
  const read=async(url,options={})=>{
    const response=await fetcher(url,{...options,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});
    if(!response.ok)throw Error(`El chat público de Kick respondió HTTP ${response.status}. Prueba de nuevo o configura la integración oficial en Ajustes.`);
    return response.json();
  };
  const open=async()=>{
    if(!active())return;
    onStatus?.(retries?'reconnecting':'connecting','Conectando al chat público de Kick…');
    try{
      const channel=await read(`https://kick.com/api/v2/channels/${encodeURIComponent(c.channel)}`);
      if(!Number.isSafeInteger(channel.id)||!Number.isSafeInteger(channel.chatroom?.id)||channel.is_banned)throw Error('No se encontró un chat público disponible para ese canal de Kick.');
      const room=`chatrooms.${channel.chatroom.id}.v2`;
      const config=await read(`https://web.kick.com/api/v1/realtime/channels/${channel.id}/chat/connection`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client:{id:randomUUID(),type:'web'},capabilities:{accepted_providers:[{provider:'pusher'}]}}),
      });
      const credentials=config.data?.mode==='websocket'&&config.data.connections?.find(item=>item.provider==='pusher')?.credentials;
      if(!/^[a-zA-Z0-9]+$/.test(credentials?.app_key||'')||!/^[a-z0-9]+$/.test(credentials?.cluster||''))throw Error('Kick cambió su conexión pública de chat. El conector necesita actualizarse.');
      if(!active())return;
      const ws=socket=new Socket(`wss://ws-${credentials.cluster}.pusher.com/app/${credentials.app_key}?protocol=7&client=js&version=8.4.0&flash=false`);
      let lastActivity=Date.now();
      const send=data=>{if(ws.readyState===1)ws.send(JSON.stringify(data));};
      handshake=setTimeout(()=>ws.close(),20000);
      heartbeat=setInterval(()=>{if(Date.now()-lastActivity>60000)ws.close();else send({event:'pusher:ping',data:{}});},25000);
      ws.on('message',raw=>{
        if(!active())return;
        lastActivity=Date.now();
        let event,data;try{event=JSON.parse(raw.toString());data=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
        if(event.event==='pusher:connection_established')send({event:'pusher:subscribe',data:{auth:'',channel:room}});
        if(event.event==='pusher:ping')send({event:'pusher:pong',data:{}});
        if(event.channel!==room)return;
        if(event.event==='pusher_internal:subscription_succeeded'){
          clearTimeout(handshake);retries=0;onStatus?.('connected','Escuchando el chat público · conector no oficial');
        }else if(event.event==='App\\Events\\ChatMessageEvent'){
          const message=kickMessage(data);if(message)onMessage?.(message);
        }else if(event.event==='App\\Events\\MessageDeletedEvent'){
          const id=data?.message?.id;if(id)onDelete?.(String(id));
        }else if(event.event==='App\\Events\\ChatroomClearEvent')onPurge?.();
        else if(event.event==='App\\Events\\UserBannedEvent'&&data?.user?.username)onPurge?.(data.user.username);
      });
      ws.on('error',()=>{if(active())onStatus?.('reconnecting','No se pudo mantener el chat público de Kick. Reintentando…');});
      ws.on('close',()=>{
        clearTimeout(handshake);clearInterval(heartbeat);
        if(active()){onStatus?.('reconnecting','Reconectando al chat público de Kick…');timer=setTimeout(open,Math.min(30000,retryMs*2**retries++));}
      });
    }catch(error){
      if(active()){onStatus?.('reconnecting',error.message);timer=setTimeout(open,Math.min(30000,retryMs*2**retries++));}
    }
  };
  await open();
}
