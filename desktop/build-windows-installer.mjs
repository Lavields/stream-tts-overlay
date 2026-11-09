import { readFile, writeFile, cp, mkdir, rm, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
if(process.platform!=='win32') throw Error('Este constructor requiere Windows.');
const { reserveRelease }=createRequire(import.meta.url)('./reserve-release.cjs');
const windowsTools=join(root,'desktop','windows-tools');
const requireWindows=createRequire(join(windowsTools,'package.json'));
const { packager }=requireWindows('@electron/packager');
const { createWindowsInstaller }=requireWindows('electron-winstaller');
const version=process.env.STREAMVOICE_DESKTOP_VERSION || JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Usa una versión numérica X.Y.Z.');
const packageId=process.env.STREAMVOICE_TEST_PACKAGE_ID || 'streamvoice_app';
if(!['streamvoice_app','streamvoice_pruebas'].includes(packageId)) throw Error('Identidad de paquete inválida.');
const testBuild=packageId==='streamvoice_pruebas';
const feed=process.env.STREAMVOICE_UPDATE_FEED;
let url; try { url=new URL(feed); } catch { throw Error('Define STREAMVOICE_UPDATE_FEED como URL HTTPS del directorio del canal.'); }
if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash) throw Error('El canal debe ser HTTPS y no contener credenciales, consulta ni fragmento.');
const cert=join(root,'.data','desktop-control','control-cert.pem');
await access(cert); // Public certificate only. Never create or copy the administrator key.
const python=resolve(process.env.STREAMVOICE_WINDOWS_PYTHON_RUNTIME || join(root,'.build-cache','desktop-runtime-win32-x64','runtime','python'));
await access(join(python,'python.exe'));
const stage=join(root,'.build-cache','windows-installer-stage');
const out=join(root,'dist',`windows-installer-${testBuild?'pruebas-':''}${version}`);
// Do not overwrite existing release artifacts, including a partial build.
await reserveRelease(out,version);
await rm(stage,{recursive:true,force:true}); await mkdir(stage,{recursive:true});
for(const file of ['server.mjs','auth.mjs','remote-auth.mjs','provision-auth.mjs','resource-utils.mjs','lib.mjs','starvios.mjs','kick-public.mjs','twitch-followers.mjs','edge-tts.mjs','system-voice.mjs']) await cp(join(root,file),join(stage,file));
for(const file of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml']) await cp(join(windowsTools,file),join(stage,file));
for(const dir of ['public','control','desktop']) await cp(join(root,dir),join(stage,dir),{recursive:true,filter:p=>!p.endsWith('.DS_Store') && p!==windowsTools});
await mkdir(join(stage,'scripts')); await cp(join(root,'scripts','edge_tts_bridge.py'),join(stage,'scripts','edge_tts_bridge.py'));
const pkg=JSON.parse(await readFile(join(stage,'package.json'),'utf8')); pkg.version=version; await writeFile(join(stage,'package.json'),JSON.stringify(pkg,null,2)+'\n');
const htmlPath=join(stage,'public','index.html');
const html=await readFile(htmlPath,'utf8');
const versionMarker=/(StreamVoice <i>✦<\/i> v)\d+\.\d+\.\d+/;
if(!versionMarker.test(html)) throw Error('No se encontró la versión visible del estudio.');
await writeFile(htmlPath,html.replace(versionMarker,(_,prefix)=>prefix+version));
const pnpm=spawnSync('pnpm.cmd',['install','--prod','--frozen-lockfile','--ignore-scripts','--config.node-linker=hoisted'],{cwd:stage,stdio:'inherit',shell:true});
if(pnpm.status!==0) throw Error('Falló pnpm install en el área de preparación.');
const config=join(root,'.build-cache','windows-desktop-config.json');
await writeFile(config,JSON.stringify({owner:false,squirrelId:packageId,controlUrl:process.env.STREAMVOICE_CONTROL_URL||'',cloudControlUrl:process.env.STREAMVOICE_CLOUD_CONTROL_URL||'',updateFeed:url.href,updateInstallerReady:true})+'\n');
const electronVersion=JSON.parse(await readFile(requireWindows.resolve('electron/package.json'),'utf8')).version;
const [appDirectory]=await packager({dir:stage,out,name:'streamvoice',executableName:'streamvoice',platform:'win32',arch:'x64',electronVersion,win32metadata:{CompanyName:testBuild?'StreamVoice Pruebas':'StreamVoice',ProductName:testBuild?'StreamVoice Pruebas':'StreamVoice',FileDescription:testBuild?'StreamVoice Pruebas':'StreamVoice'},overwrite:true,prune:false,asar:false,icon:join(root,'desktop','icon.ico'),extraResource:[python,config,cert]});
// Electron expects this exact resource name.
await cp(config,join(appDirectory,'resources','desktop-config.json'));
await rm(join(appDirectory,'resources','windows-desktop-config.json'),{force:true});
await createWindowsInstaller({appDirectory,outputDirectory:join(out,'releases'),name:packageId,authors:'StreamVoice',exe:'streamvoice.exe',setupExe:'StreamVoice-Setup.exe',setupIcon:join(root,'desktop','icon.ico'),noMsi:true,noDelta:true});
console.log('Preparado para pruebas locales:',join(out,'releases'));
