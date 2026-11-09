import { identity } from "./identity.js";

export function containsBlockedPhrase(text, phrases) {
  const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('es');
  const message = normalize(text);
  return Array.isArray(phrases) && phrases.some(value => {
    const phrase = normalize(value).trim();
    return phrase.length > 0 && message.includes(phrase);
  });
}

export const userFields = {
  twitch: { label: "Nombre de usuario de Twitch", placeholder: "usuario_twitch", help: "Usa el nombre de inicio de sesión, con o sin @; no el nombre visible.", pattern: /^[a-z\d_]{1,25}$/i, host: "twitch.tv" },
  tiktok: { label: "Nombre de usuario de TikTok", placeholder: "@usuario.tiktok", help: "Usa el @ único del usuario, no su apodo visible.", pattern: /^[a-z\d_.]{1,24}$/i, host: "tiktok.com" },
  kick: { label: "Nombre de usuario de Kick", placeholder: "usuario-kick", help: "Usa el nombre de usuario de Kick, con o sin @.", pattern: /^[a-z\d_-]{1,40}$/i, host: "kick.com" },
  youtube: { label: "ID del canal del usuario de YouTube", placeholder: "UCxxxxxxxxxxxxxxxxxxxxxx", help: "Usa el ID UC… del usuario que escribe, o su URL /channel/UC…; no el ID del directo, su nombre visible ni su @handle. Desde la cola se completa automáticamente.", pattern: /^UC[a-z\d_-]{22}$/i, host: "youtube.com" },
  starvios: { label: "Nombre de usuario de Starvios", placeholder: "@usuario_starvios", help: "Usa el @ único del autor en Starvios, no su nombre visible.", pattern: /^[a-z\d_.-]{1,50}$/i, host: "starvios.com" },
  test: { label: "Nombre del usuario de prueba", placeholder: "invitado", help: "Debe coincidir con el campo Usuario de prueba.", pattern: /^.{1,100}$/ },
};
export function normalizeUser(platform, value) {
  const spec = userFields[platform];
  if (!spec) throw Error("Selecciona una plataforma válida.");
  let user = String(value || "").trim();
  if (/^https?:\/\//i.test(user)) {
    const url = new URL(user);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== spec.host) throw Error(`Usa una URL de ${spec.host}.`);
    const parts = url.pathname.split("/").filter(Boolean);
    if (platform === "youtube") {
      if (parts.length !== 2 || parts[0] !== "channel") throw Error("YouTube necesita el ID UC… o una URL /channel/UC… del usuario.");
      user = parts[1];
    } else {
      if (parts.length !== 1) throw Error("Usa el nombre o la URL del perfil del usuario.");
      user = parts[0];
    }
  }
  user = user.replace(/^@/, "");
  if (!spec.pattern.test(user) || (platform === "youtube" && !user.startsWith("UC")))
    throw Error(platform === "youtube" ? "El ID de YouTube debe comenzar por UC y tener 24 caracteres. El @handle no identifica el chat en esta app." : `Revisa ${spec.label.toLowerCase()}.`);
  return platform === "youtube" || platform === "test" ? user : user.toLowerCase();
}
export function canRead(settings, message) {
  // Explicit voice previews remain usable without altering chat filters.
  if (message.previewProfile) return true;
  const profile = settings.profiles?.[identity(message.platform, message.user)];
  if (profile?.blocked) return false;
  if (settings.readingMode === "only" && profile?.allowed !== true) return false;
  return twitchAudienceAllows(settings.twitchAudience, message);
}

export const twitchAudiences = {
  all: {label:'Todos', short:'Todos'},
  followers: {label:'Seguidores, moderadores y suscriptores', short:'Seguidores'},
  subscribers: {label:'Moderadores y suscriptores', short:'Mods + subs'},
  moderators: {label:'Solo moderadores', short:'Solo mods'},
};
export const normalizeTwitchAudience = value => Object.hasOwn(twitchAudiences,value) ? value : 'all';
export function twitchAudienceAllows(mode, message) {
  if (message.platform !== 'twitch') return true;
  mode = normalizeTwitchAudience(mode);
  const roles = message.roles || {};
  const moderator = roles.moderator === true || roles.broadcaster === true;
  if (mode === 'all' || moderator) return true;
  if (mode === 'moderators') return false;
  if (roles.subscriber === true) return true;
  return mode === 'followers' && message.twitchFollower === true;
}
export function needsTwitchFollowerCheck(settings, message) {
  return !message.previewProfile && message.platform === 'twitch' && settings.twitchAudience === 'followers' &&
    typeof message.twitchFollower !== 'boolean' && !twitchAudienceAllows('subscribers', message) &&
    canRead({...settings,twitchAudience:'all'},message);
}

// Parallel lookups, ordered delivery, and cancellation of moderated/cleared messages.
export function createTwitchReader({getSettings,deliver,verify,onError=()=>{},limit=100}) {
  const pending = new Set();
  let tail = Promise.resolve();
  return {
    receive(message) {
      const settings = getSettings();
      if (message.platform !== 'twitch' || (settings.twitchAudience !== 'followers' && !pending.size)) {
        deliver(message); return Promise.resolve();
      }
      if (pending.size >= limit) {
        onError(Error('Hay demasiadas comprobaciones de seguidores pendientes. Inténtalo en unos segundos.'));
        return Promise.resolve();
      }
      const job = {message,cancelled:false}; pending.add(job);
      const verification = Promise.resolve().then(async()=>{
        if (job.cancelled || !needsTwitchFollowerCheck(getSettings(),message)) return {message};
        try {
          const result = await verify(message);
          if (typeof result.follows !== 'boolean') throw Error('No se pudo verificar si el usuario sigue el canal.');
          return {message:{...message,twitchFollower:result.follows}};
        } catch (error) { return {error}; }
      });
      const done = tail.then(async()=>{
        const result = await verification;
        if (job.cancelled) return;
        if (result.error) {
          if (needsTwitchFollowerCheck(getSettings(),message)) { onError(result.error); return; }
          deliver(message);
        } else deliver(result.message);
      }).finally(()=>pending.delete(job));
      tail = done.catch(onError);
      return done;
    },
    cancel(predicate=()=>true) { for (const job of pending) if (predicate(job.message)) job.cancelled=true; },
    get pendingCount() { return pending.size; },
  };
}
