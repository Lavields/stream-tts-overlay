import {limitChatWords,countChatWords,SOUND_CODE_SOURCE,VOICE_TAG_SOURCE,voiceTagFromCode,soundCodeId} from "./chat-limit.js";
import {streamPronunciations,CHAT_REACTION_SOURCE,chatReaction,addPeruanoCompliment} from "./chat-reactions.js";
import { emojiNames } from "./emoji-names.js";
import { soundEffectIds, MAX_SOUND_EFFECTS } from "./sound-effects.js";

export function truncateWords(value, maximum) {
  const text = String(value || "").trim();
  const limit = Math.max(1, Number(maximum) || 650);
  if (text.length <= limit) return text;
  // If the boundary falls inside a word, omit that entire final word.
  const prefix = text.slice(0, limit);
  if (/\s/u.test(text[limit])) return prefix.trimEnd();
  const at = prefix.search(/\s+\S*$/u);
  return at < 0 ? "" : prefix.slice(0, at).trimEnd();
}
const units = {
  cm: ["centímetro", "centímetros"], mm: ["milímetro", "milímetros"],
  km: ["kilómetro", "kilómetros"], kg: ["kilogramo", "kilogramos"],
  mg: ["miligramo", "miligramos"], ml: ["mililitro", "mililitros"],
  GB: ["gigabyte", "gigabytes"], MB: ["megabyte", "megabytes"],
  KB: ["kilobyte", "kilobytes"], TB: ["terabyte", "terabytes"],
  Gb: ["gigabit", "gigabits"], Mb: ["megabit", "megabits"],
  MHz: ["megahercio", "megahercios"], GHz: ["gigahercio", "gigahercios"],
};
const words = {
  cm: "centímetro", mm: "milímetro", km: "kilómetro", kg: "kilogramo", mg: "miligramo", ml: "mililitro",
  gb: "gigabyte", mb: "megabyte", kb: "kilobyte", tb: "terabyte", mhz: "megahercio", ghz: "gigahercio",
  ejm: "ejemplo", ej: "ejemplo", etc: "etcétera", aprox: "aproximadamente",
  sr: "señor", sra: "señora", dr: "doctor", dra: "doctora", ud: "usted", uds: "ustedes",
  pág: "página", págs: "páginas", num: "número", núm: "número",
  xq: "porque", pq: "porque", tmb: "también", xfa: "por favor", grx: "gracias",
  q: "que", xk: "porque", tmbn: "también", tamb: "también", bn: "bien",
  dnd: "dónde", dnde: "dónde", vdd: "verdad", vrdd: "verdad",
  ntp: "no te preocupes", tqm: "te quiero mucho", tkm: "te quiero mucho",
  porfa: "por favor", pls: "por favor", grax: "gracias", prox: "próximo",
  min: "minutos", seg: "segundos", hrs: "horas", info: "información",
};
const graphemes = new Intl.Segmenter("es", { granularity: "grapheme" });
const emojiOverrides = {
  "👨‍🦲": "emoji de un hombre pelado", "🧑‍🦲": "emoji de una persona pelada",
  "👩‍🦲": "emoji de una mujer pelada", "😀": "cara feliz",
  "😃": "cara sonriendo con ojos grandes", "😄": "cara sonriendo con ojos cerrados",
  "😊": "cara sonriendo", "😂": "cara llorando de la risa", "🤣": "cara cagándose de la risa",
};
export function describeEmojiText(value) {
  // Protect URLs/emails before interpreting ASCII emoticons or emoji graphemes.
  return String(value).split(/(https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,})/gi).map((part, index) => {
    if (index % 2) return part;
    part = part.replace(/(?<![\p{L}\p{N}_])x[dD]+(?![\p{L}\p{N}_])/giu, " cara cagándose de la risa ")
      .replace(/(?<![\p{L}\p{N}_])(?:=|:)-?[pP](?![\p{L}\p{N}_])/gu, " weón sacando la lengua ")
      .replace(/(?<![\p{L}\p{N}_])[:=]-?\)(?![\p{L}\p{N}_])/gu, " cara feliz ")
      .replace(/(?<![\p{L}\p{N}_])[:=]-?\((?![\p{L}\p{N}_])/gu, " cara triste ");
    return Array.from(graphemes.segment(part), ({ segment }) => {
      const normalized = segment.replace(/[\uFE0E\uFE0F]/gu, "");
      const withoutTone = normalized.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
      const label = emojiOverrides[withoutTone] || emojiNames[normalized] || emojiNames[withoutTone];
      return label ? ` ${label} ` : /\p{Extended_Pictographic}/u.test(segment) ? " emoji " : segment;
    }).join("");
  }).join("").replace(/\s+/gu, " ").replace(/\s+([,.!?;:])/gu, "$1").trim();
}
export function speechText(value, expand = true, maximum = 650, describeEmojis = true, contextualEndings = true) {
  let text = String(value || "").normalize("NFC").trim();
  if (contextualEndings) text = addPeruanoCompliment(text);
  if (describeEmojis) text = describeEmojiText(text);
  if (expand) {
    // Keep links and email addresses intact; only expand complete tokens.
    text = text.split(/(https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,})/gi).map((part, index) => {
      if (index % 2) return part;
      part = part.replace(/(?<![\p{L}\p{N}_])(\d+(?:[.,]\d+)?)\s*(GHz|MHz|GB|MB|KB|TB|Gb|Mb|cm|mm|km|kg|mg|ml)(?![\p{L}\p{N}_])/giu,
        (_, number, unit) => {
          const forms = units[unit] || units[unit.toLowerCase()] || units[unit.toUpperCase()] || units[Object.keys(units).find(key => key.toLowerCase() === unit.toLowerCase())];
          return forms ? `${number} ${forms[Number(number.replace(",", ".")) === 1 ? 0 : 1]}` : `${number} ${unit}`;
        });
      part = part.replace(/(?<![\p{L}\p{N}\p{M}_])la\s+pqtp(?![\p{L}\p{N}\p{M}_])/giu, "la pucta que te parió");
      part = part.replace(/(?<![\p{L}\p{N}_])p\.\s*ej\.(?![\p{L}\p{N}_])/giu, "por ejemplo");
      return part.replace(/(?<![\p{L}\p{N}\p{M}_])([\p{L}\p{M}]+)(?![\p{L}\p{N}\p{M}_])/gu, token => token === "k" ? "que" : streamPronunciations[token.toLowerCase()] || words[token.toLowerCase()] || token);
    }).join("");
  }
  text = truncateWords(text, maximum - 1);
  // A complete sentence gives the local model a clear ending cue.
  return text && !/[.!?…]["'»”)]*$/u.test(text) ? text + "." : text;
}

