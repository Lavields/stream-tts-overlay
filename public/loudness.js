// Speech-gated RMS target, independent of engine and the master volume slider.
// Ignore pauses rather than amplifying silence. Keep peaks below -0.45 dBFS.
export const SPEECH_TARGET = 0.1;
export function speechRms(channels, sampleRate) {
  const size = Math.max(1, Math.round(sampleRate * 0.02));
  const powers = [];
  for (let start = 0; start < channels[0].length; start += size) {
    const end = Math.min(start + size, channels[0].length);
    let sum = 0;
    for (const channel of channels) for (let i = start; i < end; i++) sum += channel[i] ** 2;
    powers.push({ power: sum / ((end - start) * channels.length), count: end - start });
  }
  const max = Math.max(0, ...powers.map(p => p.power));
  const gate = Math.max(0.00001, max / 100);
  let sum = 0, count = 0;
  for (const p of powers) if (p.power >= gate) { sum += p.power * p.count; count += p.count; }
  return count ? Math.sqrt(sum / count) : 0;
}
export function normalizeSpeech(channels, sampleRate, state = {}) {
  const rms = speechRms(channels, sampleRate);
  if (!rms) return { rms: 0, gain: state.gain || 1 };
  const gain = Math.min(32, Math.max(0.1, SPEECH_TARGET / rms));
  const previous = state.gain ?? gain;
  const ramp = Math.max(1, Math.round(sampleRate * 0.06));
  const release = Math.exp(-1 / (sampleRate * 0.05));
  let limiter = state.limiter ?? 1;
  for (let i = 0; i < channels[0].length; i++) {
    const g = previous + (gain - previous) * Math.min(1, i / ramp);
    let peak = 0;
    // Link channels and reduce transients with a fast attack and gentle release.
    for (const c of channels) peak = Math.max(peak, Math.abs(c[i] * g));
    const ceiling = peak > 0.95 ? 0.95 / peak : 1;
    limiter = Math.min(ceiling, limiter * release + (1 - release));
    for (const c of channels) c[i] = Math.max(-0.95, Math.min(0.95, c[i] * g * limiter));
  }
  state.gain = gain; state.limiter = limiter;
  return { rms, gain };
}
export function normalizeBuffer(buffer, state) {
  return normalizeSpeech(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)), buffer.sampleRate, state);
}
