import { readFile, mkdir, writeFile, link, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// A delivery contains only salted hashes for its recipient. OBS secrets are
// generated locally and never travel in the archive or provisioning template.
export async function readAccounts(path, template) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT' || !template) throw error; }
  const seeds = JSON.parse(await readFile(template, 'utf8'));
  if (!Array.isArray(seeds) || !seeds.length || seeds.some(row =>
    !/^(admin|streamer1|streamer2)$/.test(row.username) ||
    !/^[a-f0-9]{32,}$/.test(row.salt) || !/^[a-f0-9]{128}$/.test(row.passwordHash) ||
    Object.keys(row).some(k => !['username','salt','passwordHash'].includes(k))))
    throw Error('Plantilla de acceso inválida. Vuelve a extraer el paquete.');
  const rows = seeds.map(row => ({ ...row, overlayToken: randomBytes(32).toString('hex') }));
  const target = path instanceof URL ? fileURLToPath(path) : path;
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temp = target + '.' + randomBytes(8).toString('hex') + '.tmp';
  try {
    await writeFile(temp, JSON.stringify(rows) + '\n', { mode: 0o600, flag: 'wx' });
    // Atomic create-without-overwrite, including when two launchers race.
    try { await link(temp, target); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  } finally { await unlink(temp).catch(() => {}); }
  return JSON.parse(await readFile(target, 'utf8'));
}
