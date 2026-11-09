import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
const profile =
  process.env.LOCAL_VOICE_PROFILE || "";
const python = join(profile, ".venv/bin/python");
const script = fileURLToPath(
  new URL("./scripts/local_voice_worker.py", import.meta.url),
);
export const luchoVoice = {
  id: "lucho",
  name: "Mi voz · local",
  language: "es",
  provider: "local",
  engine: "Qwen3 local",
  requiresKey: false,
};
export async function localVoiceAvailable() {
  try {
    await Promise.all(
      [
        python,
        join(profile, "referencias/referencia_HABLADO_20261002_relato.wav"),
        join(profile, "referencias/transcripcion_HABLADO_20261002_relato.txt"),
      ].map((p) => access(p)),
    );
    return true;
  } catch {
    return false;
  }
}
let worker = null,
  pending = null,
  buffer = "",
  idleTimer;
function fail(error) {
  const job = pending;
  pending = null;
  job?.reject(error);
}
export function stopLocalVoice() {
  clearTimeout(idleTimer);
  const child = worker;
  worker = null;
  child?.kill();
  fail(Error("Generación local interrumpida."));
}
function startWorker() {
  const child = spawn(python, [script], {
    env: {
      ...process.env,
      LUCHO_VOICE_PROFILE: profile,
      HF_HOME: join(profile, "modelos/.cache"),
      HF_HUB_OFFLINE: "1",
      PYTHONDONTWRITEBYTECODE: "1",
      TOKENIZERS_PARALLELISM: "false",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  worker = child;
  buffer = "";
  child.stderr.resume();
  child.stdin.on("error", () => {});
  child.stdout.on("data", (chunk) => {
    if (worker !== child) return;
    buffer += chunk.toString();
    if (buffer.length > 24 * 1024 * 1024) {
      stopLocalVoice();
      return;
    }
    let at;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      let d;
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }
      if (!pending || d.id !== pending.id) continue;
      const job = pending;
      pending = null;
      if (d.error)
        job.reject(
          Error(
            `No se pudo generar tu voz local (${d.error}). Revisa el perfil hablado.`,
          ),
        );
      else {
        const audio = Buffer.from(d.audio, "base64");
        if (audio.subarray(0, 4).toString() !== "RIFF")
          job.reject(Error("El motor local no devolvió un WAV válido."));
        else job.resolve(audio);
      }
      idleTimer = setTimeout(() => {
        if (!pending) stopLocalVoice();
      }, 60000);
      idleTimer.unref();
    }
  });
  child.on("error", () => {
    if (worker === child) {
      worker = null;
      fail(Error("No se pudo iniciar el entorno local del perfil de voz local."));
    }
  });
  child.on("close", () => {
    if (worker === child) {
      worker = null;
      fail(Error("El motor de voz local se cerró. Prueba de nuevo."));
    }
  });
}
export async function localSpeech(text, signal) {
  if (pending)
    throw Error(
      "Tu voz local está preparando otra lectura. Espera a que termine.",
    );
  if (!(await localVoiceAvailable()))
    throw Error("No se encontró el perfil de voz local (LOCAL_VOICE_PROFILE) en este equipo.");
  if (pending)
    throw Error(
      "Tu voz local está preparando otra lectura. Espera a que termine.",
    );
  if (signal?.aborted) throw Error("Lectura cancelada.");
  return new Promise((resolve, reject) => {
    clearTimeout(idleTimer);
    if (!worker) startWorker();
    const timer = setTimeout(() => stopLocalVoice(), 180000);
    const abort = () => stopLocalVoice();
    signal?.addEventListener("abort", abort, { once: true });
    const finish = (callback) => (value) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const id = randomUUID();
    pending = { id, resolve: finish(resolve), reject: finish(reject) };
    worker.stdin.write(JSON.stringify({ id, text }) + "\n");
  });
}
