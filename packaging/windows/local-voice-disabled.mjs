// This distribution deliberately contains no personal voice profile or local model.
export const luchoVoice = null;
export async function localVoiceAvailable() { return false; }
export async function localSpeech() {
  throw Error("Las voces de perfiles locales no están incluidas en esta edición.");
}
export function stopLocalVoice() {}
