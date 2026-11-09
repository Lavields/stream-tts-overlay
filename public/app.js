import { appearanceThemes, appearancePalette } from "./appearance-themes.js";
import { createSettingsTransfer, parseSettingsTransfer } from "./settings-transfer.js";
import {limitChatWords,SOUND_CODE_SOURCE,VOICE_TAG_SOURCE} from "./chat-limit.js";
import { createQueueView } from "./queue-view.js";
import { createMouthDriver, systemSpeechRms } from "./mouth.js";
import { matchesSearch, searchableSelect } from "./searchable-select.js";
import { createAvatarPresence, SLIDE_MS } from "./presence.js";
import { identity as key } from "./identity.js";
import { canRead, containsBlockedPhrase, normalizeUser, userFields, twitchAudiences, normalizeTwitchAudience, needsTwitchFollowerCheck, createTwitchReader } from "./reading.js";
import { expressionSpeech } from "./chat-reactions.js";
import { speechSegments, truncateWords } from "./speech-text.js";
import { createSoundCooldown } from "./sound-cooldown.js";
import { soundEffects } from "./sound-effects.js";
import { bundledSounds } from "./bundled-sounds.js";
import { configureSoundStorage, listSoundFiles, importSoundFile, removeSoundFile, playSoundEffect } from "./sound-files.js";
import { voiceVolume, playbackGain } from "./voice-volume.js";
import { freeVoices } from "./free-voices.js";
import {
  avatars as allAvatars,
  avatarSVG,
  setMouth,
  normalizeAvatar,
  blink,
} from "./avatars.js";
const authResponse = await fetch("/api/auth/me");
if (!authResponse.ok) { location.replace("/login"); await new Promise(()=>{}); }
const account = await authResponse.json();
configureSoundStorage(account.username);
const avatars = allAvatars.filter(a => account.avatars === null || account.avatars.includes(a.id));
const settingsKey = `vocalive-settings:${account.username}`;
const $ = (s) => document.querySelector(s);
const searchablePickers = new Map();
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const labels = {
  twitch: "Twitch",
  tiktok: "TikTok",
  kick: "Kick",
  youtube: "YouTube",
  starvios: "Starvios",
  test: "Prueba",
};
const symbols = {
  twitch: "T",
  tiktok: "♪",
  kick: "K",
  youtube: "▶",
  test: "✦",
};
function platformBadge(platform) {
  if (!['twitch','tiktok','kick','youtube','starvios'].includes(platform))
    return '<span class="platform-dot test" aria-label="Prueba">✦</span>';
  const extension = platform === 'starvios' ? 'png' : 'svg';
  return `<span class="platform-dot ${esc(platform)}" title="${esc(labels[platform])}"><img src="/assets/platforms/${platform}.${extension}" width="18" height="18" alt="${esc(labels[platform])}" /></span>`;
}
const appearancePalettes = {
  dark: {background:'#0c1120',foreground:'#f3f6ff'},
  light: {background:'#f2f5fb',foreground:'#18243a'},
};
const defaults = {
  volume: 80,
  speed: 1,
  voiceVolumes: {},
  favoriteVoices: null,
  favoriteVoiceMeta: {},
  delay: 2,
  voice: "fish:5458dad9c902431cb0dbb37703160cb7",
  ttsEnabled: true,
  avatar: "sock",
  readName: false,
  auto: true,
  skipCommands: true,
  skipLinks: true,
  maxChars: 280,
  readingMode: "all",
  twitchAudience: 'all',
  expandAbbreviations: true,
  describeEmojis: true,
  streamReactionsEnabled: true,
  soundEffectsEnabled: true,
  soundVolume: 60,
  displayName: '',
  profiles: {},
  customVoices: [],
  blockedPhrases: [],
  appearance: { mode:'dark', theme:'azul-hielo', ...appearanceThemes['azul-hielo'].dark, font:'system' },
};
let saved = {};
try {
  saved = JSON.parse((localStorage.getItem(settingsKey) || (account.username === "admin" ? localStorage.getItem("vocalive-settings") : null)) || "{}");
} catch {}
const settings = { ...defaults, ...saved };
settings.blockedPhrases = Array.isArray(settings.blockedPhrases) ? settings.blockedPhrases.filter(v=>typeof v==='string') : [];
settings.appearance = {...defaults.appearance,...(settings.appearance && typeof settings.appearance==='object' ? settings.appearance : {})};
// Upgrade only the old built-in colors; keep any colors the user customized.
if (settings.appearance.background==='#0d1525' && settings.appearance.foreground==='#f4f6ff') Object.assign(settings.appearance,appearancePalettes.dark);
else if(settings.appearance.background==='#f4f6fb' && settings.appearance.foreground==='#172033') Object.assign(settings.appearance,appearancePalettes.light);
if(settings.appearance.accent==='#4d7cff') settings.appearance.accent='#416ff2';
function applyAppearance() {
  const a=settings.appearance, root=document.documentElement;
  const mode=['light','dark','system'].includes(a.mode)?a.mode:'dark';
  const light=mode==='light'||(mode==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches);
  root.dataset.appearance=light?'light':'dark';
  root.dataset.theme=appearanceThemes[a.theme] ? a.theme : 'custom';
  root.dataset.backgrounds=a.backgrounds === false ? 'off' : 'on';
  root.dataset.glass=a.glass === false ? 'off' : 'on';
  const color=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(value)?value:fallback;
  const palette=mode==='system' && appearancePalette(a.theme,light?'light':'dark');
  const automaticPalette=mode==='system' && a.theme==='custom' && Object.values(appearancePalettes).some(p=>a.background===p.background && a.foreground===p.foreground);
  root.style.setProperty('--accent',color(palette?.accent || a.accent,defaults.appearance.accent));
  root.style.setProperty('--purple',color(palette?.accent || a.accent,defaults.appearance.accent));
  root.style.setProperty('--bg',palette?.background || (automaticPalette?appearancePalettes[light?'light':'dark'].background:color(a.background,defaults.appearance.background)));
  root.style.setProperty('--text',palette?.foreground || (automaticPalette?appearancePalettes[light?'light':'dark'].foreground:color(a.foreground,defaults.appearance.foreground)));
  const fonts={system:'Inter, -apple-system, BlinkMacSystemFont, sans-serif',arial:'Arial, sans-serif',georgia:'Georgia, serif',mono:'ui-monospace, monospace'};
  root.style.fontFamily=fonts[a.font]||fonts.system;
}
applyAppearance();
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(settings.appearance.mode==='system')applyAppearance();});
settings.ttsEnabled = settings.ttsEnabled !== false;
settings.customVoices = [];
settings.speed = Math.min(1.5, Math.max(0.7, Number(settings.speed) || 1));
if (settings.favoriteVoices !== null && !Array.isArray(settings.favoriteVoices)) settings.favoriteVoices = null;
if (!settings.favoriteVoiceMeta || typeof settings.favoriteVoiceMeta !== "object" || Array.isArray(settings.favoriteVoiceMeta)) settings.favoriteVoiceMeta = {};
if (!settings.voiceVolumes || typeof settings.voiceVolumes !== "object" || Array.isArray(settings.voiceVolumes)) settings.voiceVolumes = {};
delete settings.overlayVisible;
settings.readingMode = settings.readingMode === "only" ? "only" : "all";
settings.twitchAudience = normalizeTwitchAudience(settings.twitchAudience);
settings.avatar = avatars.some(a=>a.id===settings.avatar) ? settings.avatar : avatars[0].id;
settings.profiles =
  settings.profiles && typeof settings.profiles === "object"
    ? settings.profiles
    : {};
settings.customVoices = Array.isArray(settings.customVoices)
  ? settings.customVoices
  : [];
for (const profile of Object.values(settings.profiles))
  profile.avatar = avatars.some(a=>a.id===profile.avatar) ? profile.avatar : avatars[0].id;
settings.soundVolume = Math.min(100, Math.max(0, Number(settings.soundVolume) || 0));
settings.volume = Math.min(100, Math.max(0, Number(settings.volume) || 0));
settings.delay = Math.min(30, Math.max(0, Number(settings.delay) || 0));
const save = () => {
  try {
    localStorage.setItem(settingsKey, JSON.stringify(settings));
  } catch {
    toast("El navegador no permite guardar la configuración.");
  }
};
const soundCooldown = createSoundCooldown({
  storage: {
    getItem: name => localStorage.getItem(`${account.username}:${name}`),
    setItem: (name,value) => localStorage.setItem(`${account.username}:${name}`,value),
  },
  locks: navigator.locks,
});
function cooldownNotice(job, id) {
  const remaining = soundCooldown.remaining(id);
  if (!remaining) return false;
  if (!job.cooldownNotified) {
    job.cooldownNotified = true;
    toast(`Se omitió {${id}}: disponible en ${Math.ceil(remaining / 1000)} segundos.`);
  }
  return true;
}
let queue = [],
  current = null,
  paused = false,
  armed = false,
  nextAt = 0,
  pumpTimer,
  forceNext = false,
  total = 0,
  connectionList = [],
  configured = {},
  editingKey = null,
  toastTimer;
let catalog = { community: [], requested: [] },
  blinkId = "",
  blinkAt = 0,
  audioContext,
  gainNode,
  analyser,
  mouthFrame,
  level = 0,
  boundaryAt = 0,
  overlayBusy = false,
  overlayPending = null,
  lastOverlay = 0;
let previewAvatar = settings.avatar,
  currentView = "studio";
let pendingPreview = null;
const customSoundFiles = new Map();
let fishSearchPage = 0,
  fishHasMore = false,
  fishTotal = 0,
  fishSearchQuery = "",
  remoteFishVoices = [],
  previewFilter = "free",
  voicePage = 0,
  loadingFishVoices = false,
  fishQueuedQuery = null;
