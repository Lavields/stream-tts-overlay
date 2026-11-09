const { mkdir } = require('node:fs/promises');
const { dirname } = require('node:path');
async function reserveRelease(out, version) {
  await mkdir(dirname(out), { recursive: true });
  try { await mkdir(out); } catch (error) {
    if (error.code === 'EEXIST') throw Error(`Ya existe la salida para ${version}: ${out}. Conserva los artefactos y elige una versión nueva.`);
    throw error;
  }
}
module.exports = { reserveRelease };
