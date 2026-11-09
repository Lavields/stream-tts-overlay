import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BoundedTTLCache, sendEvent } from '../resource-utils.mjs';
import { readAccounts } from '../provision-auth.mjs';
import { policies } from '../auth.mjs';

test('Fish cache evicts least-recently-used pages and expired entries', () => {
  let time = 0; const cache = new BoundedTTLCache(2, 100, () => time);
  cache.set('a', 1); cache.set('b', 2); assert.equal(cache.get('a'), 1);
  cache.set('c', 3); assert.equal(cache.get('b'), undefined);
  time = 101; assert.equal(cache.get('a'), undefined);
  cache.set('d', 4); assert.equal(cache.entries.size, 1);
  cache.clear(); assert.equal(cache.get('d'), undefined);
});
test('slow overlay receives latest state after drain with one pending listener', () => {
  const res = new EventEmitter(); res.writableNeedDrain = true;
  const sent=[]; res.write = event => sent.push(event);
  for(let i=0;i<1000;i++)sendEvent(res,'overlay',String(i));
  assert.equal(res.listenerCount('drain'),1); assert.equal(sent.length,0);
  res.writableNeedDrain=false; res.emit('drain'); assert.deepEqual(sent,['999']);
  sendEvent(res,'chat','chat-event'); assert.deepEqual(sent,['999','chat-event']);
});
test('clean installations provision once, isolate OBS tokens and never overwrite credentials', async () => {
  const dir=await mkdtemp(join(tmpdir(),'streamvoice-provision-'));
  try {
    const template=join(dir,'seed.json');
    const seeds=[{username:'streamer1',salt:'a'.repeat(32),passwordHash:'b'.repeat(128)}];
    await writeFile(template,JSON.stringify(seeds));
    const first=join(dir,'first/accounts.json'),second=join(dir,'second/accounts.json');
    const [a,b]=await Promise.all([readAccounts(first,template),readAccounts(first,template)]);
    assert.deepEqual(a,b); assert.match(a[0].overlayToken,/^[a-f0-9]{64}$/);
    const c=await readAccounts(second,template);assert.notEqual(a[0].overlayToken,c[0].overlayToken);
    await writeFile(template,'[]');assert.deepEqual(await readAccounts(first,template),a);
    assert.equal((await readFile(first,'utf8')).includes('password"'),false);
    await assert.rejects(readAccounts(join(dir,'bad/accounts.json'),template),/inválida/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('recipient avatars exactly match requested groups', () => {
  assert.deepEqual(policies.streamer1.avatars,['cat-chile','cat-peru','cat-calvo']);
  assert.deepEqual([...policies.streamer2.avatars].sort(),['sock','male','female','chibi-ruby','cat-black','cat-calico','cat-tabby'].sort());
  assert.equal(policies.admin.avatars,null);
});
