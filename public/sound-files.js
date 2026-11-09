import { soundEffectIds, createSoundBuffer } from './sound-effects.js';
import { bundledSounds } from './bundled-sounds.js';
export const MAX_SOUND_BYTES = 5 * 1024 * 1024;
export const MAX_SOUND_SECONDS = 10;
let database, databaseName="streamvoice-sound-files";
export function configureSoundStorage(username){if(database)throw Error("Almacenamiento ya inicializado.");databaseName=username === "admin" ? "streamvoice-sound-files" : "streamvoice-sound-files:"+username;}
function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(Error('Este navegador no permite guardar archivos de sonido.'));
  if (!database) {
    database = new Promise((resolve,reject) => {
      const request = indexedDB.open(databaseName,1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('files');
        request.result.createObjectStore('metadata',{keyPath:'id'});
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = null; };
        resolve(db);
      };
      request.onerror = () => { database = null; reject(Error('No se pudo abrir el almacenamiento de sonidos.')); };
      request.onblocked = () => { database = null; reject(Error('Cierra las otras pestañas de la app para guardar sonidos.')); };
    });
  }
  return database;
}
function checkId(id) {
  if (!soundEffectIds.has(id)) throw Error('Código de sonido no disponible.');
}
async function read(store, key) {
  const db = await openDatabase();
  return new Promise((resolve,reject) => {
    const transaction = db.transaction(store,'readonly');
    const request = key === undefined ? transaction.objectStore(store).getAll() : transaction.objectStore(store).get(key);
    let result;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = transaction.onabort = () => reject(Error('No se pudo leer el archivo de sonido.'));
  });
}
export async function listSoundFiles() {
  // Read metadata only; audio stays on disk until its code is actually played.
  return read('metadata');
}
export async function validateSoundFile(context, id, file) {
  checkId(id);
  if (!file?.size || file.size > MAX_SOUND_BYTES)
    throw Error('El archivo debe pesar entre 1 byte y 5 MB.');
  let decoded;
  try { decoded = await context.decodeAudioData(await file.arrayBuffer()); }
  catch { throw Error('No se pudo abrir el audio. Prueba un archivo MP3 o WAV compatible con tu navegador.'); }
  if (!Number.isFinite(decoded.duration) || decoded.duration <= 0 || decoded.duration > MAX_SOUND_SECONDS)
    throw Error('El efecto debe durar como máximo 10 segundos. Recorta el audio antes de importarlo.');
  return { id, name:String(file.name || 'Audio importado').slice(0,180), duration:decoded.duration,
    size:file.size, type:file.type || '', savedAt:Date.now() };
}
export async function importSoundFile(context, id, file) {
  const metadata = await validateSoundFile(context,id,file);
  const db = await openDatabase();
  await new Promise((resolve,reject) => {
    const transaction = db.transaction(['files','metadata'],'readwrite');
    transaction.objectStore('files').put(file,id);
    transaction.objectStore('metadata').put(metadata);
    transaction.oncomplete = resolve;
    transaction.onerror = transaction.onabort = () => reject(Error('No se pudo guardar el sonido. Revisa el espacio disponible del navegador.'));
  });
  return metadata;
}
export async function removeSoundFile(id) {
  checkId(id);
  const db = await openDatabase();
  return new Promise((resolve,reject) => {
    const transaction = db.transaction(['files','metadata'],'readwrite');
    transaction.objectStore('files').delete(id);
    transaction.objectStore('metadata').delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = transaction.onabort = () => reject(Error('No se pudo restablecer el sonido.'));
  });
}
export async function loadSoundBuffer(context, id, custom, signal) {
  checkId(id);
  const cancelled = () => {
    if (signal?.aborted) throw new DOMException('Lectura cancelada.','AbortError');
  };
  cancelled();
  const included = bundledSounds[id];
  if (!custom && !included) return createSoundBuffer(context,id);
  let bytes;
  if (custom) {
    const file = await read('files',id);
    cancelled();
    if (!file) throw Error(`No se encontró el archivo del sonido {${id}}. Vuelve a importarlo.`);
    bytes = await file.arrayBuffer();
  } else {
    const response = await fetch(included.url,{signal,cache:'no-cache'});
    if (!response.ok) throw Error(`No se pudo cargar el audio incluido {${id}} (HTTP ${response.status}).`);
    bytes = await response.arrayBuffer();
  }
  cancelled();
  let decoded;
  try { decoded = await context.decodeAudioData(bytes); }
  catch { throw Error(`El navegador no pudo reproducir el archivo del sonido {${id}}.`); }
  cancelled();
  return decoded;
}

// Recheck after asynchronous loading: the user may disable effects meanwhile.
export async function playSoundEffect(context, id, custom, { signal, enabled, play }) {
  if (!enabled() || signal?.aborted) return false;
  const buffer = await loadSoundBuffer(context, id, custom, signal);
  if (!enabled() || signal?.aborted) return false;
  await play(buffer);
  return true;
}
