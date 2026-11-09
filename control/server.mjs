import http from 'node:http';
import https from 'node:https';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes, scrypt as rawScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { avatars } from '../public/avatars.js';
import { freeVoices } from '../public/free-voices.js';

const scrypt = promisify(rawScrypt);
const file = process.env.CONTROL_DATA;
const bootstrap = process.env.CONTROL_BOOTSTRAP || '';
const port = Number(process.env.CONTROL_PORT || 4318);
const stateFile = process.env.CONTROL_STATE || '';
if (!file || !bootstrap) throw Error('Falta configurar el almacenamiento del servicio de control.');
const platforms = new Set(['twitch','tiktok','kick','youtube','starvios']);
const avatarIds = new Set(avatars.map(a => a.id));
const edgeVoiceIds = new Set(freeVoices.map(v => 'edge:'+v.id));
let rows = [];
try { rows = JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
if (!Array.isArray(rows)) throw Error('Archivo de cuentas inválido.');
const sessions = new Map();
const attempts = new Map();
let network={enabled:false,port:4443}, external=null, tlsOptions=null;
if(stateFile) {try {const saved=JSON.parse(await readFile(stateFile,'utf8'));if(Number.isInteger(saved.port)&&saved.port>=1024&&saved.port<=65535)network={enabled:saved.enabled===true,port:saved.port};}catch(e){if(e.code!=='ENOENT')throw e;}}
if(process.env.CONTROL_CERT && process.env.CONTROL_KEY) tlsOptions={cert:await readFile(process.env.CONTROL_CERT),key:await readFile(process.env.CONTROL_KEY),minVersion:'TLSv1.2'};
const key = () => randomBytes(32).toString('hex');
const publicRow = r => ({ username:r.username, active:r.active !== false, channels:r.channels, avatars:r.avatars, voices:r.voices });
async function save() {
  await mkdir(dirname(file), { recursive:true, mode:0o700 });
  const tmp = file + '.' + randomBytes(8).toString('hex') + '.tmp';
  await writeFile(tmp, JSON.stringify(rows) + '\n', {mode:0o600, flag:'wx'});
  await rename(tmp, file);
}
function bad(message, status=400) { const e=Error(message); e.status=status; throw e; }
function validUser(value) {
  const name=String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,49}$/.test(name)) bad('El usuario debe tener entre 3 y 50 letras, números, puntos, guiones o guiones bajos.');
  return name;
}
function permissions(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) bad('Permisos inválidos.');
  let channels=null;
  if (data.channels !== null) {
    if (!data.channels || typeof data.channels !== 'object' || Array.isArray(data.channels)) bad('Plataformas inválidas.');
    channels={};
    for (const [platform,values] of Object.entries(data.channels)) {
      if (!platforms.has(platform) || !Array.isArray(values) || values.length>100) bad('Cuentas de plataforma inválidas.');
      channels[platform]=[...new Set(values.map(x=>String(x).trim()).filter(Boolean).map(x=>platform==='youtube'?x:x.toLowerCase()))];
      if (channels[platform].some(x=>platform==='youtube'?!/^UC[\w-]{22}$/.test(x):!/^[a-z0-9_.-]{1,50}$/.test(x))) bad(platform==='youtube'?'YouTube requiere IDs de canal que comiencen por UC.':'Cuenta de plataforma inválida.');
      if (!channels[platform].length) delete channels[platform];
    }
  }
  let allowedAvatars=null;
  if (data.avatars !== null) {
    if (!Array.isArray(data.avatars) || data.avatars.length>200) bad('Lista de avatares inválida.');
    allowedAvatars=[...new Set(data.avatars)];
    if (!allowedAvatars.length || allowedAvatars.some(id=>!avatarIds.has(id))) bad('Selecciona al menos un avatar válido.');
  }
  let voices=null;
  if (data.voices !== null) {
    if (!Array.isArray(data.voices) || !data.voices.length || data.voices.length>1000) bad('Selecciona al menos una voz.');
    voices=[...new Set(data.voices.map(String))];
    if (voices.some(v=>!(edgeVoiceIds.has(v)||/^fish:[a-f0-9]{32}$/.test(v)))) bad('Usa voces Edge incluidas o IDs Fish válidos.');
  }
  return {channels,avatars:allowedAvatars,voices};
}
async function setPassword(row, value) {
  const password=String(value || '');
  if (password.length<8 || password.length>256) bad('La contraseña debe tener entre 8 y 256 caracteres.');
  row.salt=randomBytes(16).toString('hex');
  row.passwordHash=(await scrypt(password,row.salt,64)).toString('hex');
}
function bearer(req) {
  const token=String(req.headers.authorization || '').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const session=token && sessions.get(token);
  if (!session || session.expires<Date.now()) { if(token) sessions.delete(token); return null; }
  const row=rows.find(r=>r.username===session.username && r.active!==false);
  return row ? {row,token} : null;
}
function revoke(username) { for(const [token,session] of sessions) if(session.username===username) sessions.delete(token); }
async function readBody(req) {
  if (!String(req.headers['content-type']||'').startsWith('application/json')) bad('Se requiere JSON.',415);
  const chunks=[]; let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>65536) bad('Solicitud demasiado grande.',413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { bad('JSON inválido.'); }
}
function send(res,status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(data)); }
async function handler(req,res){
 try {
  const path=new URL(req.url,'http://localhost').pathname;
  if (path==='/v1/status' && req.method==='GET') return send(res,200,{ready:rows.some(r=>r.username==='admin')});
  if (path==='/v1/bootstrap' && req.method==='POST') {
    if (req.socket.encrypted || rows.some(r=>r.username==='admin') || !bootstrap || req.headers['x-bootstrap-token']!==bootstrap) bad('No se puede iniciar la administración.',403);
    const data=await readBody(req), row={username:'admin',active:true,channels:null,avatars:null,voices:null};
    await setPassword(row,data.password); rows.push(row); await save(); return send(res,201,{ok:true});
  }
  if (path==='/v1/login' && req.method==='POST') {
    const data=await readBody(req); const name=String(data.username||'').trim().toLowerCase();
    const attemptKey=(req.socket.remoteAddress||'')+':'+name, now=Date.now(), a=attempts.get(attemptKey);
    if(a && a.until>now && a.count>=8) bad('Demasiados intentos. Espera 10 minutos.',429);
    const row=rows.find(r=>r.username===name), salt=row?.salt || 'invalid-account-salt';
    const hash=await scrypt(String(data.password||'').slice(0,256),salt,64);
    if(!row || row.active===false || !timingSafeEqual(hash,Buffer.from(row.passwordHash,'hex'))) {
      attempts.set(attemptKey,{count:(a && a.until>now ? a.count : 0)+1,until:a && a.until>now ? a.until : now+600000});
      bad('Usuario o contraseña incorrectos, o cuenta desactivada.',401);
    }
    attempts.delete(attemptKey); const token=key(); sessions.set(token,{username:name,expires:now+12*3600000});
    return send(res,200,{token,account:publicRow(row)});
  }
  const session=bearer(req);
  if(!session) bad('La sesión no está activa.',401);
  if(path==='/v1/me' && req.method==='GET') return send(res,200,publicRow(session.row));
  if(path==='/v1/logout' && req.method==='POST') { sessions.delete(session.token); return send(res,200,{ok:true}); }
  if(!path.startsWith('/v1/admin/') || session.row.username!=='admin') bad('No autorizado.',403);
  if(path==='/v1/admin/network' && req.method==='GET') return send(res,200,{...network,available:Boolean(tlsOptions),listening:Boolean(external?.listening)});
  if(path==='/v1/admin/network' && req.method==='POST') {
    if(req.socket.encrypted)bad('La conexión exterior se configura en el Mac del administrador.',403);
    if(!tlsOptions)bad('Falta el certificado de este administrador.',503);
    const data=await readBody(req), requested=Number(data.port);
    if(!Number.isInteger(requested)||requested<1024||requested>65535)bad('Puerto inválido.');
    if(external){await new Promise(resolve=>external.close(resolve));external=null;}
    network={enabled:false,port:requested};
    if(data.enabled===true){try{await startExternal();network.enabled=true;}catch{bad('No se pudo abrir el puerto de administración.');}}
    if(stateFile){await mkdir(dirname(stateFile),{recursive:true,mode:0o700});await writeFile(stateFile,JSON.stringify(network)+'\n',{mode:0o600});}
    return send(res,200,{...network,available:true,listening:Boolean(external?.listening)});
  }
  if(path==='/v1/admin/users' && req.method==='GET') return send(res,200,{users:rows.map(publicRow)});
  if(path==='/v1/admin/users' && req.method==='POST') {
    const data=await readBody(req), username=validUser(data.username);
    if(username==='admin' || rows.some(r=>r.username===username)) bad('Este usuario ya existe.',409);
    const row={username,active:data.active!==false,...permissions(data)}; await setPassword(row,data.password); rows.push(row); await save(); return send(res,201,publicRow(row));
  }
  if(path==='/v1/admin/user' && req.method==='POST') {
    const data=await readBody(req), username=validUser(data.username), row=rows.find(r=>r.username===username);
    if(!row || username==='admin') bad('Usuario no encontrado o protegido.',404);
    const next={...row,...permissions(data),active:data.active!==false};
    if(data.password) await setPassword(next,data.password);
    Object.assign(row,next);
    await save(); revoke(username); return send(res,200,publicRow(row));
  }
  bad('Ruta desconocida.',404);
 } catch(e) { send(res,e.status||500,{error:e.status?e.message:'Error del servicio de administración.'}); }
}
const server=http.createServer(handler);
server.requestTimeout=30000;server.headersTimeout=15000;
async function startExternal(){
 if(!tlsOptions)throw Error('Falta certificado TLS.');
 const candidate=https.createServer(tlsOptions,handler);candidate.requestTimeout=30000;candidate.headersTimeout=15000;
 await new Promise((resolve,reject)=>{candidate.once('error',reject);candidate.listen(network.port,process.env.CONTROL_TLS_BIND||'0.0.0.0',()=>{candidate.off('error',reject);candidate.on('error',()=>{});resolve();});});
 external=candidate;
}
if(network.enabled && tlsOptions)try{await startExternal();}catch{network.enabled=false;}
server.listen(port,'127.0.0.1',()=>console.log(`CONTROL_READY ${port}`));
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{external?.close();server.close(()=>process.exit(0));});