// Parse effects before expanding text. Codes never reach the voice provider.
export function speechSegments(value, { expand = true, describeEmojis = true, sounds = true, reactions = true, speaker = "" } = {}) {
  const segments = [];
  let activeVoiceTag = "";
  let offset = 0, count = 0, remaining = 650, wordBudget = 55, pending = speaker ? String(speaker).slice(0,100).replace(new RegExp(SOUND_CODE_SOURCE,"g")," ")+" dice: " : "";
  const appendText = (raw, expression) => {
    if (remaining < 2 || wordBudget < 1 || !raw.trim()) return;
    const text = limitChatWords(speechText(raw, expand, remaining, describeEmojis, false),wordBudget);
    if (text && /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(text)) { segments.push({ type: "speech", text, ...(activeVoiceTag ? {voiceTag: activeVoiceTag} : {}), ...(expression ? {expression} : {}) }); remaining -= text.length; wordBudget -= countChatWords(text); }
  };
  const limited = limitChatWords(String(value || "").normalize("NFC"));
  const raw = reactions ? addPeruanoCompliment(limited) : limited;
  const codes = new RegExp(String.raw`(https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,})|${SOUND_CODE_SOURCE}|(${VOICE_TAG_SOURCE})|(?<![\p{L}\p{N}\p{M}_])(${CHAT_REACTION_SOURCE})(?![\p{L}\p{N}\p{M}_])`, 'giu');
  for (const match of raw.matchAll(codes)) {
    if (!match[2] && !match[3] && (!match[4] || !reactions)) continue;
    pending += raw.slice(offset, match.index);
    if (match[3]) {
      appendText(pending); pending = "";
      activeVoiceTag = voiceTagFromCode(match[3]);
      offset = match.index + match[0].length;
      continue;
    }
    const reaction = match[4] ? chatReaction(match[4]) : null;
    if (reaction?.expression) {
      appendText(pending); pending = "";
      if(count < MAX_SOUND_EFFECTS) { appendText(reaction.text,reaction.expression); count++; }
      offset = match.index + match[0].length;
      continue;
    }
    const id = reaction?.id ?? soundCodeId(match[2]);
    if (sounds && soundEffectIds.has(id) && count < MAX_SOUND_EFFECTS) {
      appendText(pending); pending = "";
      if(wordBudget>0){segments.push({ type: "sound", id }); count++;wordBudget--;}
    } else pending += match[4] ? match[0] : " ";
    offset = match.index + match[0].length;
  }
  appendText(pending + raw.slice(offset));
  return segments;
}
