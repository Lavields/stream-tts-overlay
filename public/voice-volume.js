export function voiceVolume(volumes, id) {
  const value = volumes?.[id];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(200, Math.max(0, value)) : 100;
}
export function playbackGain(master, volumes, id) {
  return Math.min(100, Math.max(0, Number(master) || 0)) / 100 * voiceVolume(volumes, id) / 100;
}
