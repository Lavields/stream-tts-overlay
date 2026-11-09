import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, access, statfs } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL(".", import.meta.url));
const python = join(root, "runtime/voice-python/python.exe");
const site = join(root, "runtime/voice-python/Lib/site-packages");
const model = join(root, "runtime/voice-model");
const env = { ...process.env, PYTHONIOENCODING: "utf-8", PIP_DISABLE_PIP_VERSION_CHECK: "1",
  HF_HOME: join(root, "runtime/voice-cache"), HF_HUB_DISABLE_SYMLINKS_WARNING: "1" };
for (const key of ["HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"])
  delete env[key];
async function run(executable, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(Error(`El paso de instalación terminó con código ${code}.`)));
  });
}
try {
  console.log("StreamVoice · Voces locales sin API\n");
  console.log("Se instalará Qwen3 para clonar las voces registradas en assets/voice-references.");
  console.log("Descarga inicial: aproximadamente 2,4 GB de modelo más dependencias. Después la voz se genera offline.");
  console.log("La generación usa la CPU y puede tardar. Mantén esta ventana abierta hasta que termine.\n");
  await access(python);
  const disk = await statfs(root);
  if (disk.bavail * disk.bsize < 6 * 1024 ** 3)
    throw Error("Deja al menos 6 GB libres en esta unidad para la descarga e instalación.");
  await mkdir(site, { recursive: true });
  const metadata = await fetch("https://pypi.org/pypi/pip/25.3/json").then(r => {
    if (!r.ok) throw Error("No se pudo descargar la información de pip.");
    return r.json();
  });
  const wheel = metadata.urls.find(v => v.filename.endsWith(".whl"));
  const response = await fetch(wheel.url);
  if (!response.ok) throw Error("No se pudo descargar pip.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== wheel.digests.sha256)
    throw Error("La huella de pip no coincide. Intenta de nuevo.");
  const archive = join(root, "runtime/pip-bootstrap.whl");
  await writeFile(archive, bytes);
  await run(python, ["-c", "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", archive, site]);
  console.log("\nInstalando PyTorch para CPU (no requiere una tarjeta NVIDIA)...");
  await run(python, ["-m", "pip", "install", "--only-binary=:all:", "--index-url",
    "https://download.pytorch.org/whl/cpu", "torch==2.9.1", "torchaudio==2.9.1"]);
  console.log("\nInstalando el motor de voz...");
  await run(python, ["-m", "pip", "install", "--prefer-binary", "qwen-tts==0.1.1",
    "torch==2.9.1", "torchaudio==2.9.1"]);
  console.log("\nDescargando y comprobando el modelo local...");
  await run(python, [join(root, "app/scripts/prepare_offline_model.py"), model]);
  console.log("\nLISTO. Cierra y vuelve a abrir INICIAR.cmd.");
  console.log("Elige las voces que dicen «local sin API». No requieren cuenta, clave ni saldo.");
} catch (error) {
  console.error("\nNo se completó la activación: " + error.message);
  console.error("Revisa Internet y espacio libre. Puedes ejecutar este archivo otra vez para continuar.");
  process.exitCode = 1;
}
