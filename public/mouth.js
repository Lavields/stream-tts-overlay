// Two-frame puppets need brief articulation closures even across sustained vowels.
export function createMouthDriver() {
  let peak = 0,
    openedAt = null,
    closedUntil = 0;
  return (rms, time) => {
    peak = Math.max(rms, peak * 0.96);
    if (rms < Math.max(0.009, peak * 0.28)) {
      openedAt = null;
      return 0;
    }
    if (time < closedUntil) return 0;
    if (openedAt === null) openedAt = time;
    if (time - openedAt >= 145) {
      openedAt = null;
      closedUntil = time + 100;
      return 0;
    }
    return Math.min(1, rms / Math.max(0.015, peak));
  };
}
export function systemSpeechRms(time) {
  return Math.max(0, Math.sin(time / 47)) * 0.12;
}
