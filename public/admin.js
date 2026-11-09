import {avatars} from '/avatars.js';
import {freeVoices} from '/free-voices.js';
const catalog=await (await fetch('/voice-catalog.json')).json();
const form=document.querySelector('#admin-form'), usersBox=document.querySelector('#users'), msg=document.querySelector('#admin-message');
const voices=[...freeVoices.map(v=>({id:'edge:'+v.id,name:v.name+' · Edge'})),...catalog.requested.map(v=>({id:'fish:'+v.id,name:v.name+' · Fish'}))];
const allVoices=[...new Map(voices.map(v=>[v.id,v])).values()];
const platforms=['twitch','tiktok','kick','youtube','starvios'];
let users=[], editing=null;
function addChoices(container,items,name){for(const item of items){const label=document.createElement('label');const input=document.createElement('input');input.type='checkbox';input.name=name;input.value=item.id;label.append(input,document.createTextNode(item.name));container.append(label);}}
addChoices(document.querySelector('#avatar-choices'),avatars,'avatar');
addChoices(document.querySelector('#voice-choices'),allVoices,'voice');
for(const platform of platforms){const label=document.createElement('label');label.textContent=({twitch:'Twitch',tiktok:'TikTok',kick:'Kick',youtube:'YouTube',starvios:'Starvios'})[platform];const input=document.createElement('textarea');input.name='channel-'+platform;input.rows=2;label.append(input);document.querySelector('#channels').append(label);}
async function api(path,data){const res=await fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await res.json();if(!res.ok)throw Error(result.error||'No se pudo guardar.');return result;}
function renderUsers(){usersBox.replaceChildren();for(const user of users.filter(x=>x.username!=='admin')){const button=document.createElement('button');button.type='button';button.className='admin-user';button.setAttribute('aria-current',String(editing===user.username));button.textContent=user.username+(user.active?'':' · Desactivada');button.onclick=()=>edit(user);usersBox.append(button);}if(!users.some(x=>x.username!=='admin'))usersBox.textContent='Todavía no hay usuarios.';}
function check(name,values){for(const input of form.querySelectorAll(`input[name="${name}"]`))input.checked=values?.includes(input.value)||false;}
function edit(user){editing=user?.username||null;form.reset();form.elements.username.value=user?.username||'';form.elements.username.readOnly=Boolean(user);form.elements.password.value='';form.elements.password.required=!user;form.elements.active.checked=user?.active!==false;form.elements.allChannels.checked=user?.channels===null;form.elements.allAvatars.checked=user?.avatars===null;form.elements.allVoices.checked=user?.voices===null;
 for(const p of platforms)form.elements['channel-'+p].value=(user?.channels?.[p]||[]).join('\n');
 check('avatar',user?.avatars||(!user?['sock']:[]));check('voice',user?.voices||(!user?['edge:es-CL-CatalinaNeural']:[]));const known=new Set(allVoices.map(v=>v.id));form.elements.extraVoices.value=(user?.voices||[]).filter(v=>!known.has(v)).join('\n');
 document.querySelector('#form-title').textContent=user?'Editar '+user.username:'Agregar usuario';document.querySelector('#password-help').textContent=user?'Déjala vacía para conservar la contraseña actual.':'Al menos 8 caracteres.';msg.textContent='';renderUsers();}
document.querySelector('#new-user').onclick=()=>edit(null);
form.onsubmit=async e=>{e.preventDefault();msg.textContent='Guardando…';const channels={};for(const p of platforms){const values=form.elements['channel-'+p].value.split(/[\n,]+/).map(x=>x.trim().replace(/^@/,'')).filter(Boolean);if(values.length)channels[p]=values;}
 const selected=name=>[...form.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>x.value);
 const payload={username:form.elements.username.value.trim(),password:form.elements.password.value,active:form.elements.active.checked,channels:form.elements.allChannels.checked?null:channels,avatars:form.elements.allAvatars.checked?null:selected('avatar'),voices:form.elements.allVoices.checked?null:[...selected('voice'),...form.elements.extraVoices.value.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean)]};
 try{await api(editing?'/api/admin/user':'/api/admin/users',payload);users=(await api('/api/admin/users')).users;const saved=users.find(u=>u.username===payload.username.toLowerCase());edit(saved);msg.textContent='Cambios guardados.';}catch(err){msg.textContent=err.message;}};
try{users=(await api('/api/admin/users')).users;edit(null);}catch(e){msg.textContent=e.message;}

const networkButton=document.querySelector('#network-toggle'),networkPort=document.querySelector('#network-port'),networkStatus=document.querySelector('#network-status');let networkEnabled=false;
function showNetwork(state){networkEnabled=state.enabled;networkPort.value=state.port||4443;networkButton.disabled=!state.available;networkButton.textContent=state.cloud?'Conexión en la nube':state.enabled?'Desactivar acceso remoto':'Activar acceso remoto';networkStatus.textContent=state.cloud?'La administración está conectada a la nube. No es necesario abrir un puerto en tu Mac.':state.available?(state.enabled?`Activo. Tus amigos necesitan la dirección HTTPS pública de este Mac con el puerto ${state.port}. Para conexiones desde fuera de tu Wi-Fi, configura el reenvío TCP en tu router.`:'Desactivado. Las cuentas se administran solo desde este Mac.'):'La conexión remota necesita una versión empaquetada con identidad de administrador.';}
networkButton.onclick=async()=>{networkButton.disabled=true;try{showNetwork(await api('/api/admin/network',{enabled:!networkEnabled,port:Number(networkPort.value)}));}catch(e){networkStatus.textContent=e.message;networkButton.disabled=false;}};
try{showNetwork(await api('/api/admin/network'));}catch(e){networkStatus.textContent=e.message;}
