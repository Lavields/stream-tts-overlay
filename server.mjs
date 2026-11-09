import {createAuth,allowedChannel,allowedAvatar} from "./auth.mjs";
import {createRemoteAuth} from "./remote-auth.mjs";
import { BoundedTTLCache, sendEvent, serveStatic } from "./resource-utils.mjs";
import {limitChatWords,SOUND_CODE_SOURCE,containsSoundCode} from "./public/chat-limit.js";
import { connectStarvios } from "./starvios.mjs";
import { connectKickPublic } from "./kick-public.mjs";
import { bundledSounds } from "./public/bundled-sounds.js";
import { edgeSpeech } from "./edge-tts.mjs";
import { macSystemVoices, macSystemSpeech } from "./system-voice.mjs";
import { avatars as avatarCatalog, normalizeAvatar } from "./public/avatars.js";
import { freeVoices } from "./public/free-voices.js";
import {createTwitchFollowers} from './twitch-followers.mjs';
import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID, verify } from "node:crypto";
import WebSocket from "ws";
import { channelName, parseIRC, platforms, tiktokMessage, twitchControl } from "./lib.mjs";

import { supportsSpanish } from "./public/voices.js";
const catalog = JSON.parse(
  await readFile(
    new URL("./public/voice-catalog.json", import.meta.url),
    "utf8",
  ),
);
const port = Number(process.env.PORT || 4317);
let vaultRequestId = 0;
const vaultPending = new Map();
if (process.env.STREAMVOICE_CREDENTIAL_VAULT === '1') {
  if (!process.send) throw Error('El almacenamiento seguro no está disponible.');
  process.on('message', message => {
    if (message?.type !== 'credential-vault-result') return;
    const pending = vaultPending.get(message.id);
    if (!pending) return;
    vaultPending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(Error(message.error)); else pending.resolve(message.value);
  });
}
function vaultCall(action, user, value) {
  if (process.env.STREAMVOICE_CREDENTIAL_VAULT !== '1') return Promise.resolve(action === 'load' ? {} : null);
  return new Promise((resolve, reject) => {
    const id = ++vaultRequestId;
    const timer = setTimeout(() => { vaultPending.delete(id); reject(Error('El almacenamiento seguro no responde.')); }, 10000);
    vaultPending.set(id, { resolve, reject, timer });
    process.send({ type: 'credential-vault', id, action, user, value }, error => {
      if (error && vaultPending.has(id)) { clearTimeout(timer); vaultPending.delete(id); reject(error); }
    });
  });
}
function createTenantServer(account) {
const secrets = Object.fromEntries(
  [
    "ELEVENLABS_API_KEY",
    "FISH_API_KEY",
    "YOUTUBE_API_KEY",
    "TWITCH_USERNAME",
    "TWITCH_OAUTH_TOKEN",
    "KICK_ACCESS_TOKEN",
    "EULER_API_KEY",
  ].map((k) => [k, account === "admin" ? process.env[k] || "" : ""]),
);
const credentialsReady = vaultCall('load', account).then(saved => {
  for (const k of Object.keys(secrets)) if (typeof saved[k] === 'string') secrets[k] = saved[k];
});
credentialsReady.catch(() => {});
let fishModel =
  process.env.FISH_MODEL === "s2.1-pro" ? "s2.1-pro" : "s2.1-pro-free";
let webhookReady = process.env.KICK_WEBHOOK_READY === "true";
const clients = new Set(),
  connections = new Map(),
  seen = new Map();
let overlay = {
  avatar: canAvatar(account, "sock") ? "sock" : (auth.policy(account).avatars?.[0] || "cat-chile"),
  user: "Tu chat tiene voz",
  text: "",
  level: 0,
  speaking: false,
  visible: true,
};
let voiceCache = null;
const fishVoicePages = new BoundedTTLCache();
const twitchFollowers = createTwitchFollowers({getToken:()=>secrets.TWITCH_OAUTH_TOKEN});
const publicFiles = new Map(
  [
    "index.html",
    "chat-limit.js",
    "assets/branding/logo.png",
    "assets/branding/favicon-32.png",
    "assets/branding/apple-touch-icon.png",
    "assets/platforms/twitch.svg",
    "assets/platforms/tiktok.svg",
    "assets/platforms/kick.svg",
    "assets/platforms/youtube.svg",
    "assets/platforms/starvios.png",

    "style.css",
    "app.js",
    "appearance-themes.js",
    "settings-transfer.js",
    "assets/themes/oceano-arena.jpg",
    "assets/themes/oceano-arena-fantasia.jpg",
    "assets/themes/azul-hielo.jpg",
    "assets/themes/grafito-violeta.jpg",
    "assets/themes/bosque-menta.jpg",
    "assets/themes/calido-coral.jpg",
    "assets/themes/pizarra-turquesa.jpg",
    "assets/themes/indigo-ambar.jpg",
    "assets/themes/rosa-ciruela.jpg",
    "assets/themes/cobre-petroleo.jpg",
    "assets/themes/monocromo-lima.jpg",

    "queue-view.js",
    "avatars.js",
    "searchable-select.js",
    "identity.js",
    "reading.js",
    "speech-text.js",
    "chat-reactions.js",
    "emoji-names.js",
    "emoji-license.txt",
    "sound-effects.js",
    "sound-files.js",
    "sound-cooldown.js",
    "bundled-sounds.js",
    "loudness.js",
    "voice-volume.js",
    "voices.js",
    "free-voices.js",
    "mouth.js",
    "presence.js",
    "voice-catalog.json",
    "overlay.html",
    "overlay.js",
  ].map((p) => ["/" + p, p]),
);
for (const sound of Object.values(bundledSounds))
  publicFiles.set(sound.url, sound.url.slice(1));
for (const { id } of avatarCatalog)
  for (const suffix of ['sprites', 'thumb']) {
    const name = `assets/avatars/${id}-${suffix}.png`;
    publicFiles.set('/' + name, name);
  }
const mime = {
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  json: "application/json; charset=utf-8",
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
};
const push = (type, data) => {
  const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients)
    if (!res.overlayOnly || type === "overlay") sendEvent(res, type, event);
};
function status(c, state, detail = "") {
  c.state = state;
  c.detail = detail;
  push("connections", snapshot());
}
function snapshot() {
  return [...connections.values()].map(
    ({ id, platform, channel, state, detail }) => ({
      id,
      platform,
      channel,
      state,
      detail,
    }),
  );
}
function message(c, data) {
  if (c.closed || !data.text || !data.user) return;
  const key = `${c.id}:${data.id || randomUUID()}`;
  if (seen.has(key)) return;
  seen.set(key, Date.now());
  if (seen.size > 3000) seen.delete(seen.keys().next().value);
  push("chat", {
    ...data,
    text: limitChatWords(String(data.text).slice(0, 12000)),
    user: String(data.user).slice(0, 100),
    displayName: String(data.displayName || data.user).slice(0, 100),
    id: key,
    platform: c.platform,
    channel: c.channel,
    time: Date.now(),
  });
}
async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw Error(
      data.error?.message ||
        data.detail?.message ||
        data.message ||
        `El proveedor respondió HTTP ${res.status}. Revisa las credenciales y permisos.`,
    );
  return data;
}
function twitch(c) {
  let retries = 0,
    timer;
  const open = () => {
    if (c.closed) return;
    status(c, "connecting", "Conectando al chat…");
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    c.ws = ws;
    timer = setTimeout(() => {
      status(
        c,
        "error",
        "Sin confirmación del canal. Revisa el nombre o configura OAuth de Twitch.",
      );
      ws.close();
    }, 20000);
    let buffer = "";
    ws.on("open", () => {
      const auth = secrets.TWITCH_OAUTH_TOKEN && secrets.TWITCH_USERNAME;
      c.twitchChatLogin = auth ? secrets.TWITCH_USERNAME.toLowerCase() : '';
      c.twitchModerator = false;
      ws.send(
        `PASS ${auth ? "oauth:" + secrets.TWITCH_OAUTH_TOKEN.replace(/^oauth:/, "") : "SCHMOOPIIE"}`,
      );
      ws.send(
        `NICK ${auth ? secrets.TWITCH_USERNAME : "justinfan" + Math.floor(Math.random() * 900000 + 100000)}`,
      );
      ws.send(
        "CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership",
      );
      ws.send(`JOIN #${c.channel}`);
    });
    ws.on("message", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\r\n");
      buffer = lines.pop();
      for (const line of lines) {
        const control = twitchControl(line, c.channel);
        if (control?.type === "roomstate") c.twitchRoomId = control.roomId;
        if (control?.type === "userstate") c.twitchModerator = control.moderator;
        if (control?.type === "ping") ws.send(control.reply);
        if (control?.type === "joined" || control?.type === "roomstate") {
          clearTimeout(timer);
          retries = 0;
          status(c, "connected", "Escuchando mensajes");
        }
        if (control?.type === "rejected") {
          clearTimeout(timer);
          status(
            c,
            "error",
            "Twitch rechazó la conexión. Revisa canal y OAuth.",
          );
          c.closed = true;
          ws.close();
        }
        if (control?.type === "reconnect") ws.close();
        const msg = parseIRC(line);
        if (msg) message(c, msg);
        if (control?.type === "delete") push("delete", { id: `${c.id}:${control.id}` });
        if (control?.type === "purge")
          push("purge", { platform: "twitch", channel: c.channel, user: control.user });
      }
    });
    ws.on("error", () =>
      status(
        c,
        "error",
        "No se pudo abrir Twitch. Revisa la conexión a Internet.",
      ),
    );
    ws.on("close", () => {
      clearTimeout(timer);
      if (!c.closed) {
        status(c, "reconnecting", "Reconectando…");
        c.timer = setTimeout(open, Math.min(30000, 2000 * 2 ** retries++));
      }
    });
  };
  c.stop = async () => {
    clearTimeout(timer);
    clearTimeout(c.timer);
    c.ws?.close();
  };
  open();
}
async function tiktok(c) {
  const { TikTokLiveConnection, WebcastEvent, ControlEvent } =
    await import("tiktok-live-connector");
  if (c.closed) return;
  const live = new TikTokLiveConnection(c.channel, {
    processInitialData: false,
    ...(secrets.EULER_API_KEY ? { signApiKey: secrets.EULER_API_KEY } : {}),
  });
  c.stop = async () => {
    await live.disconnect();
  };
  live.on(WebcastEvent.CHAT, (d) => {
    const parsed = tiktokMessage(d);
    if (parsed) message(c,parsed);
  });
  live.on(ControlEvent.ERROR, () => {
    if (!c.closed)
      status(
        c,
        "error",
        "TikTok rechazó la conexión; prueba de nuevo o configura una clave Eulerstream.",
      );
  });
  live.on(ControlEvent.DISCONNECTED, () => {
    if (!c.closed)
      status(
        c,
        "error",
        "TikTok se desconectó o terminó el LIVE. Reconecta desde el panel.",
      );
  });
  await live.connect();
  if (c.closed) return live.disconnect();
  status(c, "connected", "Escuchando el LIVE · conector no oficial");
}
async function starvios(c) {
  return connectStarvios(c, {
    onMessage: data => message(c,data),
    onStatus: (state,detail) => status(c,state,detail),
  });
}
async function youtube(c) {
  const key = secrets.YOUTUBE_API_KEY;
  if (!key) throw Error("Agrega tu API key de YouTube Data API v3 en Ajustes.");
  const info = await api(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(c.channel)}&key=${encodeURIComponent(key)}`,
  );
  if (c.closed) return;
  if (auth.allowedChannel && !canChannel(account, 'youtube', info.items?.[0]?.snippet?.channelId || ''))
    throw Error('El canal dueño de este directo de YouTube no está autorizado para tu cuenta.');
  const chat = info.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
  if (!chat)
    throw Error("El video no está en directo o no tiene un chat activo.");
  let page = "",
    initial = true;
  c.stop = async () => clearTimeout(c.timer);
  const poll = async () => {
    if (c.closed) return;
    try {
      const data = await api(
        `https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet,authorDetails&maxResults=200&liveChatId=${encodeURIComponent(chat)}&key=${encodeURIComponent(key)}${page ? "&pageToken=" + encodeURIComponent(page) : ""}`,
      );
      if (c.closed) return;
      if (data.offlineAt) {
        status(c, "error", "El directo terminó.");
        return;
      }
      // La primera página es historial: no leer mensajes anteriores a la conexión.
      if (!initial)
        for (const d of data.items || []) {
          if (d.snippet?.type === "messageDeletedEvent")
            push("delete", {
              id: `${c.id}:${d.snippet.messageDeletedDetails.deletedMessageId}`,
            });
          else if (d.snippet?.type === "textMessageEvent")
            message(c, {
              id: d.id,
              user: d.authorDetails.channelId,
              displayName: d.authorDetails.displayName,
              text: d.snippet.displayMessage,
            });
        }
      initial = false;
      page = data.nextPageToken || "";
      status(c, "connected", "Escuchando el directo");
      c.timer = setTimeout(
        poll,
        Math.max(data.pollingIntervalMillis || 5000, 1000),
      );
    } catch (e) {
      if (!c.closed) status(c, "error", e.message);
    }
  };
  await poll();
}
async function kick(c) {
  if (!secrets.KICK_ACCESS_TOKEN) return connectKickPublic(c, {
    onMessage: data => message(c,data),
    onStatus: (state,detail) => status(c,state,detail),
    onDelete: id => push('delete',{id:`${c.id}:${id}`}),
    onPurge: user => push('purge',{platform:'kick',channel:c.channel,...(user?{user}:{})}),
  });
  if (!webhookReady)
    throw Error(
      "Kick necesita un webhook HTTPS público. Sigue la guía de Ajustes y confirma su configuración.",
    );
  const token = secrets.KICK_ACCESS_TOKEN;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const channel = await api(
    `https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(c.channel)}`,
    { headers },
  );
  const id = channel.data?.[0]?.broadcaster_user_id;
  if (!id) throw Error("No se encontró el canal de Kick.");
  c.broadcasterId = String(id);
  const data = await api(
    "https://api.kick.com/public/v1/events/subscriptions",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        broadcaster_user_id: id,
        events: [{ name: "chat.message.sent", version: 1 }],
        method: "webhook",
      }),
    },
  );
  const subscription = data.data?.find((x) => x.name === "chat.message.sent");
  if (!subscription?.subscription_id || subscription.error)
    throw Error(
      subscription?.error ||
        "Kick no confirmó la suscripción al chat. Revisa el token y el webhook de tu app.",
    );
  c.stop = async () => {
    await api(
      `https://api.kick.com/public/v1/events/subscriptions?id=${encodeURIComponent(subscription.subscription_id)}`,
      { method: "DELETE", headers },
    );
  };
  if (c.closed) return c.stop();
  const confirmed = await api(
    "https://api.kick.com/public/v1/events/subscriptions",
    { headers },
  );
  const actual = confirmed.data?.find(
    (x) => x.id === subscription.subscription_id,
  );
  if (!actual || String(actual.broadcaster_user_id) !== c.broadcasterId) {
    throw Error(
      "Kick suscribió otro canal. Para elegir cualquier streamer usa un App Access Token; un User Access Token solo suscribe a su propio canal.",
    );
  }
  if (c.closed) return;
  status(c, "waiting", "Suscrito · esperando el primer webhook verificado");
}
let kickKey;
async function receiveKick(req, raw) {
  const id = req.headers["kick-event-message-id"],
    timestamp = req.headers["kick-event-message-timestamp"],
    sig = req.headers["kick-event-signature"];
  if (
    !id ||
    !timestamp ||
    !sig ||
    !Number.isFinite(Date.parse(timestamp)) ||
    Math.abs(Date.now() - Date.parse(timestamp)) > 300000
  )
    throw Error("Firma de webhook inválida o caducada.");
  const signed = Buffer.concat([Buffer.from(`${id}.${timestamp}.`), raw]);
  async function loadKey() {
    const d = await api("https://api.kick.com/public/v1/public-key");
    kickKey = d.data?.public_key;
    if (!kickKey) throw Error("Clave pública de Kick no disponible.");
  }
  if (!kickKey) await loadKey();
  if (!verify("RSA-SHA256", signed, kickKey, Buffer.from(sig, "base64"))) {
    await loadKey();
    if (!verify("RSA-SHA256", signed, kickKey, Buffer.from(sig, "base64")))
      throw Error("Firma de webhook inválida.");
  }
  if (req.headers["kick-event-type"] !== "chat.message.sent") return;
  const d = JSON.parse(raw.toString());
  for (const c of connections.values())
    if (
      !c.closed &&
      c.platform === "kick" &&
      c.broadcasterId === String(d.broadcaster?.user_id)
    ) {
      status(c, "connected", "Recibiendo webhooks verificados");
      message(c, {
        id: d.message_id || id,
        user: d.sender?.username,
        displayName: d.sender?.username,
        text: d.content,
      });
    }
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const b of req) {
    size += b.length;
    if (size > 65536) throw Error("Solicitud demasiado grande.");
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}
function json(res, data, code = 200) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/webhooks/kick" && req.method === "POST") {
      try {
        await receiveKick(req, await body(req));
        return json(res, { ok: true });
      } catch {
        return json(res, { error: "Webhook no verificado." }, 403);
      }
    }
    // Solo el webhook puede atravesar un túnel: no exponer el panel, claves ni APIs.
    if (
      req.headers["x-forwarded-for"] ||
      req.headers["x-forwarded-host"] ||
      req.headers["x-real-ip"] ||
      req.headers["cf-connecting-ip"]
    )
      return json(
        res,
        {
          error:
            "Solo acceso local; el túnel admite únicamente /webhooks/kick.",
        },
        403,
      );
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(
        (req.headers.host || "").split(":")[0],
      )
    )
      return json(res, { error: "Solo acceso local." }, 403);
    if (
      req.headers.origin &&
      ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(
        req.headers.origin,
      )
    )
      return json(res, { error: "Origen no permitido." }, 403);
    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.overlayOnly = Boolean(req.overlayOnly);
      res.sessionId = req.sessionId;
      if (!req.overlayOnly) res.write(`event: connections\ndata: ${JSON.stringify(snapshot())}\n\n`);
      res.write(`event: overlay\ndata: ${JSON.stringify(overlay)}\n\n`);
      clients.add(res);
      const beat = setInterval(async () => {if(!req.overlayOnly) {try {await auth.refresh?.(req);} catch {} if(!req.sessionValid?.()){res.end();clearInterval(beat);return;}}res.write(": keepalive\n\n");}, 15000);
      req.on("close", () => {
        clients.delete(res);
        clearInterval(beat);
        if (res.overlayDrain) res.off('drain', res.overlayDrain);
        res.pendingOverlay = null;
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/config")
      return json(res, {
        configured: Object.fromEntries(
          Object.entries(secrets).map(([k, v]) => [k, Boolean(v)]),
        ),
        credentialPersistence: process.env.STREAMVOICE_CREDENTIAL_VAULT === '1',
        webhookReady,
        fishModel,
      });
    if (req.method === 'GET' && url.pathname === '/api/twitch/follower-status')
      return json(res, await twitchFollowers.status([...connections.values()].filter(c=>c.platform==='twitch'&&!c.closed)));
    if (req.method === "GET" && url.pathname === "/api/local-voices")
      return json(res, {
        voices: [],
      });
    if (req.method === "GET" && url.pathname === "/api/fish-voices") {
      if (!secrets.FISH_API_KEY)
        throw Error("Guarda tu clave Fish Audio en Ajustes para explorar sus voces.");
      const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page")) || 1));
      const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
      const cacheKey = `${page}:${query.toLocaleLowerCase()}`;
      const cached = fishVoicePages.get(cacheKey);
      if (cached) return json(res, cached);
      const params = new URLSearchParams({
        language: "es",
        page_size: "100",
        page_number: String(page),
        sort_by: "score",
      });
      if (query) params.set("title", query);
      const data = await api(`https://api.fish.audio/model?${params}`, {
        headers: { Authorization: `Bearer ${secrets.FISH_API_KEY}` },
      });
      const voices = (data.items || [])
        .filter((item) => item.visibility === "public" && supportsSpanish(item))
        .map((item) => ({
          id: item._id,
          name: String(item.title || "Voz Fish Audio").slice(0, 140),
          language: "es",
          provider: "fish",
          likes: Number(item.like_count) || 0,
          uses: Number(item.task_count) || 0,
          licensed: Boolean(item.licensed),
          source: `https://fish.audio/es/m/${encodeURIComponent(item._id)}/`,
        }));
      const value = {
        voices,
        page,
        total: Number(data.total) || voices.length,
        hasMore: Boolean(data.has_more),
      };
      fishVoicePages.set(cacheKey, value);
      return json(res, value);
    }
    if (req.method === "GET" && url.pathname === "/api/offline-voices")
      return json(res, { ready: false, voices: [] });
    if (req.method === "GET" && url.pathname === "/api/system-voices")
      return json(res, { ready: process.platform === "darwin", voices: await macSystemVoices() });
    if (req.method === "GET" && url.pathname === "/api/voices") {
      if (!secrets.ELEVENLABS_API_KEY) return json(res, { voices: [] });
      if (!voiceCache) {
        const d = await api(
          "https://api.elevenlabs.io/v2/voices?page_size=100",
          { headers: { "xi-api-key": secrets.ELEVENLABS_API_KEY } },
        );
        voiceCache = (d.voices || []).filter(supportsSpanish).map((v) => ({
          id: v.voice_id,
          name: v.name,
          language: "es",
        }));
      }
      return json(res, { voices: voiceCache });
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return json(res, { error: "Se requiere application/json." }, 415);
      const d = JSON.parse((await body(req)).toString() || "{}");
      if (url.pathname === '/api/settings/reveal') {
        const allowed = new Set(['FISH_API_KEY','ELEVENLABS_API_KEY','YOUTUBE_API_KEY','TWITCH_OAUTH_TOKEN','KICK_ACCESS_TOKEN','EULER_API_KEY']);
        if (!allowed.has(d.name)) return json(res,{error:'Clave no válida.'},400);
        return json(res,{value:secrets[d.name] || ''});
      }
      if (url.pathname === '/api/twitch/follower') {
        const connection = [...connections.values()].find(c=>c.platform==='twitch'&&c.channel===d.channel&&!c.closed);
        if(!connection)return json(res,{error:'Conecta primero este canal de Twitch para verificar seguidores.'},409);
        return json(res,await twitchFollowers.follows(connection,d.userId));
      }
      if(url.pathname === "/api/speech" && typeof d.text === "string") d.text=limitChatWords(d.text.normalize("NFC"));
      if (url.pathname === "/api/release-voices") {
        return json(res, { ok: true });
      }
      if (url.pathname === "/api/settings") {
        if (
          d.FISH_MODEL &&
          !["s2.1-pro-free", "s2.1-pro"].includes(d.FISH_MODEL)
        )
          throw Error("Modelo Fish Audio inválido.");
        const nextSecrets = { ...secrets };
        for (const k of Object.keys(nextSecrets))
          if (typeof d[k] === "string" && d[k].trim()) nextSecrets[k] = d[k].trim();
        await vaultCall('save', account, nextSecrets);
        Object.assign(secrets, nextSecrets);
        if (d.FISH_MODEL) fishModel = d.FISH_MODEL;
        if (typeof d.webhookReady === "boolean") webhookReady = d.webhookReady;
        voiceCache = null;
        fishVoicePages.clear();
        return json(res, { ok: true });
      }
      if (url.pathname === "/api/connect") {
        if (!platforms.includes(d.platform))
          throw Error("Plataforma desconocida.");
        const channel = channelName(d.channel, d.platform);
        if (d.platform === 'youtube' && auth.allowedChannel) {
          const p=auth.policy(account);
          if (p.channels !== null && !p.channels?.youtube) return json(res,{error:"Esta plataforma no está autorizada para tu cuenta."},403);
        } else if (!canChannel(account,d.platform,channel)) return json(res,{error:"Este canal no está autorizado para tu cuenta."},403);
        const existing = [...connections.values()].find(
          (c) =>
            c.platform === d.platform && c.channel === channel && !c.closed,
        );
        if (existing) return json(res, { id: existing.id });
        if (connections.size >= 12)
          throw Error("Máximo 12 conexiones. Elimina una para agregar otra.");
        const c = {
          id: randomUUID(),
          platform: d.platform,
          channel,
          state: "connecting",
          detail: "Conectando…",
          closed: false,
        };
        connections.set(c.id, c);
        push("connections", snapshot());
        // Conexión asíncrona para mantener el panel utilizable durante la negociación.
        Promise.resolve()
          .then(() => ({ twitch, tiktok, youtube, kick, starvios })[d.platform](c))
          .catch(async (e) => {
            if (!c.closed) {
              status(c, "error", e.message);
              c.closed = true;
              try {
                await c.stop?.();
              } catch {}
            }
          });
        return json(res, { id: c.id });
      }
      if (url.pathname === "/api/disconnect") {
        const c = connections.get(d.id);
        if (c) {
          c.closed = true;
          try {
            await c.stop?.();
          } catch {
            push("notice", {
              text: "Conexión cerrada localmente. No se pudo eliminar la suscripción remota de Kick; revísala en tu app.",
            });
          }
          connections.delete(d.id);
          push("connections", snapshot());
        }
        return json(res, { ok: true });
      }
      if (url.pathname === "/api/overlay") {
        if (!canAvatar(account,d.avatar)) return json(res,{error:"Avatar no autorizado para tu cuenta."},403);
        overlay = {
          avatar: normalizeAvatar(d.avatar),
          blinkId: String(d.blinkId || "").slice(0, 60),
          blinkAt: Math.min(Date.now(), Math.max(0, Number(d.blinkAt) || 0)),
          user: String(d.user || "").slice(0, 100),
          text: limitChatWords(String(d.text || "").slice(0, 12000)).replace(new RegExp(SOUND_CODE_SOURCE,"g")," ").replace(/\s+/g," ").trim(),
          level: Math.min(1, Math.max(0, Number(d.level) || 0)),
          speaking: Boolean(d.speaking),
          visible: d.visible !== false,
        };
        push("overlay", overlay);
        return json(res, { ok: true });
      }
      if (url.pathname === "/api/validate-voice") {
        if (!secrets.ELEVENLABS_API_KEY)
          throw Error("Primero guarda tu clave de ElevenLabs.");
        if (!/^[\w-]{1,100}$/.test(d.voiceId || ""))
          throw Error("Voice ID inválido.");
        const v = await api(
          `https://api.elevenlabs.io/v1/voices/${d.voiceId}`,
          { headers: { "xi-api-key": secrets.ELEVENLABS_API_KEY } },
        );
        if (!supportsSpanish(v))
          throw Error(
            "El proveedor no identifica esta voz como española. Elige una voz verificada en español.",
          );
        return json(res, { ok: true });
      }
      if (url.pathname === "/api/speech") {
        const voiceProvider=d.provider || 'eleven';
        if (auth.allowedVoice && !auth.allowedVoice(account,voiceProvider,d.voiceId)) return json(res,{error:'Esta voz no está autorizada para tu cuenta.'},403);
        if (containsSoundCode(d.text)) throw Error("El navegador envió un código de sonido al motor de voz. Actualiza la página para cargar el reproductor de efectos.");
        if (d.provider === "system") {
          const abort = new AbortController();
          const onClose = () => { if (!res.writableEnded) abort.abort(); };
          res.on("close", onClose);
          try {
            const audio = await macSystemSpeech(d.text, d.voiceId, d.voiceName || "", abort.signal);
            res.writeHead(200, { "Content-Type": "audio/wav", "Cache-Control": "no-store" });
            res.end(audio);
            return;
          } finally { res.off("close", onClose); }
        }
        if (["offline", "local"].includes(d.provider))
          throw Error("Las voces locales se eliminaron. Elige una voz Fish Audio.");
        if (d.provider === "edge") {
          if (
            !freeVoices.some((v) => v.id === d.voiceId) ||
            typeof d.text !== "string" ||
            !d.text.trim() ||
            d.text.length > 650
          )
            throw Error("Voz o texto inválido.");
          const abort = new AbortController();
          const onClose = () => {
            if (!res.writableEnded) abort.abort();
          };
          res.on("close", onClose);
          try {
            const speed = Math.min(1.5, Math.max(0.7, Number(d.speed) || 1));
            const audio =
              await edgeSpeech(d.text, d.voiceId, abort.signal, speed);
            res.writeHead(200, {
              "Content-Type":
                "audio/mpeg",
              "Cache-Control": "no-store",
            });
            res.end(audio);
            return;
          } finally {
            res.off("close", onClose);
          }
        }
        const fish = d.provider === "fish";
        if (d.provider && !["fish", "eleven"].includes(d.provider))
          throw Error("Proveedor inválido.");
        const provider = fish ? "Fish Audio" : "ElevenLabs";
        if(fish && !/^[a-f0-9]{32}$/.test(d.voiceId || "")) throw Error("ID de voz Fish inválido.");
        if (!secrets[fish ? "FISH_API_KEY" : "ELEVENLABS_API_KEY"])
          throw Error(`Configura la API key de ${provider} en Ajustes.`);
        if (
          !/^[\w-]{1,100}$/.test(d.voiceId || "") ||
          typeof d.text !== "string" ||
          !d.text.trim() ||
          d.text.length > 650
        )
          throw Error("Voz o texto inválido.");
        if (!fish) {
          const metadata = await api(
            `https://api.elevenlabs.io/v1/voices/${d.voiceId}`,
            { headers: { "xi-api-key": secrets.ELEVENLABS_API_KEY } },
          );
          if (!supportsSpanish(metadata))
            throw Error(
              "Esta voz no está verificada en español. Elige otra voz.",
            );
        }
        const requestedFishModel = fishModel;
        const speed = Math.min(1.5, Math.max(0.7, Number(d.speed) || 1));
        const speechAbort = new AbortController();
        const onSpeechClose = () => { if (!res.writableEnded) speechAbort.abort(); };
        res.on("close", onSpeechClose);
        const speechSignal = AbortSignal.any([speechAbort.signal, AbortSignal.timeout(45000)]);
        try {
        const requestAudio = () => fetch(
          fish
            ? "https://api.fish.audio/v1/tts"
            : `https://api.elevenlabs.io/v1/text-to-speech/${d.voiceId}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: fish
              ? {
                  Authorization: `Bearer ${secrets.FISH_API_KEY}`,
                  "Content-Type": "application/json",
                  model: requestedFishModel,
                }
              : {
                  "xi-api-key": secrets.ELEVENLABS_API_KEY,
                  "Content-Type": "application/json",
                },
            body: JSON.stringify(
              fish
                ? {
                    text: d.text,
                    reference_id: d.voiceId,
                    format: "mp3",
                    normalize: false,
                    prosody: { speed },
                  }
                : {
                    text: d.text,
                    model_id: "eleven_multilingual_v2",
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
                  },
            ),
            signal: speechSignal,
          },
        );
        let audio = await requestAudio();
        // Only retry explicit unavailability on the free tier, once, using the same model.
        if (fish && requestedFishModel === "s2.1-pro-free" && audio.status === 503) {
          await audio.body?.cancel();
          await delay(1000, undefined, { signal: speechSignal });
          audio = await requestAudio();
        }
        if (!audio.ok && fish && audio.status >= 500)
          throw Error(`Fish Audio no está disponible temporalmente (HTTP ${audio.status}). Vuelve a probar en unos minutos. Este error no confirma un problema de clave o saldo.`);
        if (!audio.ok && fish && audio.status === 429)
          throw Error("Fish Audio limitó temporalmente las solicitudes (HTTP 429). Espera un momento antes de volver a probar.");
        if (!audio.ok && fish && audio.status === 402)
          throw Error(
            requestedFishModel === "s2.1-pro-free"
              ? "Fish Audio devolvió HTTP 402: tu cuenta no tiene acceso o cuota para el modelo gratuito. Revisa el acceso y la cuota en tu cuenta Fish Audio."
              : "Fish Audio devolvió HTTP 402: el modelo de pago requiere saldo. En Ajustes puedes seleccionar S2.1 Pro gratuito si tu cuenta tiene acceso.",
          );
        if (!audio.ok && fish && [401, 403].includes(audio.status))
          throw Error(
            "Fish Audio rechazó la clave o sus permisos. Guarda una API key válida de Fish Audio en Ajustes.",
          );
        if (!audio.ok)
          throw Error(
            `${provider} respondió HTTP ${audio.status}. Revisa saldo, permisos y voice ID.`,
          );
        res.writeHead(200, {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
        });
        res.end(Buffer.from(await audio.arrayBuffer()));
        return;
        } finally { res.off("close", onSpeechClose); }
      }
      return json(res, { error: "Ruta desconocida." }, 404);
    }
    if (req.method === "GET") {
      const path =
        url.pathname === "/"
          ? "/index.html"
          : url.pathname === "/overlay"
            ? "/overlay.html"
            : url.pathname;
      const avatarId = path.match(/^\/assets\/avatars\/([a-z-]+)-(?:sprites|thumb)\.png$/)?.[1];
      if (avatarId && !canAvatar(account,avatarId)) return json(res,{error:"Avatar no autorizado."},403);
      const name = publicFiles.get(path);
      if (name) {
        await serveStatic(req, res, new URL(`./public/${name}`, import.meta.url), mime[name.split(".").pop()]);
        return;
      }
    }
    json(res, { error: "No encontrado." }, 404);
  } catch (e) {
    json(res, { error: e.message || "Error inesperado." }, 400);
  }
});
return {
 handle:async(req,res)=>{try {await credentialsReady; server.emit("request",req,res);} catch {json(res,{error:'No se pudieron abrir las credenciales guardadas de forma segura.'},503);}},
 revoke:token=>{for(const res of clients)if(res.sessionId===token)res.end();},
 webhook:(req,raw)=>receiveKick(req,raw),
 async close(){
  for(const c of connections.values()){c.closed=true;try{await c.stop?.();}catch{}}
  for(const r of clients)r.end();
 },
};
}
const auth=process.env.STREAMVOICE_REMOTE_AUTH==='1' ? await createRemoteAuth() : await createAuth();
const canChannel=(user,platform,channel)=>auth.allowedChannel ? auth.allowedChannel(user,platform,channel) : allowedChannel(user,platform,channel);
const canAvatar=(user,id)=>auth.allowedAvatar ? auth.allowedAvatar(user,id) : allowedAvatar(user,id);
const tenants=new Map(auth.users.map(user=>[user,createTenantServer(user)]));
auth.onInvalidate?.((user,token)=>{const tenant=tenants.get(user);tenant?.revoke(token);if(tenant){void tenant.close();tenants.delete(user);}});
const respond=(res,data,status=200)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(data));};
async function readRequest(req){let size=0;const chunks=[];for await(const part of req){size+=part.length;if(size>65536)throw Error("Solicitud demasiado grande.");chunks.push(part);}return Buffer.concat(chunks);}
const publicAssets=new Map([["/login","login.html"],["/login.js","login.js"],["/style.css","style.css"],["/assets/branding/logo.png","assets/branding/logo.png"],["/assets/branding/favicon-32.png","assets/branding/favicon-32.png"]]);
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,"http://localhost");
  if(url.pathname==="/webhooks/kick"&&req.method==="POST"){
   const raw=await readRequest(req),results=await Promise.allSettled([...tenants.values()].map(t=>t.webhook(req,raw)));
   return respond(res,{ok:results.some(r=>r.status==="fulfilled")},results.some(r=>r.status==="fulfilled")?200:403);
  }
  if(["x-forwarded-for","x-forwarded-host","x-real-ip","cf-connecting-ip"].some(h=>req.headers[h])||![`localhost:${port}`,`127.0.0.1:${port}`].includes(req.headers.host))return respond(res,{error:"Solo acceso local."},403);
  if(req.headers.origin&&![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin))return respond(res,{error:"Origen no permitido."},403);
  if(req.method==="GET"&&publicAssets.has(url.pathname)){
   const file=publicAssets.get(url.pathname),type=file.endsWith('.png')?'image/png':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html';
   return await serveStatic(req,res,new URL('./public/'+file,import.meta.url),type+(type.startsWith('text/')?'; charset=utf-8':''));
  }
  if(url.pathname==='/api/auth/status'&&req.method==='GET') return respond(res,auth.status ? await auth.status() : {remote:false});
  if(url.pathname==='/api/auth/configure'&&req.method==='POST'&&auth.configure){const data=JSON.parse((await readRequest(req)).toString());return respond(res,await auth.configure(data.url));}
  if(url.pathname==='/api/auth/setup'&&req.method==='POST'&&auth.setup){const data=JSON.parse((await readRequest(req)).toString());return respond(res,await auth.setup(data.password,data.setupToken));}
  if(url.pathname==="/api/auth/login"&&req.method==="POST"){
   if(!req.headers['content-type']?.startsWith('application/json'))return respond(res,{error:"Se requiere application/json."},415);
   const data=JSON.parse((await readRequest(req)).toString());const previousUser=auth.session(req),previousToken=auth.sessionId(req);const result=await auth.login(req,res,data);if(previousUser)tenants.get(previousUser)?.revoke(previousToken);if(!tenants.has(result.username))tenants.set(result.username,createTenantServer(result.username));return respond(res,result);
  }
  await auth.refresh?.(req);
  const session=auth.session(req);
  if(url.pathname==="/api/auth/logout"&&req.method==="POST"){if(session)tenants.get(session).revoke(auth.sessionId(req));auth.logout(req,res);return respond(res,{ok:true});}
  if(url.pathname==="/api/auth/me"){if(!session)return respond(res,{error:"Inicia sesión."},401);return respond(res,auth.policy(session));}
  if(url.pathname.startsWith('/api/admin/') && auth.admin){
   if(!session)return respond(res,{error:'Inicia sesión.'},401);
   if(session!=='admin')return respond(res,{error:'No autorizado.'},403);
   const name=url.pathname.slice('/api/admin/'.length);
   if(!['users','user','network'].includes(name)||!['GET','POST'].includes(req.method))return respond(res,{error:'Ruta desconocida.'},404);
   const data=req.method==='POST'?JSON.parse((await readRequest(req)).toString()):undefined;
   return respond(res,await auth.admin(req,name,req.method,data));
  }
  if(['/admin','/admin.js'].includes(url.pathname)){
   if(session!=='admin'||!auth.admin)return respond(res,{error:'No autorizado.'},403);
   return await serveStatic(req,res,new URL('./public/'+(url.pathname==='/admin'?'admin.html':'admin.js'),import.meta.url),url.pathname==='/admin'?'text/html; charset=utf-8':'text/javascript; charset=utf-8');
  }
  const overlayUser=auth.overlay(req);
  const overlayPage=url.pathname==='/overlay'||url.pathname==='/overlay.html';
  const overlayEvents=url.pathname==='/api/events'&&url.searchParams.get('overlay')==='1';
  const overlayAsset=['/overlay.js','/avatars.js','/presence.js','/style.css'].includes(url.pathname)||/^\/assets\/avatars\/[a-z-]+-sprites\.png$/.test(url.pathname);
  const user=overlayUser&&(overlayPage||overlayEvents||(!session&&overlayAsset))?overlayUser:session;
  if(!user){if(req.method==='GET'&&!url.pathname.startsWith('/api/')){res.writeHead(302,{Location:'/login',"Cache-Control":"no-store"});return res.end();}return respond(res,{error:"Inicia sesión."},401);}
  if(!session&&!(overlayPage||overlayEvents||overlayAsset))return respond(res,{error:"El enlace OBS solo permite ver el overlay."},403);
  if(overlayPage)auth.overlayCookie(req,res);
  req.overlayOnly=overlayEvents;
  req.sessionId=auth.sessionId(req);
  req.sessionValid=()=>auth.session(req)===user;
  tenants.get(user).handle(req,res);
 }catch(error){respond(res,{error:error.message||'Error inesperado.'},error.statusCode||400);}
});
server.listen(port,'127.0.0.1',()=>console.log(`StreamVoice → http://localhost:${port}`));
async function shutdown(){await Promise.allSettled([...tenants.values()].map(t=>t.close()));server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),2000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
