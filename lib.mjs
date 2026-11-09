export const platforms = ["twitch", "tiktok", "kick", "youtube", "starvios"];
// Connector 2.5 uses the v3 schema (displayId/common.msgId). Older
// connectors exposed uniqueId/msgId; keep both without using the nickname as login.
export function tiktokMessage(data) {
  const user = [data?.user?.displayId,data?.user?.uniqueId,data?.uniqueId,data?.user?.id]
    .find(value=>typeof value === 'string' && value.trim());
  const text = typeof data?.content === 'string' ? data.content : data?.comment;
  if (!user || typeof text !== 'string' || !text.trim()) return null;
  return {user,displayName:data.user?.nickname || data.nickname || user,text,
    id:data.common?.msgId || data.msgId};
}
export function channelName(value, platform) {
  const raw = String(value || "").trim();
  if (platform === "youtube") {
    if (/^[\w-]{11}$/.test(raw)) return raw;
    try {
      const u = new URL(raw);
      if (
        ![
          "youtube.com",
          "www.youtube.com",
          "m.youtube.com",
          "youtu.be",
        ].includes(u.hostname)
      )
        throw Error();
      const id =
        u.hostname === "youtu.be"
          ? u.pathname.slice(1)
          : u.searchParams.get("v") ||
            u.pathname.match(/^\/(?:live|shorts)\/([\w-]{11})/)?.[1];
      if (/^[\w-]{11}$/.test(id || "")) return id;
    } catch {}
    throw Error(
      "YouTube: ingresa la URL o el ID del video en directo, no el nombre del canal.",
    );
  }
  let name = raw.replace(/^[@#]/, "");
  if (/^https?:/.test(raw)) {
    const u = new URL(raw);
    const allowed = {
      twitch: ["twitch.tv", "www.twitch.tv"],
      tiktok: ["tiktok.com", "www.tiktok.com"],
      kick: ["kick.com", "www.kick.com"],
      starvios: ["starvios.com", "www.starvios.com"],
    };
    if (!allowed[platform]?.includes(u.hostname))
      throw Error("La URL no corresponde a esa plataforma.");
    const parts = u.pathname.split("/").filter(Boolean);
    name = (platform === "starvios" && parts[0] === "live" ? parts[1] : parts[0])?.replace(/^@/, "") || "";
  }
  if (!/^[a-zA-Z0-9_.-]{1,50}$/.test(name))
    throw Error("Ingresa un nombre de canal válido.");
  return name.toLowerCase();
}
export function parseIRCTags(line) {
  let tags = {};
  if (line.startsWith("@")) {
    const space = line.indexOf(" ");
    tags = Object.fromEntries(
      line
        .slice(1, space)
        .split(";")
        .map((t) => {
          const i = t.indexOf("=");
          const val = t
            .slice(i + 1)
            .replace(
              /\\([snr:])/g,
              (_, c) => ({ s: " ", n: "\n", r: "\r", ":": ";" })[c],
            );
          return [t.slice(0, i), val];
        }),
    );
  }
  return tags;
}
function parseIRCLine(line) {
  const tags = parseIRCTags(line);
  let rest = line;
  if (rest.startsWith("@")) rest = rest.slice(rest.indexOf(" ") + 1);
  if (rest.startsWith(":")) rest = rest.slice(rest.indexOf(" ") + 1);
  const colon = rest.indexOf(" :");
  const head = colon < 0 ? rest : rest.slice(0, colon);
  const [command = "", ...params] = head.split(" ").filter(Boolean);
  return { tags, command, params, trailing: colon < 0 ? undefined : rest.slice(colon + 2) };
}
// Decide por el comando IRC, nunca por el texto: un mensaje de chat es siempre
// PRIVMSG, aunque un espectador escriba el nombre de otro comando.
export function twitchControl(line, channel) {
  const { tags, command, params, trailing } = parseIRCLine(line);
  const inChannel = params.includes(`#${channel}`);
  if (command === "PING") return { type: "ping", reply: line.replace(/^PING/, "PONG") };
  if (command === "RECONNECT") return { type: "reconnect" };
  if (command === "NOTICE" && (trailing === "Login authentication failed" ||
    (tags["msg-id"] === "msg_channel_suspended" && inChannel))) return { type: "rejected" };
  if (!inChannel) return null;
  if (command === "366") return { type: "joined" };
  if (command === "ROOMSTATE") return { type: "roomstate", roomId: tags["room-id"] };
  if (command === "USERSTATE") return { type: "userstate",
    moderator: tags.mod === "1" || /(?:^|,)(?:moderator|broadcaster)\//.test(tags.badges || "") };
  if (command === "CLEARMSG") return tags["target-msg-id"] ? { type: "delete", id: tags["target-msg-id"] } : null;
  if (command === "CLEARCHAT") return { type: "purge", user: trailing };
  return null;
}
export function parseIRC(line) {
  const tags = parseIRCTags(line);
  if (line.startsWith('@')) line = line.slice(line.indexOf(' ') + 1);
  const match = line.match(/^:([^! ]+)(?:![^ ]+)? PRIVMSG #([^ ]+) :(.+)$/);
  const badges = new Set(String(tags.badges || '').split(',').map(value=>value.split('/')[0]));
  const broadcaster = Boolean(match && (badges.has('broadcaster') ||
    (tags['user-id'] && tags['user-id'] === tags['room-id']) || match[1].toLowerCase() === match[2].toLowerCase()));
  return match
    ? {
        user: match[1],
        displayName: tags["display-name"] || match[1],
        channel: match[2],
        text: match[3],
        id: tags.id,
        userId: tags["user-id"],
        roles: {
          broadcaster,
          moderator: broadcaster || tags.mod === '1' || badges.has('moderator'),
          subscriber: tags.subscriber === '1' || badges.has('subscriber') || badges.has('founder'),
        },
      }
    : null;
}
export { identity } from "./public/identity.js";
