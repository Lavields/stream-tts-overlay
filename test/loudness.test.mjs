import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSpeech, speechRms, SPEECH_TARGET } from "../public/loudness.js";
import { chooseMacVoice, macSystemVoices, macSystemSpeech } from "../system-voice.mjs";
import { readFile } from "node:fs/promises";
const tone = amplitude => Float32Array.from({ length: 24000 }, (_, i) => amplitude * Math.sin(2 * Math.PI * 220 * i / 24000));
test("iguala señales de voz débiles y fuertes sin cambiar longitud ni mutear", () => {
  for (const amplitude of [.008, .02, .12, .8]) {
    const audio = tone(amplitude);
    normalizeSpeech([audio], 24000);
    assert.ok(Math.abs(speechRms([audio], 24000) - SPEECH_TARGET) < .002);
    assert.equal(audio.length, 24000);
  }
});
test("las pausas no reducen la medición ni amplifican el silencio", () => {
  const speech = tone(.04), audio = new Float32Array(72000);
  audio.set(speech, 24000);
  normalizeSpeech([audio], 24000);
  assert.ok(Math.abs(speechRms([audio], 24000) - SPEECH_TARGET) < .002);
  assert.ok(audio.slice(0, 24000).every(x => x === 0));
  const silence = new Float32Array(24000);
  normalizeSpeech([silence], 24000);
  assert.ok(silence.every(x => x === 0));
});
test("limita picos, enlaza canales y conserva estado entre fragmentos", () => {
  const state = {};
  const first = tone(.01);
  normalizeSpeech([first], 24000, state);
  const second = tone(.9); second[100] = 1;
  const right = second.map(x => x / 2);
  normalizeSpeech([second, right], 24000, state);
  assert.ok(second.every(x => Math.abs(x) <= .950001));
  assert.ok(right.every((x, i) => Math.abs(x * 2 - second[i]) < .000001));
  assert.ok(Number.isFinite(state.gain));
});
test("el ajuste por voz local parte vacío y solo acepta parámetros numéricos", async () => {
  const options = JSON.parse(await readFile(new URL("../assets/voice-references/tuning.json", import.meta.url)));
  for (const p of Object.values(options)) for (const v of Object.values(p)) assert.equal(typeof v, "number");
});
test("las voces nativas se eligen de una lista, sin aceptar flags o rutas", () => {
  const voices = [{name:"Mónica (Español (España))"},{name:"Paulina (Español (México))"}];
  assert.equal(chooseMacVoice(voices, "default"), voices[0]);
  assert.equal(chooseMacVoice(voices, "oldURI", "Paulina"), voices[1]);
  assert.throws(() => chooseMacVoice(voices, "--help"), /no está disponible/);
});
test("la voz nativa española devuelve WAV normalizable", {skip:process.platform!=="darwin"}, async () => {
  const voices = await macSystemVoices();
  assert.ok(voices.length > 0 && voices.every(v => v.lang.startsWith("es-")));
  const audio = await macSystemSpeech("Hola, chat. Prueba de volumen.", "default", "");
  assert.equal(audio.subarray(0,4).toString(), "RIFF");
  await assert.rejects(macSystemSpeech("Hola", "../../file", ""), /no está disponible/);
});
