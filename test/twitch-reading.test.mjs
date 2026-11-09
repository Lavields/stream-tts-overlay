import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIRC} from '../lib.mjs';
import {canRead,needsTwitchFollowerCheck,createTwitchReader,normalizeTwitchAudience} from '../public/reading.js';

const msg=(roles={},extra={})=>({platform:'twitch',channel:'canal',user:'ana',userId:'123',roles,...extra});
test('IRC conserva roles de Twitch, fundador y dueño sin inferirlos del texto',()=>{
  const line=(tags,user='ana')=>`@user-id=123;room-id=777;${tags} :${user}!a@a PRIVMSG #canal :soy moderador y suscriptor`;
  assert.deepEqual(parseIRC(line('mod=0;subscriber=0;badges=vip/1')).roles,{broadcaster:false,moderator:false,subscriber:false});
  assert.equal(parseIRC(line('mod=1;subscriber=0;badges=')).roles.moderator,true);
  assert.equal(parseIRC(line('mod=0;subscriber=1;badges=')).roles.subscriber,true);
  assert.equal(parseIRC(line('badges=founder/0')).roles.subscriber,true);
  assert.equal(parseIRC(line('badges=broadcaster/1')).roles.moderator,true);
  assert.equal(parseIRC(line('mod=0;subscriber=0','canal')).roles.broadcaster,true);
  assert.equal(parseIRC('@user-id=777;room-id=777;mod=0 :otro!a@a PRIVMSG #canal :hola').roles.moderator,true);
});
test('las cuatro audiencias aplican la matriz correcta, con dueño incluido y VIP sin privilegios extra',()=>{
  const cases=[
    [msg(),[true,false,false,false]],
    [msg({}, {twitchFollower:true}),[true,true,false,false]],
    [msg({subscriber:true}),[true,true,true,false]],
    [msg({moderator:true}),[true,true,true,true]],
    [msg({broadcaster:true}),[true,true,true,true]],
    [msg({vip:true}),[true,false,false,false]],
  ];
  for(const [message,expected]of cases)for(const [i,twitchAudience]of ['all','followers','subscribers','moderators'].entries())
    assert.equal(canRead({twitchAudience},message),expected[i],JSON.stringify({message,twitchAudience}));
  assert.equal(normalizeTwitchAudience('cualquiera'),'all');
  assert.equal(canRead({twitchAudience:'moderators'},{platform:'kick',user:'ana'}),true);
});
test('las exclusiones prevalecen, permitidos no eluden los roles, pruebas no cambian de comportamiento',()=>{
  assert.equal(canRead({twitchAudience:'all',profiles:{'twitch:ana':{blocked:true}}},msg({moderator:true})),false);
  assert.equal(canRead({twitchAudience:'moderators',readingMode:'only',profiles:{'twitch:ana':{allowed:true}}},msg()),false);
  assert.equal(canRead({twitchAudience:'moderators',readingMode:'only',profiles:{}},msg({moderator:true})),false);
  assert.equal(canRead({twitchAudience:'moderators',readingMode:'only',profiles:{}},{...msg(),previewProfile:{voice:'x'}}),true);
});
test('solo se consulta el seguimiento cuando hace falta; nunca para mods, subs, excluidos u otras plataformas',()=>{
  assert.equal(needsTwitchFollowerCheck({twitchAudience:'followers'},msg()),true);
  for(const message of [msg({moderator:true}),msg({subscriber:true}),msg({}, {twitchFollower:false}),{platform:'test',user:'ana'}])
    assert.equal(needsTwitchFollowerCheck({twitchAudience:'followers'},message),false);
  assert.equal(needsTwitchFollowerCheck({twitchAudience:'followers',profiles:{'twitch:ana':{blocked:true}}},msg()),false);
  assert.equal(needsTwitchFollowerCheck({twitchAudience:'all'},msg()),false);
});
test('las verificaciones paralelas se entregan en orden y respetan borrados o vaciado durante la espera',async()=>{
  const settings={twitchAudience:'followers'},resolvers=new Map(),delivered=[];
  const reader=createTwitchReader({getSettings:()=>settings,deliver:m=>{if(canRead(settings,m))delivered.push(m.id);},verify:m=>new Promise(resolve=>resolvers.set(m.id,resolve))});
  const a=reader.receive(msg({}, {id:'a'})),b=reader.receive(msg({}, {id:'b'})),c=reader.receive(msg({moderator:true},{id:'c'}));
  await Promise.resolve();resolvers.get('b')({follows:true});await Promise.resolve();assert.deepEqual(delivered,[]);
  reader.cancel(m=>m.id==='a');resolvers.get('a')({follows:true});await Promise.all([a,b,c]);
  assert.deepEqual(delivered,['b','c']);assert.equal(reader.pendingCount,0);
  const d=reader.receive(msg({}, {id:'d'}));await Promise.resolve();reader.cancel();resolvers.get('d')({follows:true});await d;
  assert.deepEqual(delivered,['b','c']);
});
test('un error no se interpreta como seguidor; los cambios de filtro se aplican antes de entregar',async()=>{
  const settings={twitchAudience:'followers'},delivered=[],errors=[];let resolve;
  const reader=createTwitchReader({getSettings:()=>settings,deliver:m=>{if(canRead(settings,m))delivered.push(m.id);},verify:()=>new Promise(r=>resolve=r),onError:e=>errors.push(e.message)});
  let done=reader.receive(msg({}, {id:'a'}));await Promise.resolve();resolve({});await done;
  assert.deepEqual(delivered,[]);assert.equal(errors.length,1);
  done=reader.receive(msg({}, {id:'b'}));await Promise.resolve();settings.twitchAudience='moderators';resolve({follows:true});await done;
  assert.deepEqual(delivered,[]);
});
