import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundCooldown, soundCooldownMs } from '../public/sound-cooldown.js';
const store = () => {
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
};
test('the remix may start once every five minutes; denied calls do not extend the wait', async()=>{
  let time=1_000_000,plays=0;
  const cooldown=createSoundCooldown({storage:store(),now:()=>time});
  assert.equal(soundCooldownMs[90],300000);
  assert.equal(cooldown.remaining(90),0);
  assert.equal(await cooldown.start(90,()=>{plays++;}),true);
  time+=299999;
  assert.equal(cooldown.remaining(90),1);
  assert.equal(await cooldown.start(90,()=>{plays++;}),false);
  time++;
  assert.equal(cooldown.remaining(90),0);
  assert.equal(await cooldown.start(90,()=>{plays++;}),true);
  assert.equal(plays,2);
});
test('the wait survives page reloads and does not limit other sounds', async()=>{
  let time=1_000_000;const storage=store();
  const first=createSoundCooldown({storage,now:()=>time});
  await first.start(90,()=>true);
  time+=60000;
  const reloaded=createSoundCooldown({storage,now:()=>time});
  assert.equal(reloaded.remaining(90),240000);
  assert.equal(await reloaded.start(90,()=>assert.fail('must not start')),false);
  for(let i=0;i<5;i++)assert.equal(await reloaded.start(15,()=>true),true);
  assert.equal(reloaded.remaining(15),0);
});
test('cancelled and failed starts do not consume the cooldown; storage errors retain the in-memory limit', async()=>{
  const cooldown=createSoundCooldown({now:()=>1_000_000,storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});
  assert.equal(await cooldown.start(90,()=>false),false);
  await assert.rejects(cooldown.start(90,()=>{throw Error('audio failed');}),/audio failed/);
  assert.equal(cooldown.remaining(90),0);
  assert.equal(await cooldown.start(90,()=>true),true);
  assert.equal(cooldown.remaining(90),300000);
  assert.equal(await cooldown.start(90,()=>assert.fail('must not start')),false);
});
test('same-origin tabs serialize starts and share the limit', async()=>{
  let tail=Promise.resolve();const storage=store();
  const locks={request(name,callback){
    assert.equal(name,'streamvoice-sound-start:90');
    const result=tail.then(callback);tail=result.catch(()=>{});return result;
  }};
  const a=createSoundCooldown({storage,locks,now:()=>1_000_000});
  const b=createSoundCooldown({storage,locks,now:()=>1_000_000});
  let plays=0;
  const results=await Promise.all([a.start(90,()=>{plays++;}),b.start(90,()=>{plays++;})]);
  assert.deepEqual(results,[true,false]);
  assert.equal(plays,1);
});
