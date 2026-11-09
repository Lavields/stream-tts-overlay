import {packager} from '@electron/packager';
import {readFile,writeFile,cp,mkdir,rm,access,chmod} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const cache=join(root,'.build-cache'),stage=join(cache,'desktop-stage');
const version=process.env.STREAMVOICE_DESKTOP_VERSION||JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
if(!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version))throw Error('Versión de escritorio inválida.');
const output=join(root,'dist','escritorio-'+version);
const identity=join(root,'.data','desktop-control'),certificate=join(identity,'control-cert.pem'),privateKey=join(identity,'control-key.pem');
await mkdir(identity,{recursive:true,mode:0o700});
let haveCert=true,haveKey=true;try{await access(certificate);}catch{haveCert=false;}try{await access(privateKey);}catch{haveKey=false;}
if(haveCert!==haveKey)throw Error('La identidad de administración está incompleta. Restaura la clave y el certificado originales.');
if(!haveCert){
 const created=spawnSync('openssl',['req','-x509','-newkey','rsa:3072','-sha256','-nodes','-days','3650','-keyout',privateKey,'-out',certificate,'-subj','/CN=streamvoice-control'],{stdio:'ignore'});
 if(created.status!==0)throw Error('No se pudo generar la identidad de administración.');await chmod(privateKey,0o600);
}
await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});await mkdir(output,{recursive:true});
for(const file of ['server.mjs','auth.mjs','remote-auth.mjs','provision-auth.mjs','resource-utils.mjs','lib.mjs','starvios.mjs','kick-public.mjs','twitch-followers.mjs','edge-tts.mjs','system-voice.mjs','package.json','package-lock.json']) await cp(join(root,file),join(stage,file));
if(process.env.STREAMVOICE_DESKTOP_VERSION){const pkg=JSON.parse(await readFile(join(stage,'package.json'),'utf8'));pkg.version=version;await writeFile(join(stage,'package.json'),JSON.stringify(pkg,null,2)+'\n');}
for(const dir of ['public','control','desktop']) await cp(join(root,dir),join(stage,dir),{recursive:true,filter:p=>!p.endsWith('.DS_Store') && p!==join(root,'desktop','windows-tools')});
await mkdir(join(stage,'scripts'));await cp(join(root,'scripts/edge_tts_bridge.py'),join(stage,'scripts/edge_tts_bridge.py'));
const install=spawnSync('npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:stage,stdio:'inherit'});if(install.status!==0)throw Error('No se pudieron preparar las dependencias.');
const electronVersion=JSON.parse(await readFile(join(root,'node_modules/electron/package.json'),'utf8')).version;
const targets=[
 {platform:'darwin',arch:'arm64',owner:true,name:'StreamVoice Administrador',runtime:'portable-macos-arm64-1.5.1'},
 {platform:'darwin',arch:'arm64',owner:false,name:'StreamVoice',runtime:'portable-macos-arm64-1.5.1'},
 {platform:'darwin',arch:'x64',owner:false,name:'StreamVoice',runtime:'desktop-runtime-darwin-x64'},
 {platform:'win32',arch:'x64',owner:false,name:'StreamVoice',runtime:'portable-windows-x64-1.5.1'},
];
for(const target of targets){
 const config=join(cache,'desktop-config.json');await writeFile(config,JSON.stringify({owner:target.owner,controlUrl:process.env.STREAMVOICE_CONTROL_URL||'',cloudControlUrl:process.env.STREAMVOICE_CLOUD_CONTROL_URL||'',updateFeed:process.env.STREAMVOICE_UPDATE_FEED||''})+'\n');
 let python=join(cache,target.runtime,'runtime','python');
 try { await access(target.platform==='darwin'&&target.arch==='x64'?join(cache,target.runtime,'.ready'):python); } catch {
  if(target.platform==='darwin'&&target.arch==='x64'){
   const prep=spawnSync('python3',['scripts/prepare-desktop-python-intel.py'],{cwd:root,stdio:'inherit'});
   if(prep.status!==0)throw Error('No se pudo preparar Python para Mac Intel.');
   python=join(cache,'desktop-runtime-darwin-x64','runtime','python');
  } else {
  const runtimeDir=join(cache,'desktop-runtime-'+target.platform+'-'+target.arch);
  await rm(runtimeDir,{recursive:true,force:true});await mkdir(runtimeDir,{recursive:true});
  const platform=target.platform==='win32'?'windows-x64':'macos-arm64';
  const prep=spawnSync('python3',['-c','from pathlib import Path; import sys; from scripts.build_portable import runtimes; runtimes(Path(sys.argv[1]),sys.argv[2])',runtimeDir,platform],{cwd:root,stdio:'inherit'});
  if(prep.status!==0)throw Error('No se pudo preparar Python para '+platform);
  python=join(runtimeDir,'runtime','python');
  }
 }
 console.log(`Preparando ${target.name} ${target.platform}-${target.arch}…`);
 const paths=await packager({dir:stage,out:output,name:target.name,platform:target.platform,arch:target.arch,electronVersion,overwrite:true,prune:false,asar:false,appBundleId:target.owner?'cl.streamvoice.admin':'cl.streamvoice.app',icon:join(root,'desktop',target.platform==='darwin'?'icon.icns':'icon.ico'),extraResource:[python,config,certificate,...(target.owner?[privateKey]:[])]});
 const folder=paths[0],archive=folder+'.zip';
 await cp(join(root,'desktop',process.env.STREAMVOICE_CLOUD_CONTROL_URL?'LEEME-NUBE-PRUEBA.txt':target.owner?'LEEME-ADMIN.txt':'LEEME-AMIGOS.txt'),join(folder,'LEEME.txt'));
 await rm(archive,{force:true});
 const zip=spawnSync('/usr/bin/ditto',['-c','-k','--keepParent',folder,archive],{stdio:'inherit'});if(zip.status!==0)throw Error('No se pudo comprimir '+folder);
 if(target.owner)await chmod(archive,0o600);
 console.log('LISTO '+archive);
}
