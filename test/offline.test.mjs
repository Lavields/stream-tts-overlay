import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { offlineVoices } from "../public/offline-voices.js";
import { offlineSpeech } from "../offline-voices.mjs";

test("cada voz local registrada tiene su referencia WAV con fuente y huella", async () => {
  const refs = JSON.parse(await readFile(new URL("../assets/voice-references/catalog.json", import.meta.url)));
  assert.deepEqual(refs.map(v => v.id).sort(), offlineVoices.map(v => v.id).sort());
  for (const ref of refs) {
    assert.equal(ref.file, ref.id + ".wav");
    assert.match(ref.id, /^[a-z]+(?:-[a-z]+)*$/);
    const bytes = await readFile(new URL("../assets/voice-references/" + ref.file, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), ref.sha256);
  }
});
test("el worker local rechaza rutas y personajes ajenos antes de iniciar Python", async () => {
  await assert.rejects(offlineSpeech("Hola", "../../private"), /personaje local del catálogo/);
  await assert.rejects(offlineSpeech("Hola", "lucho"), /personaje local del catálogo/);
});

test("el protocolo incremental entrega WAV antes de terminar y permite cancelar", { skip: process.platform === "win32" }, async () => {
  const { mkdtemp, writeFile, chmod, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "streamvoice-stream-"));
  const fake = join(dir, "python");
  const fixture = join(dir, "worker.mjs");
  const previous = [process.env.OFFLINE_TTS_PYTHON, process.env.OFFLINE_TTS_ENGINE];
  let engine;
  try {
    await writeFile(fixture, `import readline from 'node:readline';
const wav = Buffer.alloc(48); wav.write('RIFF');
readline.createInterface({input:process.stdin}).on('line', line => {
const r=JSON.parse(line);
if(r.text==='error') return console.log(JSON.stringify({id:r.id,error:'TestError'}));
console.log(JSON.stringify({id:r.id,chunk:wav.toString('base64')}));
setTimeout(()=>console.log(JSON.stringify({id:r.id,done:true})),r.text==='slow'?10000:40);
});`);
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    await writeFile(fake, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixture)}\n`);
    await chmod(fake, 0o755);
    process.env.OFFLINE_TTS_PYTHON = fake;
    process.env.OFFLINE_TTS_ENGINE = "mlx";
    offlineVoices.push({ id: "demo", name: "Voz de prueba", language: "es", requiresKey: false });
    engine = await import("../offline-voices.mjs?stream-test");
    let finished = false, count = 0;
    await engine.offlineSpeech("Hola", "demo", undefined, audio => {
      assert.equal(finished, false);
      assert.equal(audio.subarray(0,4).toString(), "RIFF");
      count++;
    });
    finished = true;
    assert.equal(count, 1);
    await assert.rejects(engine.offlineSpeech("error", "demo", undefined, () => {}), /TestError/);
    const controller = new AbortController();
    await assert.rejects(engine.offlineSpeech("slow", "demo", controller.signal, () => controller.abort()), /interrumpida/);
    // An aborted worker must not prevent the next reading from starting.
    await engine.offlineSpeech("Otra", "demo", undefined, () => {});
  } finally {
    engine?.stopOfflineVoices();
    offlineVoices.splice(offlineVoices.findIndex(v => v.id === "demo"), 1);
    for (const [key, value] of [["OFFLINE_TTS_PYTHON",previous[0]],["OFFLINE_TTS_ENGINE",previous[1]]]) {
      if(value === undefined) delete process.env[key]; else process.env[key]=value;
    }
    await rm(dir, {recursive:true,force:true});
  }
});
