// Uso: estando dentro del estudio de la versión portable antigua, pega todo este
// archivo en la consola del navegador. Solo exporta preferencias de una cuenta.
(async () => {
  const response=await fetch('/api/auth/me');
  if(!response.ok) throw Error('Inicia sesión en el estudio antes de exportar.');
  const {username}=await response.json();
  if(!/^[a-z0-9][a-z0-9_.-]{2,49}$/.test(username)) throw Error('La cuenta no es válida.');
  const raw=localStorage.getItem(`vocalive-settings:${username}`) || (username==='admin' ? localStorage.getItem('vocalive-settings') : null);
  if(!raw) throw Error('No hay ajustes guardados para esta cuenta en este navegador y puerto.');
  const saved=JSON.parse(raw);
  const fields=['volume','speed','voiceVolumes','favoriteVoices','favoriteVoiceMeta','delay','voice','ttsEnabled','avatar','readName','auto','skipCommands','skipLinks','maxChars','readingMode','twitchAudience','expandAbbreviations','describeEmojis','streamReactionsEnabled','soundEffectsEnabled','soundVolume','displayName','profiles','blockedPhrases','appearance'];
  const settings=Object.fromEntries(fields.filter(key=>Object.hasOwn(saved,key)).map(key=>[key,saved[key]]));
  if(!Object.keys(settings).length) throw Error('No se encontraron ajustes compatibles.');
  const data=JSON.stringify({format:'streamvoice-settings',version:1,username,settings},null,2);
  if(new TextEncoder().encode(data).length>1024*1024) throw Error('Los ajustes superan 1 MB.');
  const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`streamvoice-ajustes-${username}.json`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  console.log('Ajustes exportados. El archivo no incluye las claves ni los sonidos personalizados.');
})().catch(error=>console.error('No se pudo exportar:',error.message));
