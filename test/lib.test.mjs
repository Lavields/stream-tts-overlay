import test from "node:test";
import assert from "node:assert/strict";
import { channelName, parseIRC, identity, tiktokMessage } from "../lib.mjs";
import {WebcastChatMessage,User,CommonMessageData} from 'tiktok-live-connector';
test("normaliza nombres y URLs por plataforma sin permitir hosts ajenos", () => {
  assert.equal(channelName("@Mi_Canal", "twitch"), "mi_canal");
  assert.equal(
    channelName("https://www.tiktok.com/@mi.canal/live", "tiktok"),
    "mi.canal",
  );
  assert.equal(channelName("https://kick.com/mi-canal", "kick"), "mi-canal");
  assert.equal(channelName("https://starvios.com/live/streamer1", "starvios"), "streamer1");
  assert.equal(channelName("https://starvios.com/live/streamer1/", "starvios"), "streamer1");
  assert.throws(() => channelName("https://starvios.com/live/", "starvios"));
  assert.throws(() => channelName("https://evil.test/user", "twitch"));
  assert.throws(() => channelName("bad\r\nJOIN #otro", "twitch"));
});
test("YouTube acepta el ID o URL del directo y rechaza nombres de canal", () => {
  assert.equal(
    channelName("https://youtube.com/watch?v=dQw4w9WgXcQ", "youtube"),
    "dQw4w9WgXcQ",
  );
  assert.equal(
    channelName("https://youtu.be/dQw4w9WgXcQ?t=4", "youtube"),
    "dQw4w9WgXcQ",
  );
  assert.equal(
    channelName("https://youtube.com/live/dQw4w9WgXcQ", "youtube"),
    "dQw4w9WgXcQ",
  );
  assert.throws(() => channelName("@streamer", "youtube"));
  assert.throws(() =>
    channelName("https://evil.test/watch?v=dQw4w9WgXcQ", "youtube"),
  );
});
test("IRC conserva el contenido, ID y usuario con tags escapados", () => {
  const msg = parseIRC(
    "@display-name=Mi\\sNombre;id=abc;user-id=123 :usuario!usuario@usuario.tmi.twitch.tv PRIVMSG #canal :Hola: soy <script> ✨",
  );
  assert.deepEqual(msg, {
    user: "usuario",
    displayName: "Mi Nombre",
    channel: "canal",
    text: "Hola: soy <script> ✨",
    id: "abc",
    userId: "123",
    roles: {broadcaster:false,moderator:false,subscriber:false},
  });
  assert.equal(parseIRC("PING :tmi.twitch.tv"), null);
  assert.equal(parseIRC(":tmi.twitch.tv 001 user :Welcome"), null);
});
test("un usuario tiene identidades independientes en multistream", () => {
  assert.equal(identity("twitch", " @Usuario "), "twitch:usuario");
  assert.notEqual(identity("twitch", "usuario"), identity("kick", "usuario"));
  assert.notEqual(identity("youtube", "UCAa"), identity("youtube", "UCaa"));
});
test('TikTok v3 conserva el login displayId y el ID anidado, sin perder mensajes por uniqueId ausente',()=>{
 assert.deepEqual(tiktokMessage({user:{displayId:'ana.real',nickname:'Ana bonita',id:'123'},common:{msgId:'same-id'},content:'¿Cómo estás? {20}'}),
  {user:'ana.real',displayName:'Ana bonita',id:'same-id',text:'¿Cómo estás? {20}'});
 assert.equal(tiktokMessage({user:{nickname:'Solo apodo'},comment:'hola'}),null);
});
test('TikTok lee un evento serializado y decodificado con el protobuf instalado realmente',()=>{
 const data=WebcastChatMessage.decode(new Uint8Array());
 data.user=User.decode(new Uint8Array());data.user.displayId='ana.real';data.user.nickname='Ana';
 data.common=CommonMessageData.decode(new Uint8Array());data.common.msgId='123';data.content='Hola, ¿cómo estás?';
 const decoded=WebcastChatMessage.decode(WebcastChatMessage.encode(data).finish());
 assert.equal(decoded.comment,undefined);
 assert.deepEqual(tiktokMessage(decoded),{user:'ana.real',displayName:'Ana',id:'123',text:'Hola, ¿cómo estás?'});
});
test('TikTok admite los esquemas anteriores y descarta eventos sin texto',()=>{
 assert.deepEqual(tiktokMessage({user:{uniqueId:'ana',nickname:'Ana'},msgId:'1',comment:'Hola'}),{user:'ana',displayName:'Ana',id:'1',text:'Hola'});
 assert.equal(tiktokMessage({user:{displayId:'ana'},comment:''}),null);
 assert.equal(tiktokMessage({uniqueId:'ana',nickname:'Ana',msgId:'2',comment:'Hola'}).user,'ana');
});
