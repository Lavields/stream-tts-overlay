import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { offlineVoices } from "./public/offline-voices.js";

const python = process.env.OFFLINE_TTS_PYTHON || fileURLToPath(new URL(
  process.platform === "win32" ? "../runtime/voice-python/python.exe" : "./.offline-venv/bin/python", import.meta.url));
const modelDir = process.env.OFFLINE_TTS_MODEL_DIR || fileURLToPath(new URL("../runtime/voice-model/", import.meta.url));
const cache = process.env.OFFLINE_TTS_CACHE || fileURLToPath(new URL("../runtime/voice-cache/", import.meta.url));
const mlx = process.env.OFFLINE_TTS_ENGINE === "mlx";
const script = fileURLToPath(new URL("./scripts/offline_tts_worker.py", import.meta.url));
export async function offlineVoicesReady() {
  try {
    await access(python);
    if (!mlx) await access(modelDir + "/.ready");
    return true;
  } catch { return false; }
}
let worker, job, buffer = "", idleTimer;
export function stopOfflineVoices() {
  clearTimeout(idleTimer);
  const child = worker, pending = job;
  worker = job = null;
  child?.kill();
  pending?.reject(Error("Lectura local interrumpida."));
}
function start() {
  const child = spawn(python, [script], {
    env: { ...process.env, OFFLINE_TTS_MODEL_DIR: modelDir, HF_HOME: cache,
      HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", PYTHONDONTWRITEBYTECODE: "1",
      PYTHONIOENCODING: "utf-8", TOKENIZERS_PARALLELISM: "false" },
    stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
  });
  worker = child; buffer = "";
  child.stderr.resume(); child.stdin.on("error", () => {});
  child.stdout.on("data", chunk => {
    if (worker !== child) return;
    buffer += chunk.toString();
    if (buffer.length > 40 * 1024 * 1024) return stopOfflineVoices();
    let at;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
      let data; try { data = JSON.parse(line); } catch { continue; }
      if (!job || data.id !== job.id) continue;
      if (data.chunk) {
        const audio = Buffer.from(data.chunk, "base64");
        if (audio.subarray(0, 4).toString() !== "RIFF") return stopOfflineVoices();
        job.onChunk?.(audio);
        continue;
      }
      const pending = job; job = null;
      if (data.error) pending.reject(Error(`El motor local no pudo generar la voz (${data.error}). Vuelve a activar las voces locales si falta el modelo.`));
      else if (data.done && pending.onChunk) pending.resolve();
      else {
        const audio = Buffer.from(data.audio || "", "base64");
        audio.subarray(0, 4).toString() === "RIFF" ? pending.resolve(audio) : pending.reject(Error("El motor local no devolvió audio WAV válido."));
      }
      idleTimer = setTimeout(stopOfflineVoices, 60000); idleTimer.unref();
    }
  });
  const failed = () => {
    if (worker === child) stopOfflineVoices();
  };
  child.on("error", failed); child.on("close", failed);
}
export async function offlineSpeech(text, voiceId, signal, onChunk) {
  if (!offlineVoices.some(v => v.id === voiceId)) throw Error("Elige un personaje local del catálogo.");
  if (!(await offlineVoicesReady())) throw Error("Activa primero el motor sin API: en Windows abre ACTIVAR_VOCES_LOCALES.cmd, espera la descarga inicial y reinicia el bot.");
  if (signal?.aborted) throw Error("Lectura cancelada.");
  if (job) throw Error("El motor local está preparando otra lectura. Espera a que termine.");
  return new Promise((resolve, reject) => {
    clearTimeout(idleTimer);
    if (!worker) start();
    const timer = setTimeout(stopOfflineVoices, 600000);
    const abort = () => stopOfflineVoices();
    signal?.addEventListener("abort", abort, { once: true });
    const finish = fn => value => { clearTimeout(timer); signal?.removeEventListener("abort", abort); fn(value); };
    const id = randomUUID();
    job = { id, onChunk, resolve: finish(resolve), reject: finish(reject) };
    worker.stdin.write(JSON.stringify({ id, text, voice: voiceId, stream: Boolean(onChunk) }) + "\n");
  });
}
