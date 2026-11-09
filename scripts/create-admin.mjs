// Crea account-template.json con la cuenta "admin" para una instalación nueva.
// Uso: npm run setup:admin   (pide la contraseña por consola)
import { scryptSync, randomBytes } from "node:crypto";
import { writeFile, access } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

const target = new URL("../account-template.json", import.meta.url);
try { await access(target); console.log("account-template.json ya existe; no se modificó."); process.exit(0); } catch {}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = (process.env.ADMIN_PASSWORD || await rl.question("Contraseña para el usuario admin (mín. 10 caracteres): ")).trim();
rl.close();
if (password.length < 10) { console.error("La contraseña debe tener al menos 10 caracteres."); process.exit(1); }
const salt = randomBytes(16).toString("hex");
const passwordHash = scryptSync(password.slice(0, 256), salt, 64).toString("hex");
await writeFile(target, JSON.stringify([{ username: "admin", salt, passwordHash }]) + "\n", { mode: 0o600 });
console.log("Listo. Inicia con npm start y entra como admin.");
