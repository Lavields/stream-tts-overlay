import { randomBytes, createHash, X509Certificate } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import https from 'node:https';

const makeToken=()=>randomBytes(32).toString('hex');
function normalizeUrl(value) {
  let url;
  try { url=new URL(value); } catch { throw Error('Ingresa una dirección válida del servidor de administración.'); }
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if ((url.protocol!=='https:' && !(url.protocol==='http:' && loopback)) || url.username || url.password || url.search || url.hash) throw Error('La dirección del servidor debe usar HTTPS.');
  return url.href.replace(/\/$/,'');
}
export async function createRemoteAuth() {
 const owner=process.env.STREAMVOICE_CONTROL_OWNER==='1';
 const cloud=process.env.STREAMVOICE_CLOUD_CONTROL_URL || '';
 const configFile=process.env.STREAMVOICE_CONTROL_CONFIG;
 const bootstrap=process.env.CONTROL_BOOTSTRAP || '';
 const overlayFile=process.env.STREAMVOICE_OVERLAY_TOKENS_FILE;
 let overlayTokens={};
 if(overlayFile)try{const saved=JSON.parse(await readFile(overlayFile,'utf8'));if(!saved||Array.isArray(saved)||typeof saved!=='object'||Object.values(saved).some(v=>typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v)))throw Error('Archivo de overlays inválido.');overlayTokens=saved;}catch(e){if(e.code!=='ENOENT')throw e;}
 const certificate=process.env.STREAMVOICE_CONTROL_CERT ? await readFile(process.env.STREAMVOICE_CONTROL_CERT) : null;
 const fingerprint=certificate ? createHash('sha256').update(new X509Certificate(certificate).raw).digest('hex') : '';
 let base=cloud || (owner?`http://127.0.0.1:${Number(process.env.STREAMVOICE_CONTROL_PORT)||4318}`:process.env.STREAMVOICE_CONTROL_URL || '');
 if(!cloud && !owner && configFile) { try { base=JSON.parse(await readFile(configFile,'utf8')).url || base; } catch(e) { if(e.code!=='ENOENT') throw e; } }
 if(base) base=normalizeUrl(base);
 if(cloud && (!base.startsWith('https://') || !new URL(base).hostname.endsWith('.workers.dev'))) throw Error('La dirección de Cloudflare debe usar HTTPS y workers.dev.');
 const sessions=new Map(), active=new Map();
 const refreshMs=Number(process.env.STREAMVOICE_AUTH_REFRESH_MS)||20*60*1000, refreshRetryMs=60*1000;
 let invalidate=()=>{};
 const cookie=(req,name)=>String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
 function get(req) { const token=cookie(req,'streamvoice_session');const session=sessions.get(token);if(!session||session.expires<Date.now()){if(session)drop(token);return null;}return session; }
 function drop(token) { const s=sessions.get(token);if(!s)return; sessions.delete(token); if(active.get(s.username)===s)active.delete(s.username);invalidate(s.username,token); }
 async function overlayFor(username){if(Object.hasOwn(overlayTokens,username))return overlayTokens[username];const token=makeToken();if(overlayFile){await mkdir(dirname(overlayFile),{recursive:true,mode:0o700});const next={...overlayTokens,[username]:token},tmp=overlayFile+'.'+makeToken()+'.tmp';await writeFile(tmp,JSON.stringify(next)+'\n',{mode:0o600,flag:'wx'});await rename(tmp,overlayFile);overlayTokens=next;}else overlayTokens[username]=token;return token;}
 function pinnedRequest(url, options) {
  return new Promise((resolve,reject)=>{
   const req=https.request(url,{...options,ca:certificate,rejectUnauthorized:true,checkServerIdentity:(_host,cert)=>{const actual=cert.raw&&createHash('sha256').update(cert.raw).digest('hex');if(actual!==fingerprint)return Error('Certificado de administración no reconocido.');}},res=>{
    const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>1024*1024)req.destroy(Error('Respuesta demasiado grande.'));else chunks.push(chunk);});res.on('end',()=>resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,json:async()=>JSON.parse(Buffer.concat(chunks).toString())}));res.on('error',reject);
   });req.setTimeout(8000,()=>req.destroy(Error('Tiempo de espera agotado.')));req.on('error',reject);if(options.body)req.write(options.body);req.end();
  });
 }
 async function call(path,{method='GET',body,token,bootstrapToken}={}) {
  if(!base) {const e=Error('Configura la dirección del servidor de administración.');e.statusCode=503;throw e;}
  let response;
  try { const options={method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(bootstrapToken?{'X-Bootstrap-Token':bootstrapToken}:{})},body:body===undefined?undefined:JSON.stringify(body)};response=!cloud&&certificate&&base.startsWith('https:')?await pinnedRequest(base+path,options):await fetch(base+path,{...options,signal:AbortSignal.timeout(8000),redirect:'error'}); }
  catch { const e=Error('No se pudo conectar con el servidor de administración.');e.statusCode=503;throw e; }
  let data;try { data=await response.json(); } catch {const e=Error('Respuesta inválida del servidor de administración.');e.statusCode=503;throw e;}
  if(!response.ok) {const e=Error(data.error||'No se pudo verificar la cuenta.');e.statusCode=response.status;throw e;}return data;
 }
 return {
  users:[],
  onInvalidate(fn){invalidate=fn;},
  async status(){if(!base)return {remote:true,owner,configured:false};try {const s=await call('/v1/status');return {remote:true,owner,cloud:Boolean(cloud),configured:true,needsSetup:owner&&!s.ready,...(cloud&&!owner&&!s.ready?{error:'La administración en la nube aún no está configurada.'}:{})};}catch(e){return {remote:true,owner,cloud:Boolean(cloud),configured:true,error:e.message};}},
  async configure(url){if(owner||cloud)throw Error('La dirección del administrador se configura en este equipo.');const next=normalizeUrl(url);base=next;if(configFile){await mkdir(dirname(configFile),{recursive:true,mode:0o700});await writeFile(configFile,JSON.stringify({url:next})+'\n',{mode:0o600});}return {ok:true};},
  async setup(password,setupToken){if(!owner||(!cloud&&!bootstrap))throw Error('No autorizado.');if(cloud&&(!setupToken||setupToken.length<32))throw Error('Ingresa la clave de inicialización de Cloudflare.');return call('/v1/bootstrap',{method:'POST',body:{password},bootstrapToken:cloud?setupToken:bootstrap});},
  session:req=>get(req)?.username,
  sessionId:req=>cookie(req,'streamvoice_session'),
  policy:username=>{const s=active.get(username);if(!s)throw Error('La sesión no está activa.');return {...s.account,overlayUrl:'/overlay?token='+s.overlayToken};},
  allowedChannel:(username,platform,channel)=>{const p=active.get(username)?.account;return Boolean(p&&(p.channels===null||p.channels?.[platform]?.includes(platform==='youtube'?channel:channel.toLowerCase())));},
  allowedAvatar:(username,id)=>{const p=active.get(username)?.account;return Boolean(p&&(p.avatars===null||p.avatars?.includes(id)));},
  allowedVoice:(username,provider,id)=>{const p=active.get(username)?.account;return Boolean(p&&(p.voices===null||p.voices?.includes(`${provider}:${id}`)));},
  overlay:req=>{const u=new URL(req.url,'http://localhost');const token=u.searchParams.get('token')||cookie(req,'streamvoice_overlay');return [...active.values()].find(s=>s.overlayToken===token && s.expires>Date.now() && sessions.has(s.localToken))?.username;},
  overlayCookie(req,res){const u=new URL(req.url,'http://localhost'),token=u.searchParams.get('token');if(token&&[...active.values()].some(s=>s.overlayToken===token))res.setHeader('Set-Cookie',`streamvoice_overlay=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);},
  async login(req,res,data){
   const result=await call('/v1/login',{method:'POST',body:{username:String(data.username||''),password:String(data.password||'')}});
   const localToken=makeToken(); const previous=active.get(result.account.username);if(previous)drop(previous.localToken);
   const s={username:result.account.username,account:result.account,remoteToken:result.token,localToken,overlayToken:await overlayFor(result.account.username),expires:Date.now()+12*3600000,nextCheck:Date.now()+refreshMs};sessions.set(localToken,s);active.set(s.username,s);
   res.setHeader('Set-Cookie',`streamvoice_session=${localToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);return {ok:true,username:s.username};
  },
  async refresh(req){
   const s=get(req);if(!s||Date.now()<s.nextCheck)return;
   s.refreshing??=(async()=>{
    try{s.account=await call('/v1/me',{token:s.remoteToken});s.nextCheck=Date.now()+refreshMs;}
    catch(e){
     // Solo el servicio puede revocar: un corte de red o un error suyo no debe interrumpir el directo.
     if(e.statusCode===401||e.statusCode===403){drop(s.localToken);throw e;}
     s.nextCheck=Date.now()+Math.min(refreshMs,refreshRetryMs);
    }finally{s.refreshing=null;}
   })();
   return s.refreshing;
  },
  async admin(req,path,method='GET',body){const s=get(req);if(!s||s.username!=='admin'){const e=Error('No autorizado.');e.statusCode=403;throw e;}if(cloud&&path==='network'){if(method!=='GET')throw Error('La conexión en la nube no se administra desde este botón.');return {cloud:true,available:false,enabled:true};}return call('/v1/admin/'+path,{method,body,token:s.remoteToken});},
  logout(req,res){const s=get(req);if(s){void call('/v1/logout',{method:'POST',body:{},token:s.remoteToken}).catch(()=>{});drop(s.localToken);}res.setHeader('Set-Cookie','streamvoice_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');},
 };
}
