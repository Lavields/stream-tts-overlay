import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const app = join(root, "app");
const python = join(root, "runtime", "python", ...(process.platform === 'win32' ? ['python.exe'] : ['bin','python3']));
const portOption = process.argv.slice(2).find(arg => arg.startsWith('--port='));
const selectedPort = portOption?.slice(7);
if (selectedPort && (!/^\d+$/.test(selectedPort) || Number(selectedPort) < 1024 || Number(selectedPort) > 65535)) {
  console.error('Puerto inválido: usa --port=4317 o un puerto entre 1024 y 65535.');
  process.exit(1);
}
console.log("StreamVoice · portable\n");
try {
  await access(python);
  await access(join(app, "node_modules", "ws", "package.json"));
} catch {
  console.error("El paquete esta incompleto. Extrae TODO el ZIP y vuelve a abrir INICIAR.cmd.");
  process.exit(1);
}
// Do not inherit credentials from unrelated programs on the host computer.
const env = { ...process.env, EDGE_TTS_PYTHON: python, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" };
for (const key of ["PORT", "NODE_OPTIONS", "ELEVENLABS_API_KEY", "FISH_API_KEY",
  "YOUTUBE_API_KEY", "TWITCH_USERNAME", "TWITCH_OAUTH_TOKEN", "KICK_ACCESS_TOKEN",
  "EULER_API_KEY", "LUCHO_VOICE_PROFILE", "FISH_MODEL", "KICK_WEBHOOK_READY",
  "AUTH_ACCOUNTS_FILE", "PYTHONPATH", "PYTHONHOME", "OFFLINE_TTS_PYTHON", "OFFLINE_TTS_ENGINE", "OFFLINE_TTS_MODEL_DIR", "OFFLINE_TTS_CACHE", "OFFLINE_TTS_MLX_MODEL"])
  delete env[key];
if (selectedPort) env.PORT = selectedPort;
const child = spawn(process.execPath, ["--env-file-if-exists=.env", "server.mjs"], {
  cwd: app, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let opened = false, output = "", stopping = false;
const timer = setTimeout(() => {
  console.error("El servidor no pudo iniciar a tiempo. Intenta abrirlo de nuevo.");
  child.kill();
}, 20000);
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  output = (output + chunk.toString()).slice(-4096);
  const ready = output.match(/StreamVoice → (http:\/\/localhost:\d+)/);
  if (!opened && ready) {
    opened = true;
    clearTimeout(timer);
    console.log("\nMantén esta ventana abierta mientras usas el bot.");
    console.log("Para detenerlo: pulsa Ctrl+C o cierra esta ventana.\n");
    const browser = process.env.STREAMVOICE_NO_BROWSER === '1' ? null : spawn(process.platform === 'win32' ? "cmd.exe" : '/usr/bin/open', process.platform === 'win32' ? ["/d", "/c", "start", '""', ready[1]] : [ready[1]], {
      stdio: "ignore", windowsHide: true, windowsVerbatimArguments: true,
    });
    browser?.on("error", () => console.log(`Abre ${ready[1]} en Edge o Chrome.`));
  }
});
child.stderr.on("data", (chunk) => {
  const message = chunk.toString();
  if (message.includes("EADDRINUSE"))
    console.error("El puerto ya esta ocupado. Cierra la otra ventana del bot y vuelve a intentarlo.");
  else process.stderr.write(chunk);
});
child.on("error", () => {
  clearTimeout(timer);
  console.error("No se pudo iniciar el motor incluido.");
  process.exitCode = 1;
});
child.on("close", (code) => {
  clearTimeout(timer);
  process.exitCode = stopping ? 0 : (code ?? 1);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => { stopping = true; child.kill(signal); });
