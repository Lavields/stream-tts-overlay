import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const {reserveRelease}=createRequire(import.meta.url)('../desktop/reserve-release.cjs');

test('reservar una versión existente falla sin alterar sus archivos',async()=>{
 const root=await mkdtemp(join(tmpdir(),'streamvoice-release-'));
 try {
  const target=join(root,'dist','windows-installer-1.8.13');
  await reserveRelease(target,'1.8.13');
  await writeFile(join(target,'paquete'),'contenido original');
  await assert.rejects(reserveRelease(target,'1.8.13'),/Ya existe/);
  assert.equal(await readFile(join(target,'paquete'),'utf8'),'contenido original');
  const outcomes=await Promise.allSettled([reserveRelease(join(root,'dist','next'),'1.8.14'),reserveRelease(join(root,'dist','next'),'1.8.14')]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 } finally {await rm(root,{recursive:true,force:true});}
});
