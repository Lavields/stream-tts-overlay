export const MAX_CHAT_WORDS=55;
// Keep code parsing and truncation in sync, including pasted chat formatting.
export const SOUND_CODE_SOURCE = String.raw`[{｛][\s\u200B-\u200D\uFEFF]*([0-9０-９]{1,6})[\s\u200B-\u200D\uFEFF]*[}｝]`;
export const VOICE_TAG_NAMES = Object.freeze([
  "verity", "cutegirl", "terror", "madre", "mujer2", "colombiana", "chilena", "argentina", "mexicana",
]);
export const VOICE_TAG_SOURCE = String.raw`[{｛][\s\u200B-\u200D\uFEFF]*(?:${VOICE_TAG_NAMES.join("|")})[\s\u200B-\u200D\uFEFF]*[}｝]`;
const voiceTagTokenPattern = new RegExp(String.raw`^${VOICE_TAG_SOURCE}$`, "iu");
export const voiceTagFromCode = code => String(code || "")
  .replace(/^[{｛]|[}｝]$/gu, "")
  .replace(/[\s\u200B-\u200D\uFEFF]/gu, "")
  .normalize("NFC")
  .toLocaleLowerCase("es");
export const soundCodeId = digits => Number(digits.replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xFF10)));
// Count a whole sound code as one token; never cut off its closing brace.
const tokenPattern = new RegExp(String.raw`${VOICE_TAG_SOURCE}|${SOUND_CODE_SOURCE}|https?:\/\/\S+|[\p{L}\p{N}][\p{L}\p{N}\p{M}'’_-]*|\p{Extended_Pictographic}(?:[\uFE0F\u{1F3FB}-\u{1F3FF}]|\u200D\p{Extended_Pictographic})*`, 'giu');
export const countChatWords=value=>[...String(value||'').matchAll(tokenPattern)].filter(token=>!voiceTagTokenPattern.test(token[0])).length;
export function limitChatWords(value,maximum=MAX_CHAT_WORDS){
 const text=String(value||'').trim();
 const tokens=[...text.matchAll(tokenPattern)].filter(token=>!voiceTagTokenPattern.test(token[0]));
 const limit=Math.min(MAX_CHAT_WORDS,Math.max(1,Number(maximum)||MAX_CHAT_WORDS));
 return tokens.length>limit?text.slice(0,tokens[limit].index).trimEnd():text;
}

export function containsSoundCode(value) {
 const pattern=new RegExp(String.raw`(?:https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,})|${SOUND_CODE_SOURCE}`,'gi');
 return [...String(value).matchAll(pattern)].some(match=>match[1]!==undefined);
}
