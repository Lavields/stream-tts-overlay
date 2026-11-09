import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {countryAvatars,avatarSVG} from '../public/avatars.js';
import {allowedAvatar} from '../auth.mjs';

test('country artwork has four distinct states, compact previews and registered renderer paths',async()=>{
  const metadata=JSON.parse(await readFile(new URL('../docs/avatars/country-avatar-sprites.json',import.meta.url)));
  assert.deepEqual(metadata.assets.map(a=>a.id),countryAvatars.map(a=>a.id));
  assert.deepEqual(metadata.layout,['closed','open','closed-blink','open-blink']);
  for(const item of metadata.assets){
    const sprite=await readFile(new URL('../'+item.sprite,import.meta.url));
    const thumb=await readFile(new URL('../'+item.thumbnail,import.meta.url));
    assert.equal(createHash('sha256').update(sprite).digest('hex'),item.sha256,item.id);
    assert.equal(new Set(item.frameHashes).size,4,item.id);
    assert.equal(sprite.readUInt32BE(16),1024);assert.equal(sprite.readUInt32BE(20),1024);
    assert.equal(thumb.readUInt32BE(16),160);assert.equal(thumb.readUInt32BE(20),160);
    assert.ok(sprite.length<2_000_000,item.id);assert.ok(thumb.length<100_000,item.id);
    assert.ok(avatarSVG(item.id).includes(`/assets/avatars/${item.id}-sprites.png`));
    assert.equal(allowedAvatar('admin',item.id),true);
    assert.equal(allowedAvatar('streamer1',item.id),['cat-chile','cat-peru'].includes(item.id));
    assert.equal(allowedAvatar('streamer2',item.id),false);
  }
});
