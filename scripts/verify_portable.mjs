import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import net from 'node:net';
const exec = promisify(execFile);
const archives=process.argv.slice(2).filter(a=>!a.startsWith('--'));
assert.ok(archives.length,'Pass one or more .zip/.tar.gz archives');
let passwords={};
if(process.argv.includes('--passwords-stdin')) {
  let input='';for await(const chunk of process.stdin)input+=chunk;passwords=JSON.parse(input);
}
const results=[],tokens=new Set();
for(const archiveArg of archives) {
  const archive=resolve(archiveArg),bytes=await readFile(archive);
  const digest=createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest,(await readFile(archive+'.sha256','utf8')).split(/\s+/)[0]);
  const temp=await mkdtemp(join(tmpdir(),'streamvoice-clean-'));
  let child;
  try {
    if(archive.endsWith('.zip'))await exec('/usr/bin/unzip',['-q',archive,'-d',temp]);
    else await exec('/usr/bin/tar',['-xzf',archive,'-C',temp]);
    const entries=await readdir(temp);assert.equal(entries.length,1);
    const root=join(temp,entries[0]),app=join(root,'app');
    const manifest=JSON.parse(await readFile(join(root,'MANIFEST.json'),'utf8'));
    assert.equal(manifest.version,JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version);
    assert.equal(manifest.providerKeysIncluded,false);assert.equal(manifest.overlayTokensIncluded,false);
    assert.equal(manifest.plaintextPasswordsIncluded,false);assert.equal(manifest.retiredLocalEnginesIncluded,false);
    const files=[];
    async function walk(dir,prefix='') {
      for(const item of await readdir(dir,{withFileTypes:true})) {
        const name=prefix+item.name;
        if(item.isDirectory())await walk(join(dir,item.name),name+'/');
        else files.push(name);
      }
    }
    await walk(root);
    const regular=files.filter(f=>Object.hasOwn(manifest.files,f));
    for(const name of regular) {
      assert.ok(!/(^|\/)\.env$|(^|\/)\.data\/|voice-python|offline_tts_worker|local_voice_worker|setup-offline|ACTIVAR_VOCES|voice-references|\.DS_Store/.test(name),name);
      if(name.startsWith('app/'))assert.ok(!name.includes('__pycache__'),name);
      const data=await readFile(join(root,name));
      assert.equal(createHash('sha256').update(data).digest('hex'),manifest.files[name],name);
      if(name.startsWith('app/')&&!name.includes('/node_modules/')&&name!=='app/account-template.json'&&name!=='app/.env.example') {
        const source=await readFile(new URL('../'+name.slice(4),import.meta.url));
        assert.ok(data.equals(source),`Packaged source differs from current project: ${name}`);
      }
      if(name.startsWith('app/')&&!name.includes('/node_modules/')&&/\.(mjs|js|json|txt|html|py|css)$/.test(name)) {
        assert.ok(!data.includes(Buffer.from(process.env.HOME||'/home/')),name);
        assert.ok(!/sk-fish-[A-Za-z0-9_-]{12,}/.test(data.toString()),name);
        for(const password of Object.values(passwords).filter(p=>p.length>=8))assert.ok(!data.includes(Buffer.from(password)),`Plaintext password in ${name}`);
        assert.ok(!/"password"\s*:\s*"[^"]+"/.test(data.toString()),`Password literal in ${name}`);
      }
      if(manifest.target==='windows-x64'&&/\.(exe|dll|pyd)$/i.test(name)) {
        assert.equal(data.toString('ascii',0,2),'MZ',name);const pe=data.readUInt32LE(0x3c);
        assert.equal(data.toString('ascii',pe,pe+4),'PE\0\0');assert.equal(data.readUInt16LE(pe+4),0x8664,name);
      }
    }
    // Symlinks are present in the Mac archive; their resolved file contents
    // are hashed too. Every file must belong to the original manifest.
    assert.deepEqual(files.filter(f=>f!=='MANIFEST.json').sort(),Object.keys(manifest.files).sort());
    const seed=JSON.parse(await readFile(join(app,'account-template.json'),'utf8'));
    assert.equal(seed.length,1);assert.equal(seed[0].username,manifest.recipient);
    assert.deepEqual(Object.keys(seed[0]).sort(),['passwordHash','salt','username']);
    const packagedAuth=await import(pathToFileURL(join(app,'auth.mjs')));
    const packagedLib=await import(pathToFileURL(join(app,'lib.mjs')));
    assert.equal(packagedLib.channelName('https://starvios.com/live/streamer1','starvios'),'streamer1');
    assert.deepEqual(packagedLib.tiktokMessage({user:{displayId:'test-user',nickname:'Prueba'},common:{msgId:'123'},content:'Hola'}),{user:'test-user',displayName:'Prueba',id:'123',text:'Hola'});
    const publicKick=await import(pathToFileURL(join(app,'kick-public.mjs')));
    assert.equal(typeof publicKick.connectKickPublic,'function');
    const user=manifest.recipient,policy=packagedAuth.policies[user];
    assert.ok(policy);
    if(user==='streamer1')assert.deepEqual(policy.avatars,['cat-chile','cat-peru','cat-calvo']);
    if(user==='streamer2'){assert.equal(policy.avatars.length,7);assert.deepEqual(policy.channels.tiktok,['streamer2']);}
    if(user==='admin'){assert.equal(policy.avatars,null);assert.equal(policy.channels,null);}
    const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
    const port=probe.address().port;await new Promise(r=>probe.close(r));
    const env={...process.env,PORT:String(port)};
    for(const key of ['AUTH_ACCOUNTS_FILE','NODE_OPTIONS','ELEVENLABS_API_KEY','FISH_API_KEY','YOUTUBE_API_KEY','TWITCH_USERNAME','TWITCH_OAUTH_TOKEN','KICK_ACCESS_TOKEN','EULER_API_KEY','FISH_MODEL','KICK_WEBHOOK_READY','PYTHONHOME','PYTHONPATH'])delete env[key];
    const nativeMac=manifest.target==='macos-arm64'&&process.platform==='darwin'&&process.arch==='arm64';
    const node=nativeMac?join(root,'runtime/node/bin/node'):process.execPath;
    if(nativeMac) {
      const python=join(root,'runtime/python/bin/python3');
      await exec(python,['-c','import edge_tts, ssl, aiohttp; print("Bundled Python imports OK")'],{env});
      env.EDGE_TTS_PYTHON=python;
    }
    child=spawn(node,['server.mjs'],{cwd:app,env,stdio:['ignore','pipe','pipe']});
    let errors='';child.stderr.on('data',b=>errors+=b);
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error(errors)}),new Promise((_,j)=>setTimeout(()=>j(Error('Startup timeout')),7000).unref())]);
    const provisioned=JSON.parse(await readFile(join(app,'.data/accounts.json'),'utf8'));
    assert.equal(provisioned.length,1);assert.equal(provisioned[0].passwordHash,seed[0].passwordHash);
    assert.ok(!tokens.has(provisioned[0].overlayToken));tokens.add(provisioned[0].overlayToken);
    const base=`http://127.0.0.1:${port}`;
    const get=(path,cookie='',extra={})=>fetch(base+path,{redirect:'manual',headers:{Cookie:cookie,...extra}});
    const post=(path,data,cookie='')=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
    assert.equal((await get('/api/config')).status,401);assert.equal((await get('/')).status,302);
    assert.equal((await get('/login')).status,200);
    assert.ok(passwords[user],`Supply recipient password via --passwords-stdin for ${user}`);
    const login=await post('/api/auth/login',{username:user==='admin'?'Admin':user,password:passwords[user]});
    assert.equal(login.status,200,`Recipient login failed: ${user}`);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const me=await (await get('/api/auth/me',cookie)).json();assert.equal(me.username,user);
    const config=await (await get('/api/config',cookie)).json();assert.ok(Object.values(config.configured).every(v=>v===false));
    for(const other of ['streamer1','streamer2','admin'].filter(x=>x!==user)) {
      assert.equal((await post('/api/auth/login',{username:other,password:passwords[other]||'wrong'})).status,401);
    }
    assert.equal((await get('/',cookie)).status,200);
    const {speechSegments}=await import(pathToFileURL(join(app,'public/speech-text.js')));
    assert.deepEqual(speechSegments('Hola como estás {20} '),[{type:'speech',text:'Hola como estás.'},{type:'sound',id:20}]);
    assert.deepEqual(speechSegments('Hola como esta\u0301s { 20 }'),[{type:'speech',text:'Hola como estás.'},{type:'sound',id:20}]);
    const {phraseSoundTriggers,expressionSpeech}=await import(pathToFileURL(join(app,'public/chat-reactions.js')));
    for(const {phrase,id} of phraseSoundTriggers) assert.deepEqual(speechSegments(phrase),[{type:'sound',id}]);
    assert.match(expressionSpeech(speechSegments('muajajaja')[0],'fish'),/^\[evil laughing\]/);
    assert.equal((await get('/chat-reactions.js',cookie)).status,200);
    const {bundledSounds}=await import(pathToFileURL(join(app,'public/bundled-sounds.js')));
    for(const sound of Object.values(bundledSounds)) {
      const response=await get(sound.url,cookie);assert.equal(response.status,200);
      assert.equal(response.headers.get('content-type'),'audio/mpeg');
      assert.equal((await response.arrayBuffer()).byteLength,sound.size);
    }
    if(nativeMac&&process.argv.includes('--speech')) {
      const audio=await post('/api/speech',{provider:'edge',voiceId:'es-CL-CatalinaNeural',text:'Hola, esta es la prueba del paquete para Mac.'},cookie);
      assert.equal(audio.status,200,'Native bundled Edge speech failed');
      assert.equal(audio.headers.get('content-type'),'audio/mpeg');
      assert.ok((await audio.arrayBuffer()).byteLength>1000);
    }
    assert.deepEqual(await (await get('/api/offline-voices',cookie)).json(),{ready:false,voices:[]});
    const {avatars}=await import(pathToFileURL(join(app,'public/avatars.js')));
    for(const {id} of avatars) {
      const allowed=policy.avatars===null||policy.avatars.includes(id);
      for(const suffix of ['sprites','thumb']) {
        const path=`/assets/avatars/${id}-${suffix}.png`,r=await get(path,cookie);
        assert.equal(r.status,allowed?200:403,`${user}: ${path}`);
        if(allowed){const data=Buffer.from(await r.arrayBuffer());assert.equal(data.toString('ascii',1,4),'PNG');assert.equal(data[25],6);const tag=r.headers.get('etag');assert.equal((await get(path,cookie,{'If-None-Match':tag})).status,304);}
      }
    }
    if(policy.channels)assert.equal((await post('/api/connect',{platform:'twitch',channel:'unauthorized-channel'},cookie)).status,403);
    for(const path of ['/.env','/server.mjs','/account-template.json','/.data/accounts.json'])assert.equal((await get(path,cookie)).status,404);
    const avatar=policy.avatars?.[0]||'sock';
    assert.equal((await post('/api/overlay',{avatar,text:'Prueba {13} de OBS',speaking:true,level:0.7},cookie)).status,200);
    const overlay=await get(me.overlayUrl);assert.equal(overlay.status,200);
    const oc=overlay.headers.get('set-cookie').split(';')[0];
    const ac=new AbortController();const s=await fetch(base+'/api/events?overlay=1',{headers:{Cookie:oc},signal:ac.signal});
    const event=new TextDecoder().decode((await s.body.getReader().read()).value);assert.ok(event.includes('Prueba de OBS'));assert.ok(!event.includes('event: connections'));ac.abort();
    assert.equal((await post('/api/settings',{FISH_API_KEY:'not-a-real-key'},oc)).status,401);
    assert.equal((await post('/api/auth/logout',{},cookie)).status,200);assert.equal((await get('/api/config',cookie)).status,401);
    results.push({archive:archive.split('/').pop(),target:manifest.target,recipient:user,files:files.length,bytes:bytes.byteLength,sha256:digest,nativeRuntimeExecuted:nativeMac,checks:'integrity, clean provisioning, actual password login, recipient isolation, permissions, conditional assets, OBS, logout'});
    console.log(`PASS ${manifest.target} ${user}: ${files.length} files; ${nativeMac?'native bundled runtime':'host runtime; Windows execution pending'}`);
  } finally {
    if(child&&child.exitCode===null){const p=once(child,'exit');child.kill('SIGTERM');await p;}
    await rm(temp,{recursive:true,force:true});
  }
}
console.log(JSON.stringify(results,null,2));
