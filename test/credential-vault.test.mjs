import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const require = createRequire(import.meta.url);
const { createCredentialVault } = require('../desktop/credential-vault.cjs');

test('credenciales cifradas persisten por usuario y no se escriben en texto', async () => {
  const root = await mkdtemp(join(tmpdir(), 'streamvoice-vault-'));
  const key = randomBytes(32);
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: text => { const iv=randomBytes(12), c=createCipheriv('aes-256-gcm',key,iv); const body=Buffer.concat([c.update(text,'utf8'),c.final()]); return Buffer.concat([iv,c.getAuthTag(),body]); },
    decryptString: bytes => { const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12)); d.setAuthTag(bytes.subarray(12,28)); return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString(); },
  };
  try {
    const vault=createCredentialVault(root,safeStorage);
    await vault.save('amiga',{FISH_API_KEY:'clave-de-prueba'});
    assert.deepEqual(await vault.load('amiga'),{FISH_API_KEY:'clave-de-prueba'});
    assert.deepEqual(await vault.load('otro'),{});
    assert.equal((await readFile(join(root,'credentials','amiga.bin'))).includes(Buffer.from('clave-de-prueba')),false);
    await assert.rejects(vault.save('../otro',{}));
    await assert.rejects(createCredentialVault(root,{...safeStorage,isEncryptionAvailable:()=>false}).save('amiga',{}),/cifrado/);
    assert.deepEqual(await vault.load('amiga'),{FISH_API_KEY:'clave-de-prueba'});
  } finally { await rm(root,{recursive:true,force:true}); }
});
