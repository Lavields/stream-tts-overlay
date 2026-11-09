import {scrypt,randomBytes,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {readAccounts} from './provision-auth.mjs';
const derive=promisify(scrypt);
export const policies={
 admin:{channels:null,avatars:null},
 streamer1:{channels:{starvios:['streamer1'],twitch:['streamer1'],kick:['streamer1'],tiktok:['streamer1']},avatars:['cat-chile','cat-peru','cat-calvo']},
 streamer2:{channels:{twitch:['streamer2'],kick:['streamer2'],tiktok:['streamer2']},avatars:['sock','male','female','chibi-ruby','cat-black','cat-calico','cat-tabby']},
};
export function allowedChannel(user,platform,channel){const p=policies[user];return Boolean(p&&(p.channels===null||p.channels[platform]?.includes(channel.toLowerCase())));}
export function allowedAvatar(user,id){const p=policies[user];return Boolean(p&&(p.avatars===null||p.avatars.includes(id)));}
export async function createAuth(){
 const rows=await readAccounts(process.env.AUTH_ACCOUNTS_FILE || new URL('./.data/accounts.json',import.meta.url),process.env.AUTH_ACCOUNTS_FILE ? null : new URL('./account-template.json',import.meta.url));
 const accounts=new Map(rows.map(r=>[r.username,r]));
 const sessions=new Map(),attempts=new Map();
 const cookie=(req,name)=>String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
 const findSession=req=>{const token=cookie(req,'streamvoice_session'),s=sessions.get(token);if(!s)return null;if(s.expires<Date.now()){sessions.delete(token);return null;}return s;};
 return {
 users:[...accounts.keys()],
 policy:username=>({username,...policies[username],overlayUrl:'/overlay?token='+accounts.get(username).overlayToken}),
 session:req=>findSession(req)?.username,
 sessionId:req=>cookie(req,'streamvoice_session'),
 overlay:req=>{const u=new URL(req.url,'http://localhost');const token=u.searchParams.get('token')||cookie(req,'streamvoice_overlay');return rows.find(r=>token&&r.overlayToken===token)?.username;},
 async login(req,res,data){
  const username=String(data.username||'').trim().toLowerCase(),key=(req.socket.remoteAddress||'')+':'+username,now=Date.now();
  for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);
  const a=attempts.get(key);if(a?.count>=8){const e=Error('Demasiados intentos. Espera 10 minutos.');e.statusCode=429;throw e;}
  if(attempts.size>1000)attempts.delete(attempts.keys().next().value);
  const row=accounts.get(username),salt=row?.salt||'invalid-account-salt';
  const hash=await derive(String(data.password||'').slice(0,256),salt,64);
  if(!row||!timingSafeEqual(hash,Buffer.from(row.passwordHash,'hex'))){attempts.set(key,{count:(a?.count||0)+1,until:a?.until||now+600000});const e=Error('Usuario o contraseña incorrectos.');e.statusCode=401;throw e;}
  attempts.delete(key);sessions.delete(cookie(req,'streamvoice_session'));for(const [t,s]of sessions)if(s.expires<now)sessions.delete(t);
  if(sessions.size>1000)sessions.delete(sessions.keys().next().value);
  const token=randomBytes(32).toString('hex');sessions.set(token,{username,expires:now+12*3600000});
  res.setHeader('Set-Cookie',`streamvoice_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
  return {ok:true,username};
 },
 logout(req,res){const t=cookie(req,'streamvoice_session');sessions.delete(t);res.setHeader('Set-Cookie','streamvoice_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');},
 overlayCookie(req,res){const u=new URL(req.url,'http://localhost'),token=u.searchParams.get('token');if(token&&rows.some(r=>r.overlayToken===token))res.setHeader('Set-Cookie',`streamvoice_overlay=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`);},
 };
}
