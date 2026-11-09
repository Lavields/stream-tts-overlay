const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// Encrypt with the operating system's credential store; never fall back to plaintext.
function createCredentialVault(root, safeStorage) {
  const directory = path.join(root, 'credentials');
  function fileFor(user) {
    if (!/^[a-z0-9][a-z0-9_.-]{2,49}$/.test(user)) throw Error('Usuario inválido.');
    return path.join(directory, user + '.bin');
  }
  function available() {
    if (!safeStorage.isEncryptionAvailable()) throw Error('El almacenamiento cifrado del sistema no está disponible.');
  }
  return {
    async load(user) {
      const file = fileFor(user);
      let data;
      try { data = await fs.readFile(file); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
      available();
      const value = JSON.parse(safeStorage.decryptString(data));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Credenciales guardadas inválidas.');
      return value;
    },
    async save(user, value) {
      const file = fileFor(user);
      available();
      const data = safeStorage.encryptString(JSON.stringify(value));
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const tmp = file + '.' + crypto.randomBytes(12).toString('hex') + '.tmp';
      try {
        await fs.writeFile(tmp, data, { mode: 0o600, flag: 'wx' });
        await fs.rename(tmp, file);
      } finally { await fs.rm(tmp, { force: true }); }
    },
  };
}
module.exports = { createCredentialVault };
