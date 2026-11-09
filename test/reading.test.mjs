import test from 'node:test';
import assert from 'node:assert/strict';
import {canRead, containsBlockedPhrase, normalizeUser, userFields} from '../public/reading.js';
import {speechText, truncateWords} from '../public/speech-text.js';
const message = (platform, user) => ({platform,user});
test('omite mensajes que contienen palabras o frases bloqueadas sin distinguir mayúsculas',()=>{
 assert.equal(containsBlockedPhrase('Un mensaje PROHIBIDO aquí',['prohibido']),true);
 assert.equal(containsBlockedPhrase('Una FRASE completa',['frase completa']),true);
 assert.equal(containsBlockedPhrase('Texto seguro',['  ','otra']),false);
 assert.equal(containsBlockedPhrase('ｐｒｏｈｉｂｉｄｏ',['prohibido']),true);
 assert.equal(containsBlockedPhrase('texto',null),false);
});
test('exclusiones por plataforma prevalecen sobre permitidos y conservan el modo abierto', () => {
 const settings={readingMode:'all',profiles:{'twitch:amigo':{blocked:true,allowed:true}}};
 assert.equal(canRead(settings,message('twitch','@AMIGO')),false);
 assert.equal(canRead(settings,message('kick','amigo')),true);
 assert.equal(canRead(settings,message('twitch','otro')),true);
});
test('modo exclusivo no lee nadie con lista vacía y solo acepta permitidos explícitos', () => {
 const settings={readingMode:'only',profiles:{'tiktok:amigo':{allowed:true},'twitch:amigo':{voice:'offline:demo'}}};
 assert.equal(canRead({readingMode:'only',profiles:{}},message('tiktok','amigo')),false);
 assert.equal(canRead(settings,message('tiktok','@AMIGO')),true);
 assert.equal(canRead(settings,message('twitch','amigo')),false);
 assert.equal(canRead(settings,message('tiktok','desconocido')),false);
});
test('las pruebas explícitas de voz no cambian ni dependen de las listas del chat', () => {
 assert.equal(canRead({readingMode:'only',profiles:{}},{...message('test','invitado'),previewProfile:{voice:'system:default'}}),true);
});
test('identidad de YouTube distingue mayúsculas incluso en filtros', () => {
 const settings={readingMode:'only',profiles:{'youtube:UCAa':{allowed:true}}};
 assert.equal(canRead(settings,message('youtube','UCAa')),true);
 assert.equal(canRead(settings,message('youtube','UCaa')),false);
});
test('cada plataforma tiene instrucciones y normalización propias', () => {
 assert.equal(new Set(Object.values(userFields).map(s=>s.label)).size,6);
 assert.equal(normalizeUser('twitch','@Mi_Usuario'),'mi_usuario');
 assert.equal(normalizeUser('tiktok','https://www.tiktok.com/@Mi.Usuario'),'mi.usuario');
 assert.equal(normalizeUser('kick','https://kick.com/mi-usuario/'),'mi-usuario');
 assert.equal(normalizeUser('test','invitado'),'invitado');
 assert.throws(()=>normalizeUser('twitch','https://kick.com/usuario'),/twitch.tv/);
 assert.throws(()=>normalizeUser('tiktok','Un Nombre Visible'),/Revisa/);
});
test('YouTube acepta ID o URL de canal y rechaza handles y videos', () => {
 const id='UCAbcDEfghIJklMNopQRstuV';
 assert.equal(id.length,24);
 assert.equal(normalizeUser('youtube',id),id);
 assert.equal(normalizeUser('youtube','https://www.youtube.com/channel/'+id),id);
 for(const value of ['@usuario','https://youtube.com/@usuario','https://youtube.com/watch?v=123','UCabc'])
  assert.throws(()=>normalizeUser('youtube',value),/YouTube|UC/);
});
test('el límite omite una palabra incompleta sin cortar la última sílaba', () => {
 assert.equal(truncateWords('Hola última palabra',16),'Hola última');
 assert.equal(truncateWords('Hola última palabra',11),'Hola última');
 assert.equal(truncateWords('Hola última palabra',19),'Hola última palabra');
 assert.equal(truncateWords('supercalifragilistico',10),'');
});
test('abreviaciones y unidades españolas se expanden antes del TTS con singular y plural', () => {
 assert.equal(speechText('Mide 1 CM y 15cm. Ocupa 8 GB. EJM: fotos, ETC.'),'Mide 1 centímetro y 15 centímetros. Ocupa 8 gigabytes. ejemplo: fotos, etcétera.');
 assert.equal(speechText('1 MB y 3 Mb; 2,5 kg; 3 ghz'),'1 megabyte y 3 megabits; 2,5 kilogramos; 3 gigahercios.');
 assert.equal(speechText('p. ej. xfa trae aprox. 2 km'),'por ejemplo por favor trae aproximadamente. 2 kilómetros.');
});
test('no altera palabras que contienen abreviaciones, enlaces, ni correos', () => {
 assert.equal(speechText('cma GBextra ejemplo https://ejm.com/GB usuario@cm.com.'),'cma GBextra ejemplo https://ejm.com/GB usuario@cm.com.');
 assert.equal(speechText('CM GB EJM ETC',false),'CM GB EJM ETC.');
});
test('el texto expandido respeta el límite del proveedor y conserva un final completo', () => {
 const text=speechText('cm '.repeat(500));
 assert.ok(text.length<=650);
 assert.ok(text.endsWith('centímetro.'));
 assert.equal(speechText('¿Todo bien?'),'¿Todo bien?');
});
