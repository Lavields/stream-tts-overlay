import test from 'node:test';
import assert from 'node:assert/strict';
import {twitchControl} from '../lib.mjs';

const chat=text=>`@id=1;user-id=2;room-id=777 :ana!ana@ana.tmi.twitch.tv PRIVMSG #canal :${text}`;

test('el texto de un mensaje de chat nunca se interpreta como comando',()=>{
  for(const text of ['hola RECONNECT',' RECONNECT','Login authentication failed','msg_channel_suspended','x CLEARCHAT #canal','x CLEARCHAT #canal :pepe','x CLEARMSG #canal :target-msg-id=abc',' 366 ','x ROOMSTATE #canal','PING :tmi.twitch.tv',':tmi.twitch.tv RECONNECT'])
    assert.equal(twitchControl(chat(text),'canal'),null,text);
});
test('reconoce los comandos reales de Twitch',()=>{
  assert.deepEqual(twitchControl('PING :tmi.twitch.tv','canal'),{type:'ping',reply:'PONG :tmi.twitch.tv'});
  assert.deepEqual(twitchControl(':tmi.twitch.tv RECONNECT','canal'),{type:'reconnect'});
  assert.deepEqual(twitchControl(':tmi.twitch.tv NOTICE * :Login authentication failed','canal'),{type:'rejected'});
  assert.deepEqual(twitchControl('@msg-id=msg_channel_suspended :tmi.twitch.tv NOTICE #canal :This channel has been suspended.','canal'),{type:'rejected'});
  assert.deepEqual(twitchControl(':justinfan1.tmi.twitch.tv 366 justinfan1 #canal :End of /NAMES list','canal'),{type:'joined'});
  assert.deepEqual(twitchControl('@room-id=777;slow=0 :tmi.twitch.tv ROOMSTATE #canal','canal'),{type:'roomstate',roomId:'777'});
  assert.deepEqual(twitchControl('@badges=moderator/1;mod=1 :tmi.twitch.tv USERSTATE #canal','canal'),{type:'userstate',moderator:true});
  assert.deepEqual(twitchControl('@badges=;mod=0 :tmi.twitch.tv USERSTATE #canal','canal'),{type:'userstate',moderator:false});
  assert.deepEqual(twitchControl('@login=ana;target-msg-id=abc :tmi.twitch.tv CLEARMSG #canal :hola','canal'),{type:'delete',id:'abc'});
  assert.deepEqual(twitchControl('@target-user-id=2 :tmi.twitch.tv CLEARCHAT #canal :ana','canal'),{type:'purge',user:'ana'});
  assert.deepEqual(twitchControl('@room-id=777 :tmi.twitch.tv CLEARCHAT #canal','canal'),{type:'purge',user:undefined});
});
test('ignora avisos ajenos y comandos de otro canal',()=>{
  assert.equal(twitchControl('@room-id=1 :tmi.twitch.tv ROOMSTATE #otro','canal'),null);
  assert.equal(twitchControl('@target-user-id=2 :tmi.twitch.tv CLEARCHAT #otro :ana','canal'),null);
  assert.equal(twitchControl('@msg-id=msg_channel_suspended :tmi.twitch.tv NOTICE #otro :x','canal'),null);
  assert.equal(twitchControl('@msg-id=slow_on :tmi.twitch.tv NOTICE #canal :Modo lento','canal'),null);
});
