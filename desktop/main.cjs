const { app, BrowserWindow, dialog, shell, autoUpdater, safeStorage, ipcMain } = require('electron');
const { createCredentialVault } = require('./credential-vault.cjs');
const { portCandidates } = require('./port-policy.cjs');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const path = require('node:path');
const net = require('node:net');
app.setName('StreamVoice');
// Squirrel invokes the executable for shortcut lifecycle events; never start services then.
const squirrelArg = process.platform === 'win32' && process.argv.find(x => /^--squirrel-(install|updated|uninstall|obsolete)$/.test(x));
if (squirrelArg) {
 const updater = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
 if (squirrelArg !== '--squirrel-obsolete') {
  const action = squirrelArg === '--squirrel-uninstall' ? '--removeShortcut' : '--createShortcut';
  spawnSync(updater, [action, path.basename(process.execPath)], {windowsHide:true});
 }
 app.quit();
}
if (process.env.STREAMVOICE_USER_DATA_DIR) app.setPath('userData',path.resolve(process.env.STREAMVOICE_USER_DATA_DIR));
const appRoot = app.getAppPath();
let settings={};
try { settings=JSON.parse(readFileSync(path.join(process.resourcesPath,'desktop-config.json'),'utf8')); } catch {}
if (process.platform === 'win32' && settings.squirrelId === 'streamvoice_pruebas' && !process.env.STREAMVOICE_USER_DATA_DIR) app.setPath('userData',path.join(app.getPath('appData'),'StreamVoice Pruebas'));
const dataRoot = app.getPath('userData');
const vault = createCredentialVault(dataRoot, safeStorage);
if (process.platform === 'win32') { const id = settings.squirrelId === 'streamvoice_pruebas' ? 'streamvoice_pruebas' : 'streamvoice_app'; app.setAppUserModelId(`com.squirrel.${id}.streamvoice`); }
if (!app.isPackaged && process.env.STREAMVOICE_OWNER_MODE==='1') settings.owner=true;
let mainWindow, studio, control, shuttingDown=false;
let updateCheckPromise, updateDownloading=false, updateReady=false, updateCheckInFlight=false, updateFeedConfigured=false;
let studioPort;
const bootstrap=randomBytes(32).toString('hex');
const cleanEnv={...process.env,ELECTRON_RUN_AS_NODE:'1',PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8'};
for (const key of ['NODE_OPTIONS','PORT','FISH_API_KEY','FISH_MODEL','ELEVENLABS_API_KEY','YOUTUBE_API_KEY','TWITCH_USERNAME','TWITCH_OAUTH_TOKEN','KICK_ACCESS_TOKEN','KICK_WEBHOOK_READY','EULER_API_KEY','AUTH_ACCOUNTS_FILE','PYTHONPATH','PYTHONHOME']) delete cleanEnv[key];
const python=app.isPackaged ? path.join(process.resourcesPath,'python',...(process.platform==='win32'?['python.exe']:['bin','python3'])) : path.join(appRoot,'.venv',...(process.platform==='win32'?['Scripts','python.exe']:['bin','python']));
const certificate=app.isPackaged?path.join(process.resourcesPath,'control-cert.pem'):path.join(appRoot,'.data','desktop-control','control-cert.pem');
const privateKey=app.isPackaged?path.join(process.resourcesPath,'control-key.pem'):path.join(appRoot,'.data','desktop-control','control-key.pem');
function launch(script, env, marker) {
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(appRoot,script)],{cwd:appRoot,env:{...cleanEnv,...env},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
  if(script==='server.mjs') child.on('message',async msg=>{
   if(!msg||msg.type!=='credential-vault'||!Number.isSafeInteger(msg.id))return;
   try {
    const value=msg.action==='load'?await vault.load(msg.user):msg.action==='save'?await vault.save(msg.user,msg.value):(()=>{throw Error('Operación inválida.');})();
    if(child.connected)child.send({type:'credential-vault-result',id:msg.id,value:value??null});
   } catch(e){if(child.connected)child.send({type:'credential-vault-result',id:msg.id,error:e.message});}
  });
  let done=false,stderr='';const timer=setTimeout(()=>finish(Error('El servicio tardó demasiado en iniciar.')),20000);
  function finish(err){if(done)return;done=true;clearTimeout(timer);if(err){child.kill();reject(err);}else resolve(child);}
  child.stdout.on('data',data=>{if(data.toString().includes(marker))finish();});
  child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-3000);});
  child.on('error',()=>finish(Error('No se pudo iniciar el servicio.')));
  child.on('exit',()=>{if(!done)finish(Error(stderr.includes('EADDRINUSE')?'El puerto de la aplicación ya está en uso. Cierra la otra instancia.':'No se pudo iniciar el servicio.'));else if(!shuttingDown)dialog.showErrorBox('StreamVoice','El servicio se cerró. Reinicia la aplicación.');});
 });
}
async function start(){
 mkdirSync(dataRoot,{recursive:true,mode:0o700});
 studioPort=await choosePort('studio-port.json',[4317,...Array.from({length:30},(_,i)=>4319+i)],true);
 let controlPort=4318;
 if(settings.owner&&!settings.cloudControlUrl){controlPort=await choosePort('control-port.json',[4318,...Array.from({length:30},(_,i)=>4350+i)]);control=await launch('control/server.mjs',{CONTROL_DATA:path.join(dataRoot,'control-accounts.json'),CONTROL_STATE:path.join(dataRoot,'control-network.json'),CONTROL_BOOTSTRAP:bootstrap,CONTROL_PORT:String(controlPort),...(existsSync(certificate)&&existsSync(privateKey)?{CONTROL_CERT:certificate,CONTROL_KEY:privateKey}:{})},'CONTROL_READY');}
 studio=await launch('server.mjs',{PORT:String(studioPort),STREAMVOICE_CREDENTIAL_VAULT:'1',STREAMVOICE_REMOTE_AUTH:'1',STREAMVOICE_CONTROL_OWNER:settings.owner?'1':'0',STREAMVOICE_CLOUD_CONTROL_URL:settings.cloudControlUrl||'',STREAMVOICE_CONTROL_PORT:String(controlPort),STREAMVOICE_CONTROL_URL:settings.controlUrl||'',STREAMVOICE_CONTROL_CONFIG:path.join(dataRoot,'control-config.json'),STREAMVOICE_OVERLAY_TOKENS_FILE:path.join(dataRoot,'overlay-tokens.json'),...(existsSync(certificate)?{STREAMVOICE_CONTROL_CERT:certificate}:{}),CONTROL_BOOTSTRAP:settings.owner?bootstrap:'',EDGE_TTS_PYTHON:python},'StreamVoice →');
 mainWindow=new BrowserWindow({width:1440,height:900,minWidth:920,minHeight:640,backgroundColor:'#101116',show:false,title:'StreamVoice',icon:path.join(appRoot,'public/assets/branding/logo.png'),webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,preload:path.join(appRoot,'desktop/preload.cjs')}});
 mainWindow.once('ready-to-show',()=>mainWindow.show());
 mainWindow.webContents.setWindowOpenHandler(({url})=>{try{if(['https:','http:'].includes(new URL(url).protocol))void shell.openExternal(url);}catch{}return {action:'deny'};});
 mainWindow.webContents.on('will-navigate',(event,url)=>{try{const u=new URL(url);if(u.origin!==`http://localhost:${studioPort}`&&u.origin!==`http://127.0.0.1:${studioPort}`){event.preventDefault();if(u.protocol==='https:')void shell.openExternal(url);}}catch{event.preventDefault();}});
 await mainWindow.loadURL(`http://localhost:${studioPort}`);
 setupUpdates();
}
async function choosePort(file,candidates,preserveOrigin=false){
 const target=path.join(dataRoot,file);let saved;try{saved=Number(JSON.parse(readFileSync(target,'utf8')).port);}catch{}
 const validSaved=Number.isInteger(saved)&&saved>1023&&saved<65536;
 for(const port of portCandidates(saved,existsSync(target),candidates,preserveOrigin)){
  const available=await new Promise(resolve=>{const probe=net.createServer();probe.once('error',()=>resolve(false));probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(true)));});
  if(available){writeFileSync(target,JSON.stringify({port}));return port;}
 }
 if(preserveOrigin&&validSaved) throw Error(`El puerto ${saved} de StreamVoice está ocupado. Cierra la otra aplicación que lo usa y vuelve a abrir StreamVoice para conservar tus ajustes y sonidos.`);
 throw Error('No hay un puerto local disponible para iniciar la aplicación.');
}
function updatesEnabled() {
 if (!app.isPackaged || process.platform !== 'win32' || !settings.updateInstallerReady) return false;
 // Only a Squirrel installation has Update.exe in the parent of app-VERSION.
 if (!existsSync(path.resolve(path.dirname(process.execPath), '..', 'Update.exe'))) return false;
 try { const url = new URL(settings.updateFeed); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash; } catch { return false; }
}
function checkUpdates() {
 if (!updatesEnabled()) return Promise.resolve({status:'unavailable'});
 if (!updateFeedConfigured) return Promise.resolve({status:'error'});
 if (updateReady || updateDownloading) return Promise.resolve({status:'available'});
 if (updateCheckPromise) return updateCheckPromise;
 // A timed-out Electron request may still finish later; do not start another one.
 if (updateCheckInFlight) return Promise.resolve({status:'error'});
 updateCheckInFlight=true;
 updateCheckPromise = new Promise(resolve => {
  let finished = false;
  const finish = status => {
   if (finished) return; finished = true;
   clearTimeout(timer);
   autoUpdater.removeListener('update-not-available', none);
   autoUpdater.removeListener('update-available', available);
   autoUpdater.removeListener('error', error);
   resolve({status});
  };
  const none=()=>{updateCheckInFlight=false;finish('current');}, available=()=>{updateCheckInFlight=false;updateDownloading=true;finish('available');}, error=()=>{updateCheckInFlight=false;updateDownloading=false;finish('error');};
  autoUpdater.once('update-not-available',none); autoUpdater.once('update-available',available); autoUpdater.once('error',error);
  const timer=setTimeout(()=>{ resolve({status:'error'}); },60000);
  try { autoUpdater.checkForUpdates(); } catch { updateCheckInFlight=false; finish('error'); }
 }).finally(()=>{updateCheckPromise=null;});
 return updateCheckPromise;
}
function setupUpdates(){
 if (!updatesEnabled()) return;
 try { autoUpdater.setFeedURL({url:settings.updateFeed.replace(/\/$/,'')}); updateFeedConfigured=true; } catch { return; }
 autoUpdater.on('error',()=>{updateDownloading=false;});
 autoUpdater.on('update-downloaded',async()=>{
  updateDownloading=false; updateReady=true;
  const result=await dialog.showMessageBox(mainWindow,{type:'info',title:'Actualización disponible',message:'Hay una actualización lista para instalar.',buttons:['Instalar y reiniciar','Más tarde'],defaultId:0,cancelId:1});
  if(result.response===0)autoUpdater.quitAndInstall();
 });
 // Squirrel holds an installation lock briefly on first run. Retry at subsequent launches.
 setTimeout(()=>void checkUpdates(),process.argv.includes('--squirrel-firstrun')?15000:10000);
 setInterval(()=>void checkUpdates(),24*60*60*1000);
}
ipcMain.handle('updates:check', async event => {
 if(!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return {status:'error'};
 return checkUpdates();
});
const lock=app.requestSingleInstanceLock();
if(squirrelArg || !lock)app.quit();else{
 app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
 app.whenReady().then(start).catch(error=>{dialog.showErrorBox('No se pudo iniciar StreamVoice',error.message);app.quit();});
 app.on('window-all-closed',()=>app.quit());
 const stopServices=()=>{shuttingDown=true;studio?.kill();control?.kill();};
 app.on('before-quit',stopServices);
 app.on('before-quit-for-update',stopServices);
}
