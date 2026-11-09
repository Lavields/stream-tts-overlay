export const soundCooldownMs = Object.freeze({90: 5 * 60 * 1000});

// One cooldown per sound across all users/platforms, including previews.
// Storage survives reloads; Web Locks serialize starts across same-origin tabs.
export function createSoundCooldown({storage, locks, now = Date.now} = {}) {
  const memory = new Map();
  const key = id => `streamvoice-sound-last-start:${id}`;
  function remaining(id) {
    const duration = soundCooldownMs[id];
    if (!duration) return 0;
    let last = memory.get(id) || 0;
    try {
      const saved = Number(storage?.getItem(key(id)));
      if (Number.isFinite(saved) && saved > last) last = saved;
    } catch {}
    if (!last) return 0;
    return Math.max(0, last + duration - now());
  }
  async function start(id, startPlayback) {
    const attempt = () => {
      if (remaining(id) > 0) return false;
      // A cancelled or failed start must not consume the five-minute window.
      if (startPlayback() === false) return false;
      if (soundCooldownMs[id]) {
        const time = now();
        memory.set(id,time);
        try { storage?.setItem(key(id), String(time)); } catch {}
      }
      return true;
    };
    return soundCooldownMs[id] && locks?.request
      ? locks.request(`streamvoice-sound-start:${id}`, attempt)
      : attempt();
  }
  return {remaining, start};
}