const mainPresence = createAvatarPresence($("#main-avatar"), blink);
let twitchFollowerState = null, followerStatusRequest = 0;
const twitchReader = createTwitchReader({
  getSettings:()=>settings,
  deliver:message=>{if(settings.ttsEnabled)enqueue(message);},
  verify:async message=>{
    const result=await api('/api/twitch/follower',{channel:message.channel,userId:message.userId});
    if(twitchFollowerState?.ready===false&&settings.twitchAudience==='followers')refreshTwitchFollowerStatus();
    return result;
  },
  onError:error=>{twitchFollowerState={ready:false,message:error.message};renderTwitchAudience();},
});
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 5000);
}
$('#settings-export').addEventListener('click',()=>{
  try {
    const data=createSettingsTransfer(account.username,settings);
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a'); link.href=url; link.download=`streamvoice-ajustes-${account.username}.json`; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch(error) { toast(error.message); }
});
$('#settings-import').addEventListener('click',()=>$('#settings-import-file').click());
$('#settings-import-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0]; event.target.value=''; if(!file) return;
  try {
    if(file.size>1024*1024) throw Error('El archivo supera 1 MB.');
    const imported=parseSettingsTransfer(await file.text(),account.username);
    if(!confirm('Se reemplazarán los ajustes actuales de esta cuenta. Exporta una copia primero si deseas conservarlos. ¿Continuar?')) return;
    localStorage.setItem(settingsKey,JSON.stringify(imported));
    location.reload();
  } catch(error) { toast(error.message || 'No se pudieron importar los ajustes.'); }
});
const updatesButton = document.querySelector('#updates-check');
if (updatesButton && window.desktopUpdates) {
  updatesButton.hidden = false;
  updatesButton.addEventListener('click', async () => {
    updatesButton.disabled = true;
    try {
      const result = await window.desktopUpdates.check();
      const messages = {
        unavailable: 'La búsqueda de actualizaciones aún no está configurada.',
        current: 'Tu aplicación está actualizada.',
        available: 'Hay una actualización disponible; comenzará a descargarse.',
        error: 'No se pudo comprobar si hay actualizaciones. Inténtalo más tarde.',
      };
      toast(messages[result?.status] || messages.error);
    } catch { toast('No se pudo comprobar si hay actualizaciones. Inténtalo más tarde.'); }
    finally { updatesButton.disabled = false; }
  });
}
async function api(path, data) {
  const r = await fetch(
    path,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const d = await r.json();
  if (r.status === 401) location.replace("/login");
  if (!r.ok) throw Error(d.error || "No se pudo completar la solicitud.");
  return d;
}
function safePlay() {
  armed = true;
  if (!audioContext && (window.AudioContext || window.webkitAudioContext))
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  audioContext?.resume().catch(() => {});
}
function voiceList() {
  const fish = [...catalog.requested, ...remoteFishVoices,
    ...Object.values(settings.favoriteVoiceMeta).filter(v => v.group === "fish" || v.provider === "fish")]
    .map(v => ({ ...v, id: v.id.startsWith("fish:") ? v.id : "fish:" + v.id }));
  const uniqueFish = [...new Map(fish.map(v => [v.id, v])).values()];
  for(const id of account.voices || []) if(id.startsWith('fish:') && !uniqueFish.some(v=>v.id===id)) uniqueFish.push({id,name:'Voz Fish · '+id.slice(5,13),provider:'fish',language:'es'});
  return [
    ...uniqueFish.map(v => ({ ...v, engine: "Fish Audio", group: "fish" })),
    ...freeVoices.map(v => ({ ...v, id: "edge:" + v.id, group: "free" })),
  ].filter(v => account.voices == null || account.voices.includes(v.id));
}
function voiceName(id) {
  return voiceList().find(v => v.id === id)?.name || "Fish Audio";
}
function refreshVoices() {
  const options = voiceList();
  const known = new Set(options.map(v => v.id));
  const remembered = new Set([settings.voice, ...(settings.favoriteVoices || []), ...Object.values(settings.profiles).map(p => p.voice)]);
  for (const id of remembered) {
    if (!known.has(id) && (account.voices == null || account.voices.includes(id)) && /^(fish|edge):[\w-]{1,100}$/.test(id || ""))
      options.push({ id, name: id.slice(id.indexOf(":") + 1), group: id.startsWith("edge:") ? "free" : "fish" });
  }
  for (const select of [$("#default-voice"), $("#user-voice")]) {
    const value =
      select.id === "default-voice"
        ? settings.voice
        : select.value || settings.voice;
    select.innerHTML = options
      .map(
        (v) =>
          `<option value="${esc(v.id)}">${esc(v.name)} · ${v.group === "free" ? "Edge gratis" : "Fish API"}</option>`,
      )
      .join("");
    select.value = options.some((v) => v.id === value)
      ? value
      : defaults.voice;
    searchablePickers.get(select.id)?.sync();
  }
  renderVoiceLibrary();
  voiceHint();
  renderProfiles();
}
function engineName(id = settings.voice) { return String(id).startsWith("edge:") ? "Microsoft Edge TTS" : "Fish Audio"; }
function voiceHint() {
  const edge = String(settings.voice).startsWith("edge:");
  $("#voice-hint").textContent = edge
    ? "Edge TTS es gratuito, requiere Internet y no necesita clave."
    : "Fish Audio requiere Internet y tu clave propia. Volumen y favoritos en Voces y avatares.";
  $('#voice-hint').title = $('#voice-hint').textContent;
  updateDashboardVoice();
  if (!current) $("#stage-engine").textContent = engineName(settings.voice);
}
async function loadRemote() {
  try {
    catalog = await api("/voice-catalog.json");
    const favoriteMigration = "valorant-agents-2026-10";
    const favoriteMigrations = Array.isArray(settings.favoriteCatalogMigrations) ? settings.favoriteCatalogMigrations : [];
    if (!Array.isArray(settings.favoriteVoices)) {
      settings.favoriteVoices = catalog.requested.map(v => "fish:" + v.id);
      settings.favoriteCatalogMigrations = [...new Set([...favoriteMigrations, favoriteMigration])];
    } else if (!favoriteMigrations.includes(favoriteMigration)) {
      const favorites = new Set(settings.favoriteVoices);
      for (const voice of catalog.requested.filter(v => v.favoriteByDefault)) favorites.add("fish:" + voice.id);
      settings.favoriteVoices = [...favorites];
      settings.favoriteCatalogMigrations = [...favoriteMigrations, favoriteMigration];
    }
    save();
    refreshVoices();
  } catch (e) {
    toast("No se pudieron cargar las voces: " + e.message);
  }
}
function selectAvatar(id) {
  settings.avatar = id;
  save();
  renderAvatarGrids();
  if (!current) updateStage(null);
}
function renderAvatarGrids() {
  $("#avatar-count").textContent = `${avatars.length} AVATARES`;
  const chosen = avatars.find(a => a.id === settings.avatar) || avatars[0];
  $('#current-avatar-thumb').src = `/assets/avatars/${chosen.id}-thumb.png`;
  $('#current-avatar-name').textContent = chosen.name;
  $('#dashboard-avatar-name').textContent=chosen.name;
  $('#dashboard-avatar-img').src=`/assets/avatars/${chosen.id}-thumb.png`;
  $('#dashboard-hero-avatar').src=`/assets/avatars/${chosen.id}-thumb.png`;
  for (const selector of ["#avatar-grid", "#library-avatars"]) {
    const query = $(selector === "#avatar-grid" ? "#avatar-search" : "#library-avatar-search").value;
    const filtered = avatars.filter(a => matchesSearch(`${a.name} ${a.desc}`, query));
    $(selector).innerHTML = filtered
      .map(
        (a) =>
          `<button class="avatar-option ${settings.avatar === a.id ? "selected" : ""}" data-avatar="${a.id}" aria-pressed="${settings.avatar === a.id}">${settings.avatar === a.id ? '<span class="selected-mark">✓</span>' : ""}<img class="avatar-thumbnail" loading="lazy" decoding="async" src="/assets/avatars/${a.id}-thumb.png" width="160" height="160" alt="" /><strong>${a.name}</strong><small>${a.desc}</small></button>`,
      )
      .join("") || '<p class="search-empty" role="status">No se encontraron avatares.</p>';
    $(selector)
      .querySelectorAll("[data-avatar]")
      .forEach((b) => (b.onclick = () => {
        selectAvatar(b.dataset.avatar);
        if (selector === '#avatar-grid') $('#avatar-picker-dialog').close();
      }));
  }
}
function updateStage(msg, profile = {}) {
  const avatar = profile.avatar || settings.avatar;
  previewAvatar = avatar;
  $("#stage-bubble").hidden = !msg;
  $("#stage-bubble-user").textContent = msg?.displayName || msg?.user || "";
  $("#stage-bubble-text").textContent = String(msg?.text || "").replace(new RegExp(String.raw`(?:${SOUND_CODE_SOURCE}|${VOICE_TAG_SOURCE})`,"giu")," ").replace(/\s+/g," ").trim();
  $("#main-avatar").innerHTML = avatarSVG(avatar);
  $("#avatar-name").textContent =
    avatars.find((a) => a.id === avatar)?.name || "Calcetín Arcoíris";
  $("#stage-status").classList.toggle("live", Boolean(msg));
  $("#stage-status").innerHTML = msg ? "<i></i> Hablando" : settings.ttsEnabled ? "<i></i> En espera" : "<i></i> TTS apagado";
  $("#equalizer").classList.toggle("active", Boolean(msg));
  const engine = engineName(profile.voice || settings.voice);
  $("#stage-engine").textContent = engine;
  $("#lip-mode").textContent =
    engine === "Voz del sistema"
      ? "Boca animada durante la lectura"
      : "Boca sincronizada con el audio";
  if (msg) {
    $("#now-user").textContent =
      `${msg.displayName || msg.user} · ${labels[msg.platform]}`;
    $("#now-text").textContent = msg.text;
  } else {
    $("#now-user").textContent = !settings.ttsEnabled ? "TTS apagado" : paused
      ? "La cola está en pausa"
      : "El micrófono es de tu chat";
    $("#now-text").textContent = !settings.ttsEnabled ? "Los mensajes no se leen ni se acumulan. Enciende el TTS para continuar." : total
      ? `${total} mensaje${total === 1 ? "" : "s"} leído${total === 1 ? "" : "s"}. Esperando la próxima voz…`
      : "Conecta un canal o prueba una lectura para empezar.";
  }
  setMouth($("#main-avatar"), 0);
  updateLiveState();
  mainPresence.update({ speaking: Boolean(current?.started) });
  sendOverlay(0, true);
}
function overlayData(l) {
  return {
    avatar: previewAvatar,
    blinkId,
    blinkAt,
    user:
      current?.message.displayName ||
      current?.message.user ||
      "Tu chat tiene voz",
    text: current?.message.text || "",
    speaking: Boolean(current?.started),
    level: l,
    visible: false,
  };
}
async function sendOverlay(l, force = false) {
  const now = Date.now();
  if (!force && now - lastOverlay < 90) return;
  lastOverlay = now;
  overlayPending = overlayData(l);
  if (overlayBusy) return;
  overlayBusy = true;
  while (overlayPending) {
    const data = overlayPending;
    overlayPending = null;
    try {
      await api("/api/overlay", data);
    } catch {
      overlayPending = null;
      break;
    }
  }
  overlayBusy = false;
}
function animateMouth() {
  cancelAnimationFrame(mouthFrame);
  const bins = analyser ? new Uint8Array(analyser.fftSize) : null;
  const mouth = createMouthDriver();
  const frame = () => {
    if (!current?.started) return;
    const t = performance.now();
    if (current.playingSound || current.betweenSegments) {
      level = 0;
    } else if (analyser && bins) {
      analyser.getByteTimeDomainData(bins);
      let sum = 0;
      for (const b of bins) sum += ((b - 128) / 128) ** 2;
      level = mouth(Math.sqrt(sum / bins.length), t);
    } else {
      level = mouth(systemSpeechRms(t), t);
    }
    setMouth($("#main-avatar"), level);
    sendOverlay(level);
    mouthFrame = requestAnimationFrame(frame);
  };
  frame();
}
function normalizeMessage(m) {
  let text = String(m.text || "").trim();
  if (!text) return null;
  if (containsBlockedPhrase(text, settings.blockedPhrases)) return null;
  if (settings.skipCommands && text.startsWith("!")) return null;
  if (settings.skipLinks && /(?:https?:\/\/|www\.)\S+/i.test(text)) return null;
  if (!canRead(settings, m)) return null;
  text = limitChatWords(text.replace(/\[emote:\d+:([^\]]+)\]/g, "$1"));
  if (!text) return null;
  return {
    ...m,
    text,
    id: m.id || crypto.randomUUID(),
    displayName: m.displayName || m.user,
    time: m.time || Date.now(),
  };
}
function enqueue(m) {
  if (!settings.ttsEnabled) return;
  const msg = normalizeMessage(m);
  if (!msg) return;
  if (queue.length >= 100) {
    toast("Cola llena: se omitió el mensaje nuevo.");
    return;
  }
  queue.push(msg);
  renderQueue();
  pump();
}
const queueList = $("#queue-list");
const updateQueueRows = createQueueView(queueList, m => {
  const row = document.createElement("div");
  row.className = "queue-item";
  row.innerHTML = `${platformBadge(m.platform)}<div class="queue-copy"><strong>${esc(m.displayName)}</strong><small>${labels[m.platform]}</small><p>${esc(m.text)}</p></div><button class="icon-button" data-cast="${esc(m.id)}" title="Asignar personaje" aria-label="Asignar personaje a ${esc(m.displayName)}">♧</button><button class="icon-button" data-play="${esc(m.id)}" title="Leer ahora" aria-label="Leer mensaje">▷</button><button class="icon-button" data-remove="${esc(m.id)}" title="Quitar" aria-label="Quitar mensaje">×</button>`;
  return row;
}, '<div class="empty-state"><span>☵</span><strong>Tu próxima voz está por llegar</strong><p>Los mensajes de tus canales aparecerán aquí.</p></div>');
function renderQueue() {
  $("#queue-count").textContent = queue.length;
  $('#live-queue-count').textContent = queue.length;
  updateQueueRows(queue);
}
queueList.onclick = event => {
  const button = event.target.closest("button");
  if (!button || !queueList.contains(button)) return;
  if (button.dataset.remove) {
    queue = queue.filter(m => m.id !== button.dataset.remove);
    renderQueue();
  } else if (button.dataset.cast) {
    const m = queue.find(m => m.id === button.dataset.cast);
    if (m) openUser(m.platform, m.user, m.displayName);
  } else if (button.dataset.play) {
    safePlay();
    const i = queue.findIndex(m => m.id === button.dataset.play);
    if (i < 0) return;
    const [m] = queue.splice(i, 1);
    queue.unshift(m);
    paused = false; nextAt = 0; forceNext = true;
    updatePause(); stopCurrent(); pump(true);
  }
};

