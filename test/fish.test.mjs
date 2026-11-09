import {authFixture} from "./auth-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
const base = "http://127.0.0.1:14318";
let child,fixture,cookie;
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,options={})=>originalFetch(url,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{})}});
test.before(async () => {
  fixture=await authFixture();
  child = spawn(
    process.execPath,
    ["--import", "./test/fixtures/fish-fetch.mjs", "server.mjs"],
    {
      env: {
        ...process.env,
        PORT: "14318",
        AUTH_ACCOUNTS_FILE:fixture.path,
        FISH_API_KEY: "test-only",
        FISH_MODEL: "",
        ELEVENLABS_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await Promise.race([
    once(child.stdout, "data"),
    new Promise((_, reject) =>
      setTimeout(() => reject(Error("Servidor no inició")), 5000).unref(),
    ),
  ]);
  const login=await originalFetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'test-password'})});
  cookie=login.headers.get('set-cookie').split(';')[0];
});
test.after(async () => {child?.kill();await fixture?.cleanup();});
const post = (path, data) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
const speech = (text) =>
  post("/api/speech", {
    provider: "fish",
    voiceId: "5458dad9c902431cb0dbb37703160cb7",
    text,
  });
test("Fish usa la modalidad gratuita por defecto con el ID de voz real", async () => {
  const config = await (await fetch(base + "/api/config")).json();
  assert.equal(config.fishModel, "s2.1-pro-free");
  const r = await speech("Hola");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "audio/mpeg");
  assert.match(await r.text(), /^ID3/);
});
test("rechaza IDs de voz inválidos y distingue cuota de clave inválida", async () => {
  const invalid = await post("/api/speech", {
    provider: "fish",
    voiceId: "unknown",
    text: "Hola",
  });
  assert.equal(invalid.status, 400);
  const quota = await speech("quota");
  assert.match((await quota.json()).error, /HTTP 402.*acceso o cuota/);
  const auth = await speech("auth");
  assert.match((await auth.json()).error, /rechazó la clave/);
});
test("503 gratuito reintenta una vez y distingue indisponibilidad de credenciales", async () => {
  const recovered = await speech("recover");
  assert.equal(recovered.status, 200);
  assert.match(await recovered.text(), /^ID3/);
  const unavailable = await speech("unavailable");
  assert.match((await unavailable.json()).error, /temporalmente.*HTTP 503/);
  const limited = await speech("limited");
  assert.match((await limited.json()).error, /HTTP 429/);
});
test("la modalidad de pago es explícita y el error indica cómo volver a gratuito", async () => {
  assert.equal(
    (await post("/api/settings", { FISH_MODEL: "s2.1-pro" })).status,
    200,
  );
  const r = await speech("Hola");
  assert.match((await r.json()).error, /HTTP 402.*requiere saldo.*gratuito/);
  assert.equal(
    (await post("/api/settings", { FISH_MODEL: "unknown" })).status,
    400,
  );
});

test("Fish recibe las tildes normalizadas y no acepta códigos de sonido como texto de voz",async()=>{
 await post("/api/settings",{FISH_MODEL:"s2.1-pro-free"});
 const text='¿Cómo estás? Sí, él tomó café y pidió más azúcar.';
 const response=await speech(text.normalize('NFD'));
 assert.equal(response.status,200);assert.equal(await response.text(),'ID3mock-speech:'+text);
 for(const code of ['{20}','{ 20 }','｛２０｝']) {
  const rejected=await speech('Hola '+code);assert.equal(rejected.status,400);
  assert.match((await rejected.json()).error,/código de sonido.*Actualiza la página/);
 }
 const link=await speech('https://ejm.com/{20}');assert.equal(link.status,200);
});

test('Fish receives expression instructions only on laughter segments',async()=>{
 const {speechSegments}=await import('../public/speech-text.js');
 const {expressionSpeech}=await import('../public/chat-reactions.js');
 await post('/api/settings',{FISH_MODEL:'s2.1-pro-free'});
 for(const input of ['jaja','jajaja','muajajaja']) {
  const [segment]=speechSegments(input),text=expressionSpeech(segment,'fish');
  const r=await speech(text);assert.equal(r.status,200);
  assert.equal(await r.text(),'ID3mock-speech:'+text);
  assert.doesNotMatch(expressionSpeech(segment,'edge'),/\[/);
 }
});
