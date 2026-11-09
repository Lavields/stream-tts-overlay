import test from "node:test";
import assert from "node:assert/strict";
import { createMouthDriver, systemSpeechRms } from "../public/mouth.js";
import { freeVoices } from "../public/free-voices.js";
test("el habla del sistema alterna boca abierta y cerrada durante el mensaje", () => {
  const driver = createMouthDriver();
  const states = [];
  for (let t = 0; t < 3000; t += 16)
    states.push(driver(systemSpeechRms(t), t) > 0.06);
  assert.ok(states.includes(true));
  assert.ok(states.includes(false));
  const transitions = states.slice(1).filter((v, i) => v !== states[i]);
  assert.ok(transitions.length > 10);
});
test("el audio sostenido articula cierres visibles para OBS y el silencio cierra de inmediato", () => {
  const driver = createMouthDriver();
  const samples = [];
  for (let t = 0; t < 2000; t += 90) samples.push(driver(0.1, t));
  assert.ok(samples.some((v) => v > 0.06));
  assert.ok(samples.some((v) => v === 0));
  assert.equal(driver(0, 2001), 0);
});
test("el catálogo Edge incluye voces en español con IDs distintos y sin clave", () => {
  assert.ok(freeVoices.length > 50);
  assert.equal(new Set(freeVoices.map((v) => v.id)).size, freeVoices.length);
  assert.ok(
    freeVoices.every((v) => v.id.startsWith("es-") && v.requiresKey === false),
  );
});
