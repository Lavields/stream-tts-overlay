import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {characterAvatars,normalizeAvatar,avatarSVG} from '../public/avatars.js';
import {allowedAvatar} from '../auth.mjs';

test('el gato de personaje tienen cuatro estados, miniaturas y permisos correctos',async()=>{
  assert.deepEqual(characterAvatars.map(a=>a.id),['cat-calvo']);
  const metadata=JSON.parse(await readFile(new URL('../docs/avatars/character-avatar-sprites.json',import.meta.url)));
  assert.deepEqual(metadata.assets.map(a=>a.id),characterAvatars.map(a=>a.id));
  assert.deepEqual(metadata.layout,['closed','open','closed-blink','open-blink']);
  for(const item of metadata.assets){
    const sprite=await readFile(new URL('../'+item.sprite,import.meta.url));
    const thumb=await readFile(new URL('../'+item.thumbnail,import.meta.url));
    assert.equal(createHash('sha256').update(sprite).digest('hex'),item.sha256,item.id);
    assert.equal(new Set(item.frameHashes).size,4,item.id);
    assert.equal(sprite.readUInt32BE(16),1024);assert.equal(sprite.readUInt32BE(20),1024);
    assert.equal(sprite[25],6);
    assert.equal(thumb.readUInt32BE(16),160);assert.equal(thumb.readUInt32BE(20),160);
    assert.ok(sprite.length<2_000_000,item.id);assert.ok(thumb.length<100_000,item.id);
    assert.equal(normalizeAvatar(item.id),item.id);
    assert.ok(avatarSVG(item.id).includes(`/assets/avatars/${item.id}-sprites.png`));
    assert.equal(allowedAvatar('admin',item.id),true);
    assert.equal(allowedAvatar('streamer1',item.id),true);
    assert.equal(allowedAvatar('streamer2',item.id),false);
  }
});
