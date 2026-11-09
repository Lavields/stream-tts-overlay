import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
const python =
  process.env.EDGE_TTS_PYTHON ||
  fileURLToPath(
    new URL(
      process.platform === "win32"
        ? "./.venv/Scripts/python.exe"
        : "./.venv/bin/python",
      import.meta.url,
    ),
  );
const script = fileURLToPath(
  new URL("./scripts/edge_tts_bridge.py", import.meta.url),
);
function edgeSpeechAttempt(text, voice, signal, speed = 1) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      signal,
    });
    const chunks = [];
    let size = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 45000);
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) child.kill();
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        Error(
          error.code === "ENOENT"
            ? "Falta instalar Edge TTS. Ejecuta npm run setup:voices."
            : "Se interrumpió la generación de Edge TTS.",
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && size > 0 && size <= 12 * 1024 * 1024)
        resolve(Buffer.concat(chunks));
      else {
        const error = Error(timedOut
          ? "Edge TTS tardó demasiado. Prueba otra voz disponible."
          : "Edge TTS no pudo generar audio. Revisa Internet o prueba otra voz disponible.");
        error.retryable = code === 75;
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify({ text, voice, speed }));
  });
}

export async function retryEdgeSpeech(operation, signal) {
  try { return await operation(); }
  catch (error) {
    if (!error.retryable || signal?.aborted) throw error;
    await delay(300, undefined, { signal });
    return operation();
  }
}
export function edgeSpeech(text, voice, signal, speed = 1) {
  return retryEdgeSpeech(() => edgeSpeechAttempt(text, voice, signal, speed), signal);
}
