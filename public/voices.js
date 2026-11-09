export function isSpanish(value) {
  return (
    typeof value === "string" &&
    /^(es(?:[-_]|$)|spanish$|español$)/i.test(value.trim())
  );
}
export function supportsSpanish(voice) {
  return (
    isSpanish(voice.labels?.language) ||
    isSpanish(voice.language) ||
    (voice.languages || []).some((v) =>
      isSpanish(typeof v === "string" ? v : v?.language || v?.name),
    ) ||
    (voice.verified_languages || []).some((v) => isSpanish(v.language))
  );
}