function pump(force = false) {
  force = force || forceNext;
  clearTimeout(pumpTimer);
  if (
    current ||
    pendingPreview ||
    !settings.ttsEnabled ||
    paused ||
    !armed ||
    (!settings.auto && !force) ||
    !queue.length
  )
    return;
  const delay = nextAt - Date.now();
  if (delay > 0 && !force) {
    pumpTimer = setTimeout(() => pump(), delay);
    return;
  }
  forceNext = false;
  const message = queue.shift();
  renderQueue();
  if (!canRead(settings, message) || containsBlockedPhrase(message.text, settings.blockedPhrases)) {
    pump();
    return;
  }
  run(message);
}
async function run(message) {
  if (!settings.ttsEnabled) { toast("El TTS está apagado. Enciéndelo para probar una voz."); return; }
  const profile =
    message.previewProfile ||
    settings.profiles[key(message.platform, message.user)] ||
    {};
  const candidate = profile.voice || settings.voice;
  const voice = (voiceList().some((v) => v.id === candidate) || ((account.voices == null || account.voices.includes(candidate)) && /^(fish|edge):[\w-]{1,100}$/.test(candidate || "")))
    ? candidate
    : (voiceList()[0]?.id || defaults.voice);
  const job = {
    message,
    voice,
    speed: settings.speed,
    preview: Boolean(message.previewVoice),
    abort: new AbortController(),
    started: false,
    cancelled: false,
  };
  let completeJob;
  job.done = new Promise(resolve => { completeJob = resolve; });
  current = job;
  $("#speech-error").textContent = "";
  $("#library-speech-error").textContent = "";
  updateStage(message, profile);
  $("#stage-status").innerHTML = "<i></i> Preparando…";
  const segments = message.soundId
    ? [{ type: "sound", id: message.soundId }]
    : speechSegments(message.text,
        { speaker: settings.readName ? message.displayName : "", expand: settings.expandAbbreviations, describeEmojis: settings.describeEmojis,
          sounds: settings.soundEffectsEnabled, reactions: settings.streamReactionsEnabled });
  try {
    for (const segment of segments) {
      if (job.cancelled) break;
      const taggedVoice = segment.voiceTag && catalog.requested.find(v => v.tag === segment.voiceTag);
      const segmentVoice = taggedVoice ? "fish:" + taggedVoice.id : voice;
      job.playingVoice = segmentVoice;
      job.betweenSegments = false;
      if (segment.type === "sound") {
        if (!settings.soundEffectsEnabled || cooldownNotice(job,segment.id)) continue;
        await soundsReady;
        if (job.cancelled) break;
        await playSoundEffect(audioContext, segment.id, customSoundFiles.has(segment.id), {
          signal: job.abort.signal,
          enabled: () => settings.soundEffectsEnabled && !job.cancelled,
          play: buffer => playDecoded(job, buffer, true, segment.id),
        });
      } else if (segmentVoice.startsWith("fish:")) {
        await playRemote(job, expressionSpeech(segment,"fish"), segmentVoice.slice(5), "fish");
      } else if (segmentVoice.startsWith("edge:")) {
        await playRemote(job, segment.text, segmentVoice.slice(5), "edge");
      } else throw Error("Elige una voz disponible.");
      await drainAudioOutput(job);
      job.betweenSegments = true;
      cancelAnimationFrame(mouthFrame);
      level = 0;
      setMouth($("#main-avatar"), 0);
      sendOverlay(0, true);
      job.cleanup?.();
      job.cleanup = null;
      job.source = null;
      job.pausePlayback = null;
      job.skipSound = null;
      job.cancel = null;
      analyser = null;
      gainNode = null;
    }
    if (!job.cancelled && job.hasSpoken) { total++; job.completed = true; }
  } catch (e) {
    if (!job.cancelled) {
      const error = e.message || "No se pudo reproducir la voz.";
      $("#speech-error").textContent = error;
      $("#library-speech-error").textContent = error;
      toast(error);
    }
  } finally {
    if (current === job) {
      job.cleanup?.();
      cancelAnimationFrame(mouthFrame);
      analyser = null;
      gainNode = null;
      nextAt = Date.now() + Number(settings.delay) * 1000;
      job.started = false;
      setMouth($("#main-avatar"), 0);
      if (job.completed && !job.cancelled) {
        blinkId = crypto.randomUUID();
        blinkAt = Date.now();
        sendOverlay(0, true);
        await mainPresence.update({ speaking: false, blinkId, blinkAt });
      }
      mainPresence.update({ speaking: false });
      sendOverlay(0, true);
      if (job.hasSpoken) await new Promise(resolve => setTimeout(resolve, SLIDE_MS));
      current = null;
      updateVoicePreviewControls();
      updateStage(null);
      completeJob();
      pump();
    } else completeJob();
  }
}
async function drainAudioOutput(job) {
  // onended fires on the render clock; allow the output device to play its tail
  // before disconnecting nodes or starting the next message.
  if (job.cancelled || !job.hasSpoken) return;
  const latency = (audioContext?.baseLatency || 0) + (audioContext?.outputLatency || 0);
  await new Promise(resolve => setTimeout(resolve, Math.min(350, Math.max(160, latency * 1000 + 80))));
}
function begin(job, sound = false) {
  if (job.cancelled) throw Error("Lectura cancelada.");
  job.playingSound = sound;
  job.started = true;
  updateLiveState();
  job.hasSpoken = true;
  mainPresence.update({ speaking: true });
  $("#stage-status").innerHTML = sound ? "<i></i> Sonido…" : "<i></i> Hablando";
  $("#stage-status").classList.add("live");
  animateMouth();
  updateVoicePreviewControls();
}
async function playRemote(job, text, voiceId, provider) {
  const r = await fetch("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId, provider, speed: job.speed }),
    signal: job.abort.signal,
  });
  if (!r.ok) {
    const e = await r.json();
    throw Error(e.error);
  }

  const buffer = await r.arrayBuffer();
  if (job.cancelled) return;
  if (!audioContext)
    throw Error("Haz clic en Probar una lectura para activar el audio.");
  await audioContext.resume();
  const decoded = await audioContext.decodeAudioData(buffer);
  if (job.cancelled) return;
  return playDecoded(job, decoded);
}
function playbackLevel(job) {
  return job.playingSound ? (settings.volume / 100) * (settings.soundVolume / 100)
    : playbackGain(settings.volume, settings.voiceVolumes, job.playingVoice || job.voice);
}
async function playDecoded(job, decoded, sound = false, soundId = null) {
  if (job.cancelled) return;
  await audioContext.resume();
  if (job.cancelled) return;
  job.playingSound = sound;
  return new Promise((resolve, reject) => {
    if (audioContext.state !== "running") {
      reject(
        Error("El navegador bloqueó el audio. Haz clic en Probar una lectura."),
      );
      return;
    }
    gainNode = audioContext.createGain();
    gainNode.gain.value = playbackLevel(job);
    const segmentGain = gainNode;
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const segmentAnalyser = analyser;
    analyser.connect(gainNode);
    gainNode.connect(audioContext.destination);
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    job.playbackOffset = 0;
    job.playbackPaused = false;
    let soundStarted = false;
    const startSource = async (offset) => {
      if (job.cancelled) return finish();
      const source = audioContext.createBufferSource();
      source.buffer = decoded;
      source.connect(analyser);
      job.source = source;
      job.playbackStartedAt = audioContext.currentTime;
      source.onended = () => {
        source.disconnect();
        if (job.source !== source || job.playbackPaused || job.cancelled) return;
        job.playbackOffset = decoded.duration;
        finish();
      };
      const start = () => {
        if (job.cancelled || (sound && !settings.soundEffectsEnabled)) return false;
        begin(job, sound);
        source.start(0, offset);
        return true;
      };
      try {
        if (sound && !soundStarted) {
          const allowed = await soundCooldown.start(soundId,start);
          if (!allowed) {
            source.disconnect();
            if (!job.cancelled) cooldownNotice(job,soundId);
            return finish();
          }
          soundStarted = true;
          updateSoundCooldownUI();
        } else if (!start()) { source.disconnect(); finish(); }
      } catch(error) {
        if (!settled) { settled = true; reject(error); }
      }
    };
    job.pausePlayback = () => {
      if (job.cancelled || settled) return;
      if (!job.playbackPaused) {
        job.playbackOffset = Math.min(decoded.duration,
          job.playbackOffset + Math.max(0, audioContext.currentTime - job.playbackStartedAt));
        job.playbackPaused = true;
        const source = job.source;
        job.source = null;
        try { source?.stop(); } catch {}
        job.started = false;
        cancelAnimationFrame(mouthFrame);
        level = 0;
        setMouth($("#main-avatar"), 0);
        mainPresence.update({ speaking: false });
        sendOverlay(0, true);
      } else {
        if (job.playbackOffset >= decoded.duration) return finish();
        job.playbackPaused = false;
        startSource(job.playbackOffset);
      }
      updateVoicePreviewControls();
    };
    job.cancel = () => {
      const source = job.source;
      job.source = null;
      try { source?.stop(); } catch {}
      finish();
    };
    job.skipSound = sound ? job.cancel : null;
    job.cleanup = () => {
      try { job.source?.disconnect(); } catch {}
      segmentAnalyser.disconnect();
      segmentGain.disconnect();
    };
    startSource(0);
  });
}
function stopCurrent() {
  if (!current) return;
  current.cancelled = true;
  current.abort.abort();
  current.cancel?.();
}
function updatePause() {
  $("#pause").textContent = paused ? "▷ Reanudar" : "Ⅱ Pausa cola";
  $('#pause').title = 'Pausar o reanudar la cola. La lectura actual continúa; usa Saltar para detenerla.';
  $('#pause').setAttribute('aria-pressed', String(paused));
  $('#pause').setAttribute('aria-label', paused ? 'Reanudar la cola' : 'Pausar la cola');
  updateLiveState();
  if (!current) updateStage(null);
}
function demo(useDefault = false) {
  if (!settings.ttsEnabled) { toast("Enciende el TTS para probar una voz."); return; }
  safePlay();
  const message = {
    platform: "test",
    user: $("#test-user").value.trim() || "invitado",
    text:
      $("#test-message").value.trim() ||
      "¡Hola, chat! Bienvenidos al stream. Hoy se viene un buen show.",
    displayName: $("#test-user").value.trim() || "invitado",
    ...(useDefault
      ? { previewProfile: { voice: settings.voice, avatar: settings.avatar } }
      : {}),
  };
  const m = normalizeMessage(message);
  if (!m) {
    toast("El mensaje está silenciado o fue omitido por tus filtros.");
    return;
  }
  if (paused || !settings.auto) { enqueue(m); return; }
  if (current) {
    queue.unshift(m);
    renderQueue();
    toast("Prueba agregada al principio de la cola.");
  } else {
    nextAt = 0;
    run(m);
  }
}
function updateUserField(prefix) {
  const platform = $(prefix === "user" ? "#user-platform" : "#reading-platform").value;
  const spec = userFields[platform];
  const input = $(prefix === "user" ? "#user-name" : "#reading-user");
  $(prefix === "user" ? "#user-name-label" : "#reading-user-label").textContent = spec.label;
  $(prefix === "user" ? "#user-name-help" : "#reading-user-help").textContent = spec.help;
  input.placeholder = spec.placeholder;
  input.setCustomValidity("");
}
function applyReadingFilters() {
  queue = queue.filter(message => canRead(settings, message));
  twitchReader.cancel(message=>!needsTwitchFollowerCheck(settings,message)&&!canRead(settings,message));
  if (current && !canRead(settings, current.message)) stopCurrent();
  renderQueue();
}
function renderReadingRules() {
  $("#reading-mode").value = settings.readingMode;
  $("#reading-filter-open").textContent = settings.readingMode === "only"
    ? `Filtro: solo usuarios permitidos (${Object.values(settings.profiles).filter(p => p.allowed && !p.blocked).length}) · Configurar`
    : "Filtro: todos salvo excluidos · Configurar";
  $("#reading-mode-hint").textContent = settings.readingMode === "only"
    ? "Solo se leerán mensajes de usuarios marcados como permitidos. Con la lista vacía no se lee ningún mensaje del chat."
    : "Se leerán todos los usuarios salvo los excluidos.";
  const rules = Object.entries(settings.profiles).filter(([, profile]) => profile.blocked || profile.allowed);
  $("#reading-rules").innerHTML = rules.length ? rules.map(([id, profile]) =>
    `<div class="user-row"><div class="row-copy"><strong>${esc(profile.displayName || profile.user)}</strong><p>${esc(labels[profile.platform])} · ${profile.blocked ? "Excluido: no se lee" : "Permitido en modo exclusivo"}</p><small>${esc(profile.user)}</small></div><button class="text-button" data-remove-rule="${esc(id)}">Quitar de la lista</button></div>`).join("")
    : '<p class="modal-note">Aún no hay usuarios excluidos ni permitidos.</p>';
  $("#reading-rules").querySelectorAll("[data-remove-rule]").forEach(button => button.onclick = () => {
    const profile = settings.profiles[button.dataset.removeRule];
    profile.blocked = profile.allowed = false;
    applyReadingFilters(); save(); renderProfiles();
  });
}
$("#reading-mode").onchange = event => {
  settings.readingMode = event.target.value === "only" ? "only" : "all";
  applyReadingFilters(); save(); renderReadingRules(); pump();
};
$("#reading-platform").onchange = () => { updateUserField("reading"); $("#reading-user-error").textContent = ""; };
$("#user-platform").onchange = () => { updateUserField("user"); $("#user-error").textContent = ""; };
$("#user-blocked").onchange = event => { if (event.target.checked) $("#user-allowed").checked = false; };
$("#user-allowed").onchange = event => { if (event.target.checked) $("#user-blocked").checked = false; };
$("#reading-user-form").onsubmit = event => {
  event.preventDefault();
  const platform = $("#reading-platform").value;
  let user;
  try { user = normalizeUser(platform, $("#reading-user").value); }
  catch (error) { $("#reading-user-error").textContent = error.message; return; }
  const id = key(platform, user), blocked = $("#reading-action").value === "blocked";
  settings.profiles[id] = { voice: settings.voice, avatar: settings.avatar,
    ...settings.profiles[id], platform, user, blocked, allowed: !blocked };
  $("#reading-user").value = ""; $("#reading-user-error").textContent = "";
  applyReadingFilters(); save(); renderProfiles();
  toast(blocked ? "Usuario excluido de la lectura." : "Usuario permitido en modo exclusivo.");
};
updateUserField("reading");
$("#reading-filter-open").onclick = () => setView("users");
function renderProfiles() {
  renderReadingRules();
  const profiles = Object.entries(settings.profiles);
  $("#user-count").textContent = profiles.length;
  $("#mini-users").innerHTML = profiles.length
    ? profiles
        .slice(0, 4)
        .map(
          ([id, p]) =>
            `<div class="mini-user"><span class="mini-avatar">${avatarSVG(p.avatar)}</span><div>${esc(p.displayName || p.user)}<small>${labels[p.platform]} · ${p.blocked ? "Silenciado" : esc(voiceName(p.voice))}</small></div><button class="text-button" data-edit-user="${esc(id)}">Editar</button></div>`,
        )
        .join("")
    : '<div class="empty-state"><span>♧</span><strong>Tu comunidad, tu elenco</strong><p>Asigna un personaje a tu primer usuario.</p></div>';
  $("#users-table").innerHTML = profiles.length
    ? profiles
        .map(
          ([id, p]) =>
            `<div class="user-row"><span class="mini-avatar">${avatarSVG(p.avatar)}</span><div class="row-copy"><strong>${esc(p.displayName || p.user)}</strong><p>${labels[p.platform]} · ${esc(voiceName(p.voice))} · ${avatars.find((a) => a.id === p.avatar)?.name || "Calcetín Arcoíris"} ${p.blocked ? "· Excluido" : p.allowed ? "· Permitido" : ""}</p><p>${esc(p.user)}</p></div><button class="button small secondary" data-edit-user="${esc(id)}">Editar</button><button class="text-button" data-delete-user="${esc(id)}">Eliminar</button></div>`,
        )
        .join("")
    : '<div class="empty-state"><span>♧</span><strong>Aún no has asignado personajes</strong><p>Agrega un usuario o elígelo desde la cola.</p></div>';
  document.querySelectorAll("[data-edit-user]").forEach(
    (b) =>
      (b.onclick = () => {
        const p = settings.profiles[b.dataset.editUser];
        openUser(p.platform, p.user, p.displayName);
      }),
  );
  document.querySelectorAll("[data-delete-user]").forEach(
    (b) =>
      (b.onclick = () => {
        delete settings.profiles[b.dataset.deleteUser];
        applyReadingFilters();
        save();
        renderProfiles();
      }),
  );
}
function openUser(platform = "twitch", user = "", displayName = "") {
  editingKey = user ? key(platform, user) : null;
  const p = settings.profiles[editingKey] || {};
  $("#user-platform").value = platform;
  $("#user-name").value = user;
  $("#user-name").dataset.displayName = displayName;
  $("#user-voice").value = p.voice || settings.voice;
  $("#user-avatar").value = p.avatar || settings.avatar;
  searchablePickers.get('user-voice')?.sync();
  searchablePickers.get('user-avatar')?.sync();
  $("#user-blocked").checked = Boolean(p.blocked);
  $("#user-allowed").checked = Boolean(p.allowed);
  $("#user-error").textContent = "";
  updateUserField("user");
  $("#user-dialog").showModal();
}
$("#user-form").onsubmit = (e) => {
  e.preventDefault();
  const platform = $("#user-platform").value;
  let user;
  try { user = normalizeUser(platform, $("#user-name").value); }
  catch (error) { $("#user-error").textContent = error.message; return; }
  const id = key(platform, user);
  if (editingKey && editingKey !== id) delete settings.profiles[editingKey];
  settings.profiles[id] = {
    platform,
    user,
    displayName:
      editingKey === id ? $("#user-name").dataset.displayName || user : user,
    voice: $("#user-voice").value,
    avatar: $("#user-avatar").value,
    blocked: $("#user-blocked").checked,
    allowed: $("#user-allowed").checked && !$("#user-blocked").checked,
  };
  applyReadingFilters();
  save();
  renderProfiles();
  $("#user-dialog").close();
  toast("Personaje guardado para " + user);
};
function volumeControl(v) {
  const value = voiceVolume(settings.voiceVolumes, v.id);
  return `<div class="voice-volume"><label><span>Volumen de esta voz</span><output>${value}%</output><input type="range" min="0" max="200" step="1" value="${value}" aria-label="Volumen de ${esc(v.name)} (${esc(v.id)})" data-voice-volume="${esc(v.id)}"></label><button class="text-button" data-reset-voice-volume="${esc(v.id)}">Restablecer 100%</button></div>`;
}
function applyCurrentVolume() {
  if (!current) return;
  const gain = playbackLevel(current);
  if (gainNode) gainNode.gain.setTargetAtTime(gain, audioContext.currentTime, 0.03);
  if (current.utterance) current.utterance.volume = Math.min(1, gain);
}
function libraryVoices() {
  let voices = voiceList();
  if (previewFilter === "free") voices = voices.filter(v => v.group === "free");
  else if (previewFilter === "fish") voices = voices.filter(v => v.group === "fish");
  else if (previewFilter === "recommended") {
    const recommended = new Set(catalog.requested.map(v => "fish:" + v.id));
    voices = voices.filter(v => recommended.has(v.id));
  }
  else voices = voices.filter(v => settings.favoriteVoices?.includes(v.id));
  const query = $("#voice-search").value.trim();
  if (query) voices = voices.filter(v => matchesSearch(`${v.name} ${v.language} ${v.id}`, query));
  return voices;
}
async function previewMessage(message) {
  if (!settings.ttsEnabled) { toast("Enciende el TTS para probar el audio."); return; }
  if (current && !current.preview) { toast("Espera a que termine la lectura del chat para probar el audio."); return; }
  const request = Symbol("preview");
  pendingPreview = request;
  const previous = current;
  if (previous) { stopCurrent(); await previous.done; }
  if (pendingPreview !== request) return;
  pendingPreview = null;
  if (!settings.ttsEnabled || (message.soundId && !settings.soundEffectsEnabled)) { pump(); return; }
  await run({ ...message, previewVoice: true });
}
function updateVoicePreviewControls() {
  const job = current?.preview ? current : null;
  $("#voice-library-controls").hidden = !job;
  if (!job) return;
  $("#voice-preview-toggle").textContent = job.playbackPaused ? "▷ Reanudar audio" : "Ⅱ Pausar audio";
  const name = job.message.soundId ? `Sonido {${job.message.soundId}}` : voiceName(job.playingVoice || job.voice);
  $("#voice-preview-status").textContent = job.playbackPaused
    ? `En pausa · ${name}`
    : job.started ? `Reproduciendo · ${name}` : `Preparando · ${name}`;
}
async function loadFishPage(reset = false) {
  const query = $("#voice-search").value.trim();
  if (loadingFishVoices) {
    if (reset) fishQueuedQuery = query;
    return;
  }
  if (reset) {
    fishSearchQuery = query;
    fishSearchPage = 0;
    remoteFishVoices = [];
    fishHasMore = false;
    fishTotal = 0;
  } else if (query !== fishSearchQuery) return loadFishPage(true);
  loadingFishVoices = true;
  renderVoiceLibrary();
  const page = fishSearchPage + 1;
  try {
    const params = new URLSearchParams({ page: String(page) });
    if (query) params.set("q", query);
    const data = await api(`/api/fish-voices?${params}`);
    if (query !== fishSearchQuery) return;
    const existing = new Set(remoteFishVoices.map(v => v.id));
    remoteFishVoices.push(...data.voices.filter(v => !existing.has(v.id)));
    fishSearchPage = page;
    fishHasMore = data.hasMore;
    fishTotal = data.total;
    refreshVoices();
  } catch (e) {
    if (query === fishSearchQuery) {
      $("#voice-results-count").textContent = e.message;
      toast(e.message);
    }
  } finally {
    loadingFishVoices = false;
    renderVoiceLibrary();
    const queued = fishQueuedQuery;
    fishQueuedQuery = null;
    if (queued !== null && queued !== fishSearchQuery) loadFishPage(true);
  }
}
function renderVoiceLibrary() {
  const allVoices = libraryVoices();
  const pages = Math.max(1, Math.ceil(allVoices.length / 9));
  voicePage = Math.min(voicePage, pages - 1);
  const voices = allVoices.slice(voicePage * 9, voicePage * 9 + 9);
  $('#voice-page').textContent = `Página ${voicePage + 1} de ${pages}`;
  $('#voice-prev').disabled = voicePage === 0;
  $('#voice-next').disabled = voicePage >= pages - 1;
  $('#voice-page-bottom').textContent = $('#voice-page').textContent;
  $('#voice-prev-bottom').disabled = voicePage === 0;
  $('#voice-next-bottom').disabled = voicePage >= pages - 1;
  $('#voice-pagination-bottom').hidden = pages <= 1;
  const fishMode = previewFilter === "fish";
  $("#voice-load-more").hidden = !fishMode || (!fishHasMore && fishSearchPage > 0);
  $("#voice-load-more").disabled = loadingFishVoices;
  $("#voice-load-more").textContent = loadingFishVoices ? "Cargando…" : "Cargar más voces";
  $("#voice-results-count").textContent = fishMode
    ? (fishSearchPage ? `${remoteFishVoices.length + catalog.requested.length} cargadas de ${fishTotal || "…"}${fishHasMore ? " · hay más" : ""}` : "Conecta tu clave Fish Audio para explorar las voces en español.")
    : `${allVoices.length} voces${previewFilter === "favorites" ? " favoritas" : previewFilter === "recommended" ? " recomendadas" : " disponibles"}`;
  const status = '<details class="voice-help"><summary>Cómo usar voces y comandos</summary><p>Edge funciona por Internet sin clave. Fish Audio requiere tu clave. Mezcla voces con {verity} Hola {chilena} ¿qué tal? Cada mensaje vuelve a su voz configurada.</p></details>';
  const cards = voices.map(v => {
    const isEdge = v.group === "free";
    const favorite = settings.favoriteVoices?.includes(v.id);
    const licensing = isEdge ? "Gratis · sin clave" : `Fish API${Number.isFinite(v.likes) ? " · ♥ " + v.likes.toLocaleString("es-CL") : " · seleccionada por el usuario"}${v.licensed === false ? " · licencia no verificada" : ""}`;
    const source = v.source ? ` · <a href="${esc(v.source)}" target="_blank" rel="noopener noreferrer">Ver voz</a>` : "";
    const selected = settings.voice === v.id;
    return `<div class="voice-item ${selected ? 'voice-selected' : ''}"><button class="text-button voice-favorite" type="button" data-voice-favorite="${esc(v.id)}" aria-pressed="${favorite ? "true" : "false"}" aria-label="${favorite ? "Quitar de favoritas" : "Agregar a favoritas"}: ${esc(v.name)}">${favorite ? "★" : "☆"}</button><strong>${esc(v.name)}</strong><p>${isEdge ? 'Edge · Gratis' : 'Fish Audio · Con API'}</p><div class="voice-actions"><button class="button secondary" data-voice-preview="${esc(v.id)}">▷ Escuchar</button><button class="button ${selected ? 'primary' : 'secondary'}" data-voice-default="${esc(v.id)}" aria-pressed="${selected}">${selected ? '✓ En uso' : 'Usar voz'}</button></div><details class="voice-extra"><summary>Volumen y detalles</summary><p>${esc(isEdge ? `Microsoft Edge TTS · ${v.language}` : `Fish Audio · Español · ${licensing}`)}${source}</p>${volumeControl(v)}</details></div>`;
  }).join("");
  $("#voice-library").innerHTML = status + (cards || '<div class="voice-library-empty">No hay voces en esta vista. Si buscas voces Fish, usa la opción «Voces con API Fish» y escribe parte del nombre o carga más resultados.</div>');
  $("#voice-library").querySelectorAll("[data-voice-volume]").forEach(input => {
    input.oninput = () => {
      settings.voiceVolumes[input.dataset.voiceVolume] = Number(input.value);
      input.closest("label").querySelector("output").textContent = input.value + "%";
      applyCurrentVolume(); save();
    };
  });
  $("#voice-library").querySelectorAll("[data-reset-voice-volume]").forEach(button => {
    button.onclick = () => {
      delete settings.voiceVolumes[button.dataset.resetVoiceVolume];
      const control = button.closest(".voice-volume");
      control.querySelector("input").value = 100;
      control.querySelector("output").textContent = "100%";
      applyCurrentVolume(); save();
    };
  });
  $("#voice-library").querySelectorAll("[data-voice-favorite]").forEach(button => {
    button.onclick = () => {
      const id = button.dataset.voiceFavorite;
      const favorites = new Set(settings.favoriteVoices || []);
      if (favorites.has(id)) { favorites.delete(id); delete settings.favoriteVoiceMeta[id]; }
      else {
        favorites.add(id);
        const selected = voiceList().find(v => v.id === id);
        if (selected) settings.favoriteVoiceMeta[id] = selected;
      }
      settings.favoriteVoices = [...favorites];
      save(); renderVoiceLibrary(); refreshVoices();
    };
  });
  $("#voice-library").querySelectorAll("[data-voice-preview]").forEach(button => {
    button.onclick = async () => {
      safePlay();
      const voice = button.dataset.voicePreview;
      if (current?.preview && !current.message.soundId && current.voice === voice) {
        current.pausePlayback?.();
        return;
      }
      const m = {
        platform: "test", user: "preview", displayName: "Prueba de voz",
        text: "Hola, comunidad. Esta es mi voz. ¿Listos para comenzar el stream?",
        id: crypto.randomUUID(), previewVoice: true,
        previewProfile: { voice, avatar: settings.avatar },
      };
      const preview = previewMessage(m);
      updateVoicePreviewControls();
      await preview;
    };
  });
  $("#voice-library")
    .querySelectorAll("[data-voice-default]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          settings.voice = b.dataset.voiceDefault;
          save();
          refreshVoices();
          if (!current) updateStage(null);
          toast("Voz predeterminada actualizada.");
        }),
    );
  updateVoicePreviewControls();
}
let voiceSearchTimer;
$("#voice-filter").value = previewFilter;
$("#voice-filter").onchange = (e) => {
  voicePage = 0;
  previewFilter = e.target.value;
  renderVoiceLibrary();
  if (previewFilter === "fish") loadFishPage(true);
};
$("#voice-search").oninput = () => {
  voicePage = 0;
  clearTimeout(voiceSearchTimer);
  renderVoiceLibrary();
  if (previewFilter === "fish") voiceSearchTimer = setTimeout(() => loadFishPage(true), 350);
  else renderVoiceLibrary();
};
$("#voice-load-more").onclick = () => loadFishPage(false);
for (const id of ['voice-prev', 'voice-prev-bottom', 'voice-next', 'voice-next-bottom']) {
  $('#' + id).onclick = () => {
    voicePage += id.startsWith('voice-prev') ? -1 : 1;
    renderVoiceLibrary(); $('#voice-library').scrollIntoView({block: 'start'});
  };
}
$("#voice-preview-toggle").onclick = () => {
  if (current?.preview && current.pausePlayback) current.pausePlayback();
  else toast("No hay una prueba de voz reproduciéndose.");
};
$("#voice-preview-stop").onclick = () => {
  pendingPreview = null;
  if (current?.preview) stopCurrent();
};
function renderConnections() {
  renderDashboard();
  const active = connectionList.filter((c) => c.state === "connected").length;
  $('#stage-connect').hidden=active > 0;
  $('#stage-idle-help').textContent=active ? 'Esperando mensajes del canal o una prueba.' : 'Conecta un canal o prueba un mensaje.';
  updateLiveState();
  $('#nav-connection-state').textContent = active ? `${active} conectado${active === 1 ? '' : 's'}` : 'Sin conexión';
  $("#connection-summary").textContent = connectionList.length
    ? `${active} conectado${active === 1 ? "" : "s"} · ${connectionList.length > 1 ? "Multistream" : "Un canal"}`
    : "Conecta tu primera plataforma";
  $("#channel-pills").innerHTML = connectionList.length
    ? connectionList
        .map(
          (c) =>
            `<button class="channel-chip ${c.state === "error" ? "error" : ""}" title="${esc(c.detail)}" data-channel-view>${platformBadge(c.platform)}${esc(c.channel)}<i></i></button>`,
        )
        .join("")
    : ["twitch","tiktok","kick","youtube","starvios"].map(platformBadge).join("") + '<span class="muted">5 plataformas · una sola cola</span>';
  document
    .querySelectorAll("[data-channel-view]")
    .forEach((b) => (b.onclick = () => setView("connections")));
  const states = {
    connected: "Conectado",
    connecting: "Conectando",
    waiting: "Esperando webhook",
    error: "Error",
    reconnecting: "Reconectando",
  };
  $("#connections-list").innerHTML = connectionList.length
    ? connectionList
        .map(
          (c) =>
            `<div class="connection-row">${platformBadge(c.platform)}<div class="row-copy"><strong>${esc(c.channel)}</strong><p>${esc(c.detail)}</p></div><span class="row-state ${c.state}">${states[c.state] || c.state}</span>${c.state === "error" ? `<button class="button small secondary" data-retry="${c.id}">Reconectar</button>` : ""}<button class="text-button" data-disconnect="${c.id}">Desconectar</button></div>`,
        )
        .join("")
    : '<div class="empty-state"><span>⌁</span><strong>No hay canales conectados</strong><p>Agrega Twitch, TikTok LIVE, Kick, YouTube Live o Starvios.</p></div>';
  $("#connections-list")
    .querySelectorAll("[data-disconnect]")
    .forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            await api("/api/disconnect", { id: b.dataset.disconnect });
          } catch (e) {
            toast(e.message);
            b.disabled = false;
          }
        }),
    );
  $("#connections-list")
    .querySelectorAll("[data-retry]")
    .forEach(
      (b) =>
        (b.onclick = async () => {
          const c = connectionList.find((c) => c.id === b.dataset.retry);
          b.disabled = true;
          try {
            await api("/api/disconnect", { id: c.id });
            await api("/api/connect", {
              platform: c.platform,
              channel: c.channel,
            });
          } catch (e) {
            toast(e.message);
            b.disabled = false;
          }
        }),
    );
}
function connectHelp() {
  if(account.channels) $("#channel").value=$("#platform").value==='youtube'?'':(account.channels[$("#platform").value]?.[0]||"");
  const p = $("#platform").value;
  const texts = {
    twitch:
      "Ingresa el nombre del streamer o su URL de Twitch. Se intentará conectar en modo lectura anónima; puedes configurar OAuth si lo necesitas.",
    tiktok:
      "Ingresa @usuario o la URL de su perfil. El streamer debe estar en LIVE. Conector no oficial sujeto a cambios de TikTok.",
    starvios: "Ingresa @usuario o la URL de Starvios. El canal debe estar en directo y su chat debe ser público. Lectura sin iniciar sesión; conector no oficial.",
    kick: "Ingresa el nombre o la URL del canal de Kick. Lectura pública sin cuenta del streamer, token ni webhook; conector no oficial. La integración oficial es opcional en Ajustes.",
    youtube:
      "Pega la URL del video en directo (youtube.com/watch?v=…). Requiere una API key de YouTube Data API v3 en Ajustes.",
  };
  $("#connect-help").textContent = texts[p];
  document.querySelectorAll("[data-platform-choice]").forEach(button => button.setAttribute("aria-pressed",String(button.dataset.platformChoice===p)));
  $("#channel").placeholder =
    p === "youtube"
      ? "https://youtube.com/watch?v=…"
      : p === "tiktok"
        ? "@nombre_del_streamer"
        : "Nombre del streamer";
}
document.querySelectorAll('[data-platform-choice]').forEach(button => {
  button.onclick = () => { $('#platform').value = button.dataset.platformChoice; connectHelp(); };
});
$('#sound-open').onclick = () => $('#sound-dialog').showModal();
$('#nav-sounds').onclick = () => $('#sound-dialog').showModal();
$("#connect-form").onsubmit = async (e) => {
  e.preventDefault();
  safePlay();
  const b = e.submitter;
  b.disabled = true;
  $("#connect-error").textContent = "";
  try {
    await api("/api/connect", {
      platform: $("#platform").value,
      channel: $("#channel").value,
    });
    $("#connect-dialog").close();
    $("#channel").value = "";
    toast("Conexión iniciada. Revisa su estado en Conexiones.");
  } catch (e) {
    $("#connect-error").textContent = e.message;
  } finally {
    b.disabled = false;
  }
};
async function openSettings() {
  try {
    const d = await api("/api/config");
    configured = d.configured;
    $('#credential-storage-note').textContent=d.credentialPersistence ? 'Las claves se guardan cifradas en este equipo. Puedes mostrarlas o escribir una nueva para reemplazarlas.' : 'Las claves se conservan solo mientras esta aplicación esté abierta. Puedes mostrarlas o escribir una nueva para reemplazarlas.';
    $("#kick-ready").checked = d.webhookReady;
    $("#fish-model").value = d.fishModel || "s2.1-pro-free";
    for (const input of $("#settings-form").querySelectorAll('input[type="password"][name]')) {
      input.value=''; input.type='password'; input.placeholder=configured[input.name] ? '•••••••• · guardada' : 'Sin configurar';
      input.parentElement.querySelector('.secret-status').textContent=configured[input.name] ? 'Clave guardada' : 'Sin clave guardada';
      input.parentElement.querySelector('.secret-toggle').textContent='Mostrar';
    }
  } catch (e) {
    toast(e.message);
  }
  $('#blocked-phrases').value=settings.blockedPhrases.join('\n');
  $('#appearance-display-name').value=settings.displayName || '';
  $('#appearance-backgrounds').checked=settings.appearance.backgrounds !== false;
  $('#appearance-glass').checked=settings.appearance.glass !== false;
  for (const key of ['mode','theme','font','accent','background','foreground']) $(`#appearance-${key}`).value=settings.appearance[key];
  if (!$('#appearance-theme').value) $('#appearance-theme').value='custom';
  if (settings.appearance.mode==='system' && appearanceThemes[settings.appearance.theme]) setThemeFields();
  updateThemePreview();
  selectSettingsTab('appearance');
  $("#settings-dialog").showModal();
}
function selectSettingsTab(name) {
  document.querySelectorAll('[data-settings-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.settingsTab===name)));
  document.querySelectorAll('[data-settings-panel]').forEach(panel=>{panel.hidden=panel.dataset.settingsPanel!==name;});
}
document.querySelectorAll('[data-settings-tab]').forEach(button=>button.addEventListener('click',()=>selectSettingsTab(button.dataset.settingsTab)));
const themeSelect=$('#appearance-theme');
themeSelect.add(new Option('Personalizado', 'custom'));
for (const [id, theme] of Object.entries(appearanceThemes)) themeSelect.add(new Option(theme.name, id));
function currentAppearanceMode() {
  const mode=$('#appearance-mode').value;
  return mode==='light'||(mode==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
}
function updateThemePreview() {
  for(const key of ['accent','background','foreground']) $(`#preview-${key}`).style.background=$(`#appearance-${key}`).value;
  $('#theme-preview-label').textContent=themeSelect.value==='custom' ? 'Estilo personalizado' : `Vista previa · ${appearanceThemes[themeSelect.value]?.name || ''}`;
}
function setThemeFields() {
  const palette=appearancePalette(themeSelect.value,currentAppearanceMode());
  if(palette) for(const key of ['accent','background','foreground']) $(`#appearance-${key}`).value=palette[key];
  updateThemePreview();
}
themeSelect.addEventListener('change',setThemeFields);
$('#appearance-mode').addEventListener('change',()=>{
  if(themeSelect.value!=='custom') setThemeFields();
  else updateThemePreview();
});
for(const key of ['accent','background','foreground']) $(`#appearance-${key}`).addEventListener('input',()=>{themeSelect.value='custom';updateThemePreview();});
$('#appearance-reset').addEventListener('click',()=>{
  if(themeSelect.value!=='custom') setThemeFields();
  else {
    const reset={...defaults.appearance,...appearancePalettes[currentAppearanceMode()]};
    for(const key of ['font','accent','background','foreground']) $(`#appearance-${key}`).value=reset[key];
    updateThemePreview();
  }
});
for(const input of $('#settings-form').querySelectorAll('input[type="password"][name]')) {
  const status=document.createElement('small');status.className='secret-status';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='secret-toggle';toggle.textContent='Mostrar';
  toggle.addEventListener('click',async()=>{
    try {
      if(input.type==='text'){input.type='password';toggle.textContent='Mostrar';return;}
      if(!input.value&&configured[input.name]){const result=await api('/api/settings/reveal',{name:input.name});input.value=result.value;}
      input.type='text';toggle.textContent='Ocultar';
    } catch(e){toast(e.message);}
  });
  input.insertAdjacentElement('afterend',toggle);toggle.insertAdjacentElement('afterend',status);
}
$('#settings-dialog').addEventListener('close',()=>{for(const input of $('#settings-form').querySelectorAll('input[name]')){input.value='';if(input.type==='text'&&input.name!=='TWITCH_USERNAME')input.type='password';}});
$("#settings-form").onsubmit = async (e) => {
  e.preventDefault();
  const b = e.submitter;
  b.disabled = true;
  $("#settings-error").textContent = "";
  try {
    const data = Object.fromEntries(new FormData(e.target));
    const credentialsChanged=Object.entries(data).some(([name,value])=>name!=='FISH_MODEL' && typeof value==='string' && value.trim());
    data.webhookReady = $("#kick-ready").checked;
    await api("/api/settings", data);
    settings.skipCommands = $("#skip-commands").checked;
    settings.skipLinks = $("#skip-links").checked;
    settings.maxChars = Number($("#max-chars").value);
    settings.expandAbbreviations = $("#expand-abbreviations").checked;
    settings.describeEmojis = $("#describe-emojis").checked;
    settings.streamReactionsEnabled = $("#stream-reactions").checked;
    settings.blockedPhrases=[...new Set($('#blocked-phrases').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean))];
    settings.displayName=$('#appearance-display-name').value.trim().slice(0,50);
    settings.appearance={...Object.fromEntries(['mode','theme','font','accent','background','foreground'].map(key=>[key,$(`#appearance-${key}`).value])),backgrounds:$('#appearance-backgrounds').checked,glass:$('#appearance-glass').checked};
    save();
    applyAppearance();
    renderDashboard();
    for (const input of e.target.querySelectorAll("input[name]"))
      input.value = "";
    $("#settings-dialog").close();
    toast(
      credentialsChanged ? "Ajustes guardados. Reconecta los canales para aplicar las credenciales nuevas." : "Ajustes guardados.",
    );
    await loadRemote();
    if(settings.twitchAudience === 'followers') refreshTwitchFollowerStatus();
  } catch (e) {
    $("#settings-error").textContent = e.message;
  } finally {
    b.disabled = false;
  }
};
function setView(view) {
  currentView = view;
  document.body.dataset.currentView = view;
  const titles = {
    studio: [
      "Estudio",
      "Estudio en directo",
      "Controla la lectura y los mensajes de tu comunidad.",
    ],
    voices: [
      "Voces y avatares",
      "El casting de tu stream",
      "Encuentra una voz y un personaje para cada momento.",
    ],
    users: [
      "Usuarios",
      "Cada usuario, su personaje",
      "Personalidad propia para las voces de tu comunidad.",
    ],
    connections: [
      "Conexiones",
      "Todos tus chats, juntos",
      "Un canal o multistream: el show sucede en un solo lugar.",
    ],
  };
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $(`#${view}-view`).classList.remove("hidden");
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => {
      b.classList.toggle("active", b.dataset.view === view);
      if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  $("#page-name").textContent = titles[view][0];
  $("#page-title").innerHTML = esc(titles[view][1]) + "<span>.</span>";
  $("#page-subtitle").textContent = titles[view][2];
  window.scrollTo(0, 0);
}
function setLibraryTab(name) {
  for (const type of ['voices', 'avatars']) {
    const active = name === type;
    const button = $('#tab-' + type);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    $(type === 'voices' ? '#voice-panel' : '#avatar-panel').hidden = !active;
  }
}
for (const type of ['voices', 'avatars']) {
  $('#tab-' + type).onclick = () => setLibraryTab(type);
  $('#tab-' + type).onkeydown = event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 'voices' : event.key === 'End' ? 'avatars' : type === 'voices' ? 'avatars' : 'voices';
      setLibraryTab(next); $('#tab-' + next).focus();
    }
  };
}
function renderTwitchAudience() {
  const mode = normalizeTwitchAudience(settings.twitchAudience);
  $('#twitch-audience-label').textContent = twitchAudiences[mode].short;
  $('#twitch-audience-open').setAttribute('aria-label', 'Leer en Twitch: ' + twitchAudiences[mode].label);
  $('#twitch-audience-open').title = 'Leer en Twitch: ' + twitchAudiences[mode].label;
  document.querySelectorAll('[data-twitch-audience]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.twitchAudience===mode)));
  const descriptions = {
    all:'Se leerán todos los usuarios de Twitch que permitan tus filtros.',
    moderators:'Se leerán los moderadores y el dueño del canal.',
    subscribers:'Se leerán moderadores, suscriptores y el dueño del canal.',
  };
  $('#twitch-audience-note').textContent = mode === 'followers'
    ? (twitchFollowerState?.message || 'Comprobando el permiso para verificar seguidores…') + (twitchFollowerState?.ready === false ? ' Los moderadores y suscriptores siguen disponibles; los seguidores sin verificar no se leerán.' : '')
    : descriptions[mode];
  $('#twitch-followers-settings').hidden = mode !== 'followers' || twitchFollowerState?.ready !== false;
  $('#twitch-followers-settings').textContent = twitchFollowerState?.action === 'connect' ? 'Conectar Twitch' : 'Configurar Twitch';
  $('#twitch-audience-open').classList.toggle('audience-needs-setup',mode==='followers'&&twitchFollowerState?.ready===false);
  positionTwitchAudience();
}
async function refreshTwitchFollowerStatus() {
  const request = ++followerStatusRequest;
  try {
    const state = await api('/api/twitch/follower-status');
    if(request!==followerStatusRequest)return;
    twitchFollowerState=state;
  } catch(error) {
    if(request!==followerStatusRequest)return;
    twitchFollowerState={ready:false,message:error.message};
  }
  renderTwitchAudience();
}
const audiencePanel = $('#twitch-audience-panel');
function positionTwitchAudience() {
  if(!audiencePanel.matches(':popover-open'))return;
  const anchor = $('#twitch-audience-open').getBoundingClientRect();
  const width = Math.min(370,innerWidth-24);
  audiencePanel.style.width = width+'px';
  audiencePanel.style.maxHeight = (innerHeight-24)+'px';
  const height = audiencePanel.getBoundingClientRect().height;
  const above = anchor.top > innerHeight/2;
  audiencePanel.style.maxHeight = Math.max(120,above?anchor.top-20:innerHeight-anchor.bottom-20)+'px';
  audiencePanel.style.left = Math.max(12,Math.min(anchor.right-width,innerWidth-width-12))+'px';
  audiencePanel.style.top = (above?Math.max(12,anchor.top-height-8):anchor.bottom+8)+'px';
}
$('#twitch-audience-open').onclick = () => {
  if(audiencePanel.matches(':popover-open')){audiencePanel.hidePopover();return;}
  audiencePanel.showPopover();positionTwitchAudience();
  audiencePanel.querySelector('[aria-pressed=true]').focus({preventScroll:true});
  if(settings.twitchAudience==='followers')refreshTwitchFollowerStatus();
};
audiencePanel.addEventListener('toggle',event=>$('#twitch-audience-open').setAttribute('aria-expanded',String(event.newState==='open')));
window.addEventListener('resize',positionTwitchAudience);
window.addEventListener('scroll',positionTwitchAudience,true);
for(const button of document.querySelectorAll('[data-twitch-audience]'))button.onclick=()=>{
  settings.twitchAudience=normalizeTwitchAudience(button.dataset.twitchAudience);
  twitchFollowerState=null;save();applyReadingFilters();renderTwitchAudience();
  audiencePanel.hidePopover();$('#twitch-audience-open').focus({preventScroll:true});
  if(settings.twitchAudience==='followers')refreshTwitchFollowerStatus();
  toast('Lectura en Twitch: '+twitchAudiences[settings.twitchAudience].label);
};
$('#twitch-followers-settings').onclick=async()=>{
  audiencePanel.hidePopover();
  if(twitchFollowerState?.action === 'connect') {
    $('#platform').value='twitch'; $('#platform').onchange?.({target:$('#platform')}); openConnect(); return;
  }
  await openSettings();
  $('#twitch-settings').open=true;
  $('#twitch-settings input[name=TWITCH_OAUTH_TOKEN]').focus();
};
const events = new EventSource("/api/events");
events.addEventListener("connections", (e) => {
  const nextConnections=JSON.parse(e.data);
  for(const connection of nextConnections) {
    const previous=connectionList.find(item=>item.id===connection.id);
    if(previous && previous.state!==connection.state) addDashboardActivity(`${labels[connection.platform] || 'Canal'}: ${connection.state==='connected'?'conectado':connection.state==='error'?'error de conexión':'estado actualizado'}`);
    else if(!previous && connection.state==='connected') addDashboardActivity(`${labels[connection.platform] || 'Canal'}: conectado`);
  }
  connectionList = nextConnections;
  renderConnections();
  if(settings.twitchAudience === 'followers') refreshTwitchFollowerStatus();
});
events.addEventListener("chat", (e) => {const message=JSON.parse(e.data); addDashboardActivity(`Mensaje recibido en ${labels[message.platform] || "un canal"}`); if(settings.ttsEnabled)twitchReader.receive(message);});
events.addEventListener("notice", (e) => toast(JSON.parse(e.data).text));
events.addEventListener("delete", (e) => {
  const { id } = JSON.parse(e.data);
  queue = queue.filter((m) => m.id !== id);
  twitchReader.cancel(message=>message.id===id);
  if (current?.message.id === id) stopCurrent();
  renderQueue();
});
events.addEventListener("purge", (e) => {
  const d = JSON.parse(e.data);
  const affected = (m) =>
    m.platform === d.platform &&
    m.channel === d.channel &&
    (!d.user || m.user.toLowerCase() === d.user.toLowerCase());
  queue = queue.filter((m) => !affected(m));
  twitchReader.cancel(affected);
  if (current && affected(current.message)) stopCurrent();
  renderQueue();
});
let sseError = false;
events.onerror = () => {
  if (!sseError) {
    toast("Servidor desconectado. Intentando recuperar la conexión…");
    sseError = true;
    void fetch('/api/auth/me').then(r=>{if(r.status===401)location.replace('/login');}).catch(()=>{});
  }
};
events.onopen = () => {
  sseError = false;
  sendOverlay(level, true);
};
$("#volume").value = settings.volume;
$("#volume-out").textContent = settings.volume + "%";
$("#speed").value = Math.round(settings.speed * 100);
$("#speed-out").textContent = `${Math.round(settings.speed * 100)}%`;
$("#delay").value = settings.delay;
$("#delay-out").textContent = settings.delay + " s";
$("#read-name").checked = settings.readName;
$("#auto-read").checked = settings.auto;
$("#skip-commands").checked = settings.skipCommands;
$("#skip-links").checked = settings.skipLinks;
$("#max-chars").value = 55;
$("#expand-abbreviations").checked = settings.expandAbbreviations !== false;
$("#describe-emojis").checked = settings.describeEmojis !== false;
$("#stream-reactions").checked = settings.streamReactionsEnabled !== false;
$("#sound-effects-enabled").checked = settings.soundEffectsEnabled !== false;
$("#sound-volume").value = settings.soundVolume;
$("#sound-volume-out").textContent = settings.soundVolume + "%";
$("#sound-effects-enabled").onchange = e => {
  settings.soundEffectsEnabled = e.target.checked;
  if (!settings.soundEffectsEnabled && current?.playingSound) current.skipSound?.();
  save();
};
$("#sound-stop").onclick = () => {
  pendingPreview = null;
  if (current?.preview) stopCurrent();
};
$("#sound-volume").oninput = e => {
  settings.soundVolume = Number(e.target.value);
  $("#sound-volume-out").textContent = settings.soundVolume + "%";
  applyCurrentVolume(); save();
};
function updateSoundCooldownUI() {
  const remaining = soundCooldown.remaining(90);
  const seconds = Math.ceil(remaining / 1000);
  const label = $("[data-sound-cooldown='90']");
  if (label) label.textContent = remaining
    ? `1 vez cada 5 min · disponible en ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,"0")}`
    : "1 vez cada 5 min · disponible";
  const button = $("[data-test-sound='90']");
  if (button) {
    button.disabled = remaining > 0;
    button.title = remaining ? "El remix está en espera." : "Probar remix";
  }
}
function renderSoundCatalog() {
  $("#sound-open small").textContent = `${soundEffects.length} efectos · usa códigos como {200}`;
  const includedCount = Object.keys(bundledSounds).length;
  $("#sound-inventory").textContent = `Incluye ${includedCount} clips de YouTube y ${soundEffects.length - includedCount} recreaciones sintetizadas.`;
  $("#sound-catalog").innerHTML = soundEffects.map(effect => {
    const file = customSoundFiles.get(effect.id);
    const included = bundledSounds[effect.id];
    const includedLabel = included ? `Audio de YouTube · ${included.duration.toFixed(1)} s${included.fullLength ? " · completo" : ""} · <a href="${esc(included.source)}" target="_blank" rel="noopener noreferrer">Ver fuente</a>` : "Recreación sintetizada";
    return `<div class="sound-catalog-row"><code>{${effect.id}}</code><div class="sound-copy"><span>${esc(effect.name)}</span><small>${file ? `Archivo: ${esc(file.name)} · ${file.duration.toFixed(1)} s` : includedLabel}</small>${included?.trigger ? `<small>Chat: «${esc(included.trigger)}»</small>` : ""}${effect.id === 90 ? '<small data-sound-cooldown="90"></small>' : ""}</div><div class="sound-actions"><button type="button" class="icon-button" data-test-sound="${effect.id}" aria-label="Probar ${esc(effect.name)}">▷</button><button type="button" class="text-button" data-import-sound="${effect.id}" aria-label="Importar audio para ${esc(effect.name)}">${file ? "Cambiar audio" : "Importar audio"}</button>${file ? `<button type="button" class="text-button" data-reset-sound="${effect.id}" aria-label="Restablecer ${esc(effect.name)}">Restablecer</button>` : ""}</div></div>`;
  }).join("");
  filterSounds();
  updateSoundCooldownUI();
  $("#sound-catalog").querySelectorAll("[data-test-sound]").forEach(button => {
    button.onclick = async () => {
      if (!settings.ttsEnabled) { toast("Enciende el TTS para probar un sonido."); return; }
      if (!settings.soundEffectsEnabled) { toast("Activa los efectos de sonido para probarlos."); return; }
      safePlay();
      const soundId = Number(button.dataset.testSound);
      await previewMessage({ platform: "test", user: "sonidos", displayName: "Efectos de sonido",
        text: `{${soundId}}`, soundId });
    };
  });
  $("#sound-catalog").querySelectorAll("[data-import-sound]").forEach(button => {
    button.onclick = () => {
      const picker = $("#sound-file");
      picker.dataset.soundId = button.dataset.importSound;
      picker.click();
    };
  });
  $("#sound-catalog").querySelectorAll("[data-reset-sound]").forEach(button => {
    button.onclick = async () => {
      button.disabled = true;
      const id = Number(button.dataset.resetSound);
      try {
        await removeSoundFile(id); customSoundFiles.delete(id);
        renderSoundCatalog(); toast(`Sonido {${id}} restablecido ${bundledSounds[id] ? "al audio incluido" : "a la recreación sintetizada"}.`);
      } catch(e) { toast(e.message); button.disabled = false; }
    };
  });
}
$("#sound-file").onchange = async event => {
  const picker = event.target;
  const file = picker.files[0];
  const id = Number(picker.dataset.soundId);
  picker.value = "";
  if (!file) return;
  $("#sound-file-status").textContent = `Comprobando audio para {${id}}…`;
  try {
    safePlay();
    const metadata = await importSoundFile(audioContext,id,file);
    customSoundFiles.set(id,metadata);
    renderSoundCatalog();
    $("#sound-file-status").textContent = `Audio guardado para {${id}}. Pulsa ▷ para escucharlo.`;
  } catch(e) { $("#sound-file-status").textContent = e.message; }
};
function filterSounds() {
  const normalize = text => String(text).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
  const query = normalize($("#sound-search").value.trim());
  let count = 0;
  $("#sound-catalog").querySelectorAll(".sound-catalog-row").forEach(row => {
    row.hidden = !normalize(row.textContent).includes(query);
    if (!row.hidden) count++;
  });
  $("#sound-count").textContent = `${count} de ${soundEffects.length} sonidos${count ? " · Usa {número} en el chat" : " · Sin coincidencias"}`;
}
$("#sound-search").oninput = filterSounds;
renderSoundCatalog();
setInterval(updateSoundCooldownUI,1000);
window.addEventListener("storage", updateSoundCooldownUI);
const soundsReady = listSoundFiles().then(files => {
  for (const file of files) customSoundFiles.set(file.id,file);
  renderSoundCatalog();
}).catch(() => {
  $("#sound-file-status").textContent = "El navegador no permite guardar archivos de audio. Las recreaciones sintetizadas siguen disponibles.";
});
$("#volume").oninput = (e) => {
  settings.volume = Number(e.target.value);
  $("#volume-out").textContent = settings.volume + "%";
  applyCurrentVolume();
  save();
};
$("#speed").oninput = (e) => {
  settings.speed = Number(e.target.value) / 100;
  $("#speed-out").textContent = e.target.value + "%";
  save();
};
$("#delay").oninput = (e) => {
  settings.delay = Number(e.target.value);
  $("#delay-out").textContent = settings.delay + " s";
  save();
};
$("#read-name").onchange = (e) => {
  settings.readName = e.target.checked;
  save();
};
$("#auto-read").onchange = (e) => {
  settings.auto = e.target.checked;
  save();
  $("#auto-hint").textContent = settings.auto
    ? "Los mensajes entran en la cola"
    : "Usa ▷ en la cola para leer cada mensaje";
  safePlay();
  pump();
};
$("#default-voice").onchange = (e) => {
  settings.voice = e.target.value;
  save();
  voiceHint();
  if (!current) updateStage(null);
};
function updateTtsControls() {
  $("#tts-toggle").textContent = settings.ttsEnabled ? "⏻ Apagar" : "⏻ Activar";
  $('#tts-toggle').title = settings.ttsEnabled ? 'Apagar la lectura y descartar mensajes pendientes' : 'Activar la lectura de mensajes';
  $("#tts-toggle").setAttribute("aria-pressed", String(settings.ttsEnabled));
  $("#tts-hint").textContent = settings.ttsEnabled
    ? "Encendido · recibe mensajes nuevos. Apagar detiene la lectura y descarta pendientes."
    : "Apagado · no lee ni acumula mensajes. Los canales siguen conectados.";
  $("#pause").disabled = !settings.ttsEnabled;
  updateLiveState();
}
function updateLiveState() {
  const connected = connectionList.some(c => c.state === 'connected');
  const state = !settings.ttsEnabled ? 'Lectura apagada' : paused ? 'Cola pausada' : current?.started ? (current.playingSound ? 'Reproduciendo un efecto' : 'Leyendo un mensaje') : current ? 'Preparando voz…' : $('#speech-error').textContent ? 'Revisa la voz configurada' : connected ? 'Listo para leer' : 'Listo · sin canal conectado';
  $('#skip').disabled = !current && !pendingPreview;
  $('#skip').title = $('#skip').disabled ? 'No hay una lectura en curso para saltar' : 'Saltar la lectura actual';
  const label = $('#live-status');
  if (label.textContent !== state) label.textContent = state;
  label.dataset.state = !settings.ttsEnabled ? 'off' : paused ? 'paused' : current?.started ? 'speaking' : 'ready';
}
$("#tts-toggle").onclick = async () => {
  settings.ttsEnabled = !settings.ttsEnabled;
  if (!settings.ttsEnabled) {
    twitchReader.cancel();
    pendingPreview = null;
    clearTimeout(pumpTimer); forceNext = false; queue = []; paused = false;
    stopCurrent(); renderQueue(); updatePause(); save(); updateTtsControls();
    audioContext?.suspend().catch(() => {});
  } else { save(); safePlay(); updateTtsControls(); updateStage(null); pump(); }
};
$("#tts-fresh").onclick = () => {
  twitchReader.cancel();
  pendingPreview = null;
  clearTimeout(pumpTimer); queue = []; forceNext = false; nextAt = 0;
  stopCurrent(); paused = false; settings.ttsEnabled = true; settings.auto = true;
  $("#auto-read").checked = true;
  $("#auto-hint").textContent = "Los mensajes entran en la cola";
  save(); safePlay(); renderQueue(); updatePause(); updateTtsControls();
  toast("Pendientes descartados. Solo se leerán los mensajes que lleguen desde ahora.");
};
updateTtsControls();
$("#pause").onclick = () => {
  armed = true;
  paused = !paused;
  updatePause();
  if (!paused) {
    safePlay();
    pump();
  }
};
$("#skip").onclick = () => {
  pendingPreview = null;
  safePlay();
  nextAt = 0;
  stopCurrent();
  pump();
};
$("#clear-queue").onclick = () => {
  twitchReader.cancel();
  queue = [];
  renderQueue();
  toast("Cola vaciada. La lectura actual continúa.");
};
$("#test-form").onsubmit = (e) => {
  e.preventDefault();
  demo();
  $("#test-message").value = "";
};
$("#demo").onclick = () => demo(true);
$("#user-avatar").innerHTML = avatars
  .map((a) => `<option value="${a.id}">${a.name}</option>`)
  .join("");
for (const id of ['default-voice', 'user-voice', 'user-avatar']) {
  searchablePickers.set(id, searchableSelect($('#' + id), id === 'user-avatar' ? 'Escribe para buscar un avatar' : 'Escribe para buscar una voz'));
}
for (const id of ['avatar-search', 'library-avatar-search']) $('#' + id).oninput = renderAvatarGrids;
$('#change-avatar').onclick = () => {
  $('#avatar-search').value = ''; renderAvatarGrids();
  $('#avatar-picker-dialog').showModal(); $('#avatar-search').focus();
};
$('#jump-queue').onclick = () => {
  setView('studio'); $('#queue-panel').scrollIntoView({block: 'nearest'}); $('#queue-panel').focus({preventScroll: true});
};
$("#add-user").onclick = () => openUser();
$("#add-user-page").onclick = () => openUser();
document
  .querySelectorAll("[data-view]")
  .forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$("#settings-open").onclick = openSettings;
$("#voice-settings").onclick = openSettings;
$("#connect-settings").onclick = () => {
  $("#connect-dialog").close();
  openSettings();
};
const openConnect = () => {
  connectHelp();
  $("#connect-error").textContent = "";
  $("#connect-dialog").showModal();
};
const dashboardActivity=[];
function updateDashboardVoice() {
  const select=$('#default-voice');
  $('#dashboard-voice-name').textContent=select.selectedOptions[0]?.textContent?.trim() || 'Voz predeterminada';
}
function addDashboardActivity(text) {
  dashboardActivity.unshift(text); dashboardActivity.splice(5);
  const list=$('#dashboard-activity-list'); list.replaceChildren(...dashboardActivity.map(value=>{const item=document.createElement('li');item.textContent=value;return item;}));
}
function renderDashboard() {
  $('#dashboard-greeting').textContent=`¡Hola, ${settings.displayName || account.username}!`;
  const list=$('#dashboard-platform-list');
  const platforms=['twitch','youtube','kick','tiktok','starvios'].filter(p=>!account.channels || account.channels[p]);
  list.innerHTML=platforms.map(p=>{const matching=connectionList.filter(c=>c.platform===p),connected=matching.some(c=>c.state==='connected');return `<button type="button" class="dashboard-platform" data-dashboard-platform="${p}" role="switch" aria-checked="${connected}" aria-label="${labels[p]}: ${connected?'conectada':'sin conectar'}">${platformBadge(p)}<span><strong>${labels[p]}</strong><small>${connected?'Conectada':matching.length?'Revisar conexión':'Sin conectar'}</small></span><span class="dashboard-platform-switch" aria-hidden="true"><i></i></span></button>`;}).join('') || '<p>No hay plataformas habilitadas para esta cuenta.</p>';
}
$('#dashboard-platform-list').addEventListener('click',async event=>{
  const button=event.target.closest('[data-dashboard-platform]'); if(!button)return;
  const platform=button.dataset.dashboardPlatform;
  const matches=connectionList.filter(c=>c.platform===platform);
  if(matches.length>1 || (matches.length===1 && matches[0].state!=='connected')) {setView('connections');return;}
  if(matches.length===1) {button.disabled=true;try {await api('/api/disconnect',{id:matches[0].id});} catch(error){toast(error.message);button.disabled=false;} return;}
  $('#platform').value=platform; connectHelp(); openConnect();
});
$('#dashboard-voice-change').onclick=()=>{setView('voices');setLibraryTab('voices');};
$('#dashboard-avatar-change').onclick=()=>$('#change-avatar').click();
$('#dashboard-manage-platforms').onclick=()=>setView('connections');
$('#dashboard-demo').onclick=()=>$('#demo').click();
$("#connect-open").onclick = openConnect;
$("#stage-connect").onclick = openConnect;
$("#add-connection-page").onclick = openConnect;
$("#platform").onchange = connectHelp;
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
const openOverlay = () => {
  $("#overlay-url").value = location.origin + account.overlayUrl;
  $("#overlay-dialog").showModal();
};
$("#overlay-open").onclick = openOverlay;
$("#sidebar-overlay").onclick = openOverlay;
$("#copy-overlay").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("#overlay-url").value);
    toast("URL del overlay copiada.");
  } catch {
    $("#overlay-url").select();
    toast("Selecciona y copia la URL del campo.");
  }
};
$("#stage-fullscreen").onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else
    $("#stage")
      .requestFullscreen?.()
      .catch(() => toast("No se pudo ampliar el escenario."));
};

