import { avatars } from '../../public/avatars.js';
import { freeVoices } from '../../public/free-voices.js';

const avatarIds = new Set(avatars.map(item => item.id));
const edgeIds = new Set(freeVoices.map(item => 'edge:' + item.id));
const platforms = new Set(['twitch','tiktok','kick','youtube','starvios']);
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
const random = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
const validUser = value => { const user=String(value||'').trim().toLowerCase(); if(!/^[a-z0-9][a-z0-9_.-]{2,49}$/.test(user)) fail('Usuario inválido.'); return user; };
async function passwordHash(password, salt) {
  let value=encoder.encode(password);
  // Cloudflare Workers limits each PBKDF2 invocation to 100,000 iterations.
  // Apply six domain-separated rounds so the work factor is retained.
  for(let round=0;round<6;round++){
    const key=await crypto.subtle.importKey('raw',value,'PBKDF2',false,['deriveBits']);
    value=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(`${salt}:${round}`),iterations:100000},key,256));
  }
  return hex(value);
}
function password(value) { if(typeof value!=='string'||value.length<8||value.length>256) fail('La contraseña debe tener entre 8 y 256 caracteres.'); return value; }
function same(a,b) { if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false; let d=0; for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0; }
function permissions(data) {
  let channels=null, allowedAvatars=null, voices=null;
  if(data.channels!==null){
    if(!data.channels||typeof data.channels!=='object'||Array.isArray(data.channels))fail('Plataformas inválidas.');
    channels={};
    for(const [p,values] of Object.entries(data.channels)){
      if(!platforms.has(p)||!Array.isArray(values)||values.length>100)fail('Cuentas inválidas.');
      const items=[...new Set(values.map(v=>String(v).trim()).filter(Boolean).map(v=>p==='youtube'?v:v.toLowerCase()))];
      if(items.some(v=>p==='youtube'?!/^UC[\w-]{22}$/.test(v):!/^[a-z0-9_.-]{1,50}$/.test(v)))fail('Cuenta de plataforma inválida.');
      if(items.length)channels[p]=items;
    }
  }
  if(data.avatars!==null){if(!Array.isArray(data.avatars)||!data.avatars.length||data.avatars.length>200||data.avatars.some(id=>!avatarIds.has(id)))fail('Selecciona avatares válidos.');allowedAvatars=[...new Set(data.avatars)];}
  if(data.voices!==null){if(!Array.isArray(data.voices)||!data.voices.length||data.voices.length>1000||data.voices.some(v=>typeof v!=='string'||!(edgeIds.has(v)||/^fish:[a-f0-9]{32}$/.test(v))))fail('Selecciona voces válidas.');voices=[...new Set(data.voices)];}
  return [channels,allowedAvatars,voices].map(v=>v===null?null:JSON.stringify(v));
}
const publicRow = row => ({username:row.username,active:!!row.active,channels:row.channels===null?null:JSON.parse(row.channels),avatars:row.avatars===null?null:JSON.parse(row.avatars),voices:row.voices===null?null:JSON.parse(row.voices)});
async function body(req) {
  if(!req.headers.get('content-type')?.startsWith('application/json'))fail('Se requiere JSON.',415);
  const length=Number(req.headers.get('content-length'));if(Number.isFinite(length)&&length>65536)fail('Solicitud demasiado grande.',413);
  const reader=req.body?.getReader(), chunks=[];let total=0;
  if(reader){for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>65536){await reader.cancel();fail('Solicitud demasiado grande.',413);}chunks.push(value);}}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const text=new TextDecoder().decode(bytes);
  try { const data=JSON.parse(text);if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data; } catch { fail('JSON inválido.'); }
}
async function handler(req, env) {
  const db=env.DB, path=new URL(req.url).pathname, now=Date.now();
  if(path==='/v1/status'&&req.method==='GET')return reply({ready:!!(await db.prepare('SELECT username FROM accounts WHERE username = ?').bind('admin').first())});
  if(path==='/v1/bootstrap'&&req.method==='POST'){
    if(!env.BOOTSTRAP_TOKEN || !same(req.headers.get('x-bootstrap-token'),env.BOOTSTRAP_TOKEN))fail('No autorizado.',403);
    const data=await body(req), salt=random(16), hash=await passwordHash(password(data.password),salt);
    try {await db.prepare('INSERT INTO accounts (username,salt,password_hash,active,channels,avatars,voices) VALUES (?,?,?,?,?,?,?)').bind('admin',salt,hash,1,null,null,null).run();} catch {fail('La cuenta ya está configurada.',409);}
    return reply({ok:true},201);
  }
  if(path==='/v1/login'&&req.method==='POST'){
    const data=await body(req), username=validUser(data.username), input=String(data.password||'').slice(0,256);
    const bucket=await sha((req.headers.get('cf-connecting-ip')||'unknown')+'\0'+username);
    const limit=await db.prepare('INSERT INTO login_attempts (bucket,attempts,expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires<=? THEN 1 ELSE attempts+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING attempts').bind(bucket,now+600000,now,now).first();
    if(limit.attempts>8)fail('Demasiados intentos. Espera 10 minutos.',429);
    const row=await db.prepare('SELECT * FROM accounts WHERE username = ?').bind(username).first();
    const computed=await passwordHash(input,row?.salt||'00000000000000000000000000000000');
    if(!row||!row.active||!same(computed,row.password_hash))fail('Usuario o contraseña incorrectos, o cuenta desactivada.',401);
    await db.prepare('DELETE FROM login_attempts WHERE bucket = ?').bind(bucket).run();
    const token=random(32), tokenHash=await sha(token);
    await db.prepare('INSERT INTO sessions (token_hash,username,revision,expires) VALUES (?,?,?,?)').bind(tokenHash,username,row.revision,now+12*3600000).run();
    return reply({token,account:publicRow(row)});
  }
  const token=req.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!token)fail('La sesión no está activa.',401);
  const tokenHash=await sha(token);
  const row=await db.prepare('SELECT accounts.* FROM sessions JOIN accounts ON sessions.username=accounts.username WHERE sessions.token_hash=? AND sessions.expires>? AND sessions.revision=accounts.revision AND accounts.active=1').bind(tokenHash,now).first();
  if(!row)fail('La sesión no está activa.',401);
  if(path==='/v1/me'&&req.method==='GET')return reply(publicRow(row));
  if(path==='/v1/logout'&&req.method==='POST'){await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run();return reply({ok:true});}
  if(!path.startsWith('/v1/admin/')||row.username!=='admin')fail('No autorizado.',403);
  if(path==='/v1/admin/users'&&req.method==='GET'){const rows=await db.prepare('SELECT * FROM accounts ORDER BY username').all();return reply({users:rows.results.map(publicRow)});}
  if(path==='/v1/admin/users'&&req.method==='POST'){
    const data=await body(req), user=validUser(data.username), [channels,avs,voices]=permissions(data), salt=random(16), hash=await passwordHash(password(data.password),salt);
    if(user==='admin')fail('Usuario protegido.',409);
    try{await db.prepare('INSERT INTO accounts (username,salt,password_hash,active,channels,avatars,voices) VALUES (?,?,?,?,?,?,?)').bind(user,salt,hash,data.active===false?0:1,channels,avs,voices).run();}catch{fail('No se pudo crear la cuenta.',409);}
    return reply(publicRow(await db.prepare('SELECT * FROM accounts WHERE username=?').bind(user).first()),201);
  }
  if(path==='/v1/admin/user'&&req.method==='POST'){
    const data=await body(req), user=validUser(data.username), [channels,avs,voices]=permissions(data);
    if(user==='admin')fail('Usuario protegido.',403);
    const previous=await db.prepare('SELECT * FROM accounts WHERE username=?').bind(user).first();if(!previous)fail('Usuario no encontrado.',404);
    const salt=data.password?random(16):previous.salt, hash=data.password?await passwordHash(password(data.password),salt):previous.password_hash;
    await db.prepare('UPDATE accounts SET salt=?,password_hash=?,active=?,channels=?,avatars=?,voices=?,revision=revision+1 WHERE username=?').bind(salt,hash,data.active===false?0:1,channels,avs,voices,user).run();
    return reply(publicRow(await db.prepare('SELECT * FROM accounts WHERE username=?').bind(user).first()));
  }
  fail('Ruta desconocida.',404);
}
export default { async fetch(req, env) { try {return await handler(req,env);} catch(e) {return reply({error:e.status?e.message:'Error del servicio de administración.'},e.status||500);} } };
