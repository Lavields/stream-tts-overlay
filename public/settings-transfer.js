// Only explicitly supported preferences are transferred; authentication and credentials are excluded.
export const TRANSFER_FIELDS = ['volume','speed','voiceVolumes','favoriteVoices','favoriteVoiceMeta','delay','voice','ttsEnabled','avatar','readName','auto','skipCommands','skipLinks','maxChars','readingMode','twitchAudience','expandAbbreviations','describeEmojis','streamReactionsEnabled','soundEffectsEnabled','soundVolume','displayName','profiles','blockedPhrases','appearance'];
const objects = new Set(['voiceVolumes','favoriteVoiceMeta','profiles','appearance']);
export function cleanTransferSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Los ajustes del archivo no son válidos.');
  const result={};
  for (const key of TRANSFER_FIELDS) {
    if (!Object.hasOwn(value,key)) continue;
    const v=value[key];
    if (objects.has(key) && (!v || typeof v !== 'object' || Array.isArray(v))) throw Error(`El campo ${key} no es válido.`);
    if (key==='profiles' && Object.values(v).some(p=>!p || typeof p!=='object' || Array.isArray(p))) throw Error('Los perfiles no son válidos.');
    if (key==='blockedPhrases' && !Array.isArray(v)) throw Error('Las frases bloqueadas no son válidas.');
    result[key]=v;
  }
  if (!Object.keys(result).length) throw Error('El archivo no contiene ajustes compatibles.');
  return result;
}
export function createSettingsTransfer(username, settings) {
  if (!/^[a-z0-9][a-z0-9_.-]{2,49}$/.test(username)) throw Error('Usuario inválido.');
  return {format:'streamvoice-settings',version:1,username,settings:cleanTransferSettings(settings)};
}
export function parseSettingsTransfer(text, username) {
  if (new TextEncoder().encode(text).length>1024*1024) throw Error('El archivo supera 1 MB.');
  let data; try { data=JSON.parse(text); } catch { throw Error('El archivo no contiene JSON válido.'); }
  if (!data || data.format!=='streamvoice-settings' || data.version!==1) throw Error('El formato del archivo no es compatible.');
  if (data.username!==username) throw Error('El archivo pertenece a otra cuenta. Inicia sesión con esa cuenta antes de importarlo.');
  return cleanTransferSettings(data.settings);
}
