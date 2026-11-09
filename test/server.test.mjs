import {authFixture} from "./auth-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import {avatars} from '../public/avatars.js';
const port = 14317,
  base = `http://127.0.0.1:${port}`;
let child,fixture,cookie;
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options={})=>originalFetch(url,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{})}});
test.before(async () => {
  fixture=await authFixture();
  child = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      PORT: String(port),
      AUTH_ACCOUNTS_FILE:fixture.path,
      ELEVENLABS_API_KEY: "",
      FISH_API_KEY: "",
      TWITCH_OAUTH_TOKEN: "",
      TWITCH_USERNAME: "",
      LUCHO_VOICE_PROFILE: "/vocalive-test-missing-profile",
      OFFLINE_TTS_PYTHON: "/streamvoice-test-missing-python",
      OFFLINE_TTS_ENGINE: "",
      YOUTUBE_API_KEY: "",
      KICK_ACCESS_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await Promise.race([
    once(child.stdout, "data"),
    new Promise((_, reject) =>
      setTimeout(() => reject(Error("Servidor no inició")), 5000).unref(),
    ),
  ]);
  const login=await originalFetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'test-password'})});
  cookie=login.headers.get('set-cookie').split(';')[0];
});
test.after(async () => {child?.kill("SIGTERM");await fixture?.cleanup();});
const post = (path, data, headers = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
test("las voces locales retiradas no se enumeran ni se pueden generar", async () => {
  const info = await (await fetch(base + "/api/offline-voices")).json();
  assert.equal(info.ready, false);
  assert.equal(info.voices.length, 0);
  const missing = await post("/api/speech", { provider: "offline", voiceId: "demo", text: "Hola" });
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /voces locales se eliminaron/);
  const invalid = await post("/api/speech", { provider: "offline", voiceId: "../../file", text: "Hola" });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /voces locales se eliminaron/);
});
test("sirve el panel y overlay sin exponer archivos del proyecto", async () => {
  assert.equal((await fetch(base + "/")).status, 200);
  assert.equal((await fetch(base + "/overlay")).status, 200);
  assert.equal((await fetch(base + "/presence.js")).status, 200);
  assert.equal((await fetch(base + "/offline-voices.js")).status, 404);
  assert.equal((await fetch(base + "/assets/voice-references/demo.wav")).status, 404);
  assert.equal((await fetch(base + "/.env")).status, 404);
  assert.equal((await fetch(base + "/server.mjs")).status, 404);
});
test("rechaza origen externo y webhooks sin firma", async () => {
  assert.equal(
    (await post("/api/settings", {}, { Origin: "https://evil.test" })).status,
    403,
  );
  assert.equal(
    (await post("/webhooks/kick", { content: "forged" })).status,
    403,
  );
  const hostStatus = await new Promise((resolve, reject) => {
    http
      .get(
        base + "/api/config",
        { headers: { Host: "public-tunnel.test" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      )
      .on("error", reject);
  });
  assert.equal(hostStatus, 403);
  assert.equal(
    (
      await fetch(base + "/api/config", {
        headers: { "X-Forwarded-For": "203.0.113.5" },
      })
    ).status,
    403,
  );
});
test("las claves ingresadas no se devuelven al cliente", async () => {
  assert.equal(
    (await post("/api/settings", { ELEVENLABS_API_KEY: "secret-test-only" }))
      .status,
    200,
  );
  const config = await (await fetch(base + "/api/config")).json();
  assert.equal(config.configured.ELEVENLABS_API_KEY, true);
  assert.ok(!JSON.stringify(config).includes("secret-test-only"));
});
test("SSE transporta estado de overlay entre navegadores distintos", async () => {
  const controller = new AbortController();
  const stream = await fetch(base + "/api/events", {
    signal: controller.signal,
  });
  const reader = stream.body.getReader();
  await reader.read();
  await post("/api/overlay", {
    avatar: "chibi-black",
    blinkId: "message-finished-1",
    blinkAt: Date.now(),
    user: "prueba",
    text: "Hola",
    level: 0.7,
    speaking: true,
  });
  const { value } = await reader.read();
  const event = new TextDecoder().decode(value);
  assert.match(event, /event: overlay/);
  assert.match(event, /"avatar":"chibi-black"/);
  assert.match(event, /"level":0.7/);
  assert.match(event, /"blinkId":"message-finished-1"/);
  controller.abort();
});
test("conexión sin credenciales da error claro y se puede eliminar", async () => {
  const r = await post("/api/connect", {
    platform: "youtube",
    channel: "dQw4w9WgXcQ",
  });
  const { id } = await r.json();
  assert.ok(id);
  const res = await fetch(base + "/api/events");
  const reader = res.body.getReader();
  const event = new TextDecoder().decode((await reader.read()).value);
  assert.match(event, /API key de YouTube/);
  await reader.cancel();
  assert.equal((await post("/api/disconnect", { id })).status, 200);
  assert.equal(
    (await post("/api/connect", { platform: "other", channel: "x" })).status,
    400,
  );
});

test("Fish Audio sin clave informa cómo activar las voces, sin fingir audio", async () => {
  const r = await post("/api/speech", {
    provider: "fish",
    voiceId: "d9f0d3d3fe734af6acb5ecc9129bc49a",
    text: "Hola",
  });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /API key de Fish Audio/);
});
test('seguidores de Twitch requieren OAuth y un canal conectado; no aceptan canales arbitrarios',async()=>{
  const status=await(await fetch(base+'/api/twitch/follower-status')).json();
  assert.equal(status.ready,false);assert.match(status.message,/OAuth/);
  assert.equal('accessToken' in status,false);
  const result=await post('/api/twitch/follower',{channel:'canal_ajeno',userId:'123',broadcasterId:'777'});
  assert.equal(result.status,409);assert.match((await result.json()).error,/Conecta primero/);
});
test("las hojas de títeres se sirven como PNG", async () => {
  for (const {id} of avatars) for(const suffix of ['sprites','thumb']) {
    const r = await fetch(base + `/assets/avatars/${id}-${suffix}.png`);
    assert.equal(r.status, 200,`${id}-${suffix}`);
    assert.equal(r.headers.get("content-type"), "image/png");
    await r.arrayBuffer();
  }
});

test('static assets revalidate without retransmitting pixels or bypassing login', async () => {
  const path=base+'/assets/avatars/sock-sprites.png';
  const first=await fetch(path);const bytes=await first.arrayBuffer();
  assert.ok(bytes.byteLength>0);const tag=first.headers.get('etag');assert.ok(tag);
  const cached=await fetch(path,{headers:{'If-None-Match':tag}});
  assert.equal(cached.status,304);assert.equal((await cached.arrayBuffer()).byteLength,0);
  const unauth=await originalFetch(path,{redirect:'manual',headers:{'If-None-Match':tag}});
  assert.equal(unauth.status,302);
  const thumb=await fetch(base+'/assets/avatars/sock-thumb.png');
  assert.equal(thumb.status,200);assert.ok((await thumb.arrayBuffer()).byteLength<bytes.byteLength/10);
});

test("la voz local se oculta si no existe el perfil y no acepta rutas del cliente", async () => {
  const d = await (await fetch(base + "/api/local-voices")).json();
  assert.deepEqual(d.voices, []);
  const r = await post("/api/speech", {
    provider: "local",
    voiceId: "../../etc/passwd",
    text: "Hola",
  });
  assert.equal(r.status, 400);
  const missing = await post("/api/speech", {
    provider: "local",
    voiceId: "lucho",
    text: "Hola",
  });
  assert.match((await missing.json()).error, /voces locales se eliminaron/);
});

test("liberar motores locales es idempotente y no descarga modelos ni elimina referencias", async () => {
  for (let i = 0; i < 2; i++) {
    const response = await post("/api/release-voices", {});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  }
  const info = await (await fetch(base + "/api/offline-voices")).json();
  assert.equal(info.voices.length, 0);
});

test('sirve los módulos de emojis y sonidos como JavaScript y conserva la licencia', async () => {
  for (const file of ['emoji-names.js', 'sound-effects.js', 'sound-files.js', 'sound-cooldown.js', 'bundled-sounds.js', 'speech-text.js']) {
    const response = await fetch(base + '/' + file);
    assert.equal(response.status, 200, file);
    assert.match(response.headers.get('content-type'), /javascript/, file);
    assert.doesNotMatch(await response.text(), /<!doctype html>/i);
  }
  const license = await fetch(base + '/emoji-license.txt');
  assert.equal(license.status, 200);
  assert.match(await license.text(), /UNICODE LICENSE/);
});

test('los efectos incluidos se sirven como MP3 sin reemplazarlos por HTML', async () => {
  const { bundledSounds } = await import('../public/bundled-sounds.js');
  for (const sound of Object.values(bundledSounds)) {
    const response=await fetch(base+sound.url);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'audio/mpeg');
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length,sound.size);
    assert.equal(bytes.subarray(0,3).toString(),'ID3');
  }
});

test('logo, favicon e iconos de las cinco plataformas se sirven con su tipo correcto',async()=>{
 for(const [path,type] of [
  ['/assets/branding/logo.png','image/png'],['/assets/branding/favicon-32.png','image/png'],
  ...['twitch','tiktok','kick','youtube'].map(p=>[`/assets/platforms/${p}.svg`,'image/svg+xml']),
  ['/assets/platforms/starvios.png','image/png'],
 ]){
  const response=await fetch(base+path);assert.equal(response.status,200,path);assert.match(response.headers.get('content-type'),new RegExp(type.replace('+','\\+')));assert.ok((await response.arrayBuffer()).byteLength>100);
 }
});
