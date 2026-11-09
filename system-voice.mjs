import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const execute = promisify(execFile);
let voices;
export async function macSystemVoices() {
  if (process.platform !== "darwin") return [];
  if (!voices) {
    const { stdout } = await execute("/usr/bin/say", ["-v", "?"], { timeout: 10000 });
    voices = [...new Map(stdout.split("\n").map(line => {
      const m = line.match(/^(.*?)\s+(es_[A-Z]{2})\s+#/);
      return m ? [m[1].trim(), { name: m[1].trim(), lang: m[2].replace("_", "-") }] : null;
    }).filter(Boolean)).values()];
  }
  return voices;
}
export function chooseMacVoice(available, id = "default", name = "") {
  const normalize = value => value.normalize("NFC").toLowerCase().trim();
  if (id === "default") return available.find(v => v.name.startsWith("Mónica")) || available[0];
  const query = normalize(name || id);
  const match = available.find(v => normalize(v.name) === query) ||
    available.find(v => normalize(v.name).startsWith(query + " ("));
  if (!match) throw Error("Esta voz del sistema no está disponible para nivelación en este Mac.");
  return match;
}
export async function macSystemSpeech(text, id, name, signal) {
  if (typeof text !== "string" || !text.trim() || text.length > 650 ||
      typeof id !== "string" || id.length > 300 || typeof name !== "string" || name.length > 200)
    throw Error("Voz o texto del sistema inválido.");
  const voice = chooseMacVoice(await macSystemVoices(), id, name);
  if (!voice) throw Error("No hay voces del sistema en español instaladas.");
  const dir = await mkdtemp(join(tmpdir(), "streamvoice-system-"));
  try {
    const file = join(dir, "speech.wav");
    // Text enters through stdin, never as command flags or shell syntax.
    await new Promise((resolve, reject) => {
      const child = execFile("/usr/bin/say", ["-v", voice.name, "-o", file,
        "--file-format=WAVE", "--data-format=LEI16@24000"], { signal, timeout: 45000 },
      error => error ? reject(error) : resolve());
      child.stdin.on("error", () => {});
      child.stdin.end(text);
    });
    return await readFile(file);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