window.addEventListener("pagehide", () => {
  twitchReader.cancel();
  pendingPreview = null;
  stopCurrent();
  sendOverlay(0, true);
});
renderAvatarGrids();
refreshVoices();
renderProfiles();
renderConnections();
renderTwitchAudience();
updateStage(null);
loadRemote();

$("#account-name").textContent=account.username;
if(account.username==='admin' && account.voices !== undefined){$('#admin-open').hidden=false;$('#admin-open').onclick=()=>location.assign('/admin');}
$("#logout").onclick=async()=>{twitchReader.cancel();pendingPreview=null;queue=[];stopCurrent();events.close();await fetch('/api/auth/logout',{method:'POST'});location.replace('/login');};
if(account.channels){
  for(const option of [...$("#platform").options])if(!account.channels[option.value])option.remove();
  for(const b of document.querySelectorAll('[data-platform-choice]'))if(!account.channels[b.dataset.platformChoice])b.hidden=true;
  for(const select of [$("#user-platform"),$("#reading-platform")])for(const option of [...select.options])if(option.value!=='test'&&!account.channels[option.value])option.remove();
  $("#channel").placeholder='Tu canal autorizado';
  $("#channel").value=$("#platform").value==='youtube'?'':(account.channels[$("#platform").value]?.[0]||'');
  const previousChange=$("#platform").onchange;
  $("#platform").onchange=event=>{previousChange?.(event);$("#channel").value=$("#platform").value==='youtube'?'':(account.channels[$("#platform").value]?.[0]||'');};
}

window.addEventListener('focus',async()=>{try{const r=await fetch('/api/auth/me');if(!r.ok){location.replace('/login');return;}const me=await r.json();if(me.username!==account.username)location.reload();}catch{}});
