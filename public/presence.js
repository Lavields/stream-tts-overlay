// Shared by the studio and OBS: idle avatars stay below the frame.
export const SLIDE_MS = 340;
export function createAvatarPresence(root, blink) {
  let speaking = false, blinking = false, lastBlink = "", generation = 0;
  const render = () => {
    const shown = speaking || blinking;
    root.classList.toggle("is-present", shown);
    root.setAttribute("aria-hidden", String(!shown));
  };
  render();
  return {
    update(state, now = Date.now()) {
      speaking = Boolean(state.speaking);
      const fresh = state.blinkId && state.blinkId !== lastBlink &&
        now - state.blinkAt >= 0 && now - state.blinkAt < 1500;
      if (state.blinkId) lastBlink = state.blinkId;
      if (!fresh) { render(); return Promise.resolve(); }
      blinking = true;
      const ticket = ++generation;
      render();
      return blink(root).finally(() => {
        if (generation === ticket) { blinking = false; render(); }
      });
    },
    reset() {
      generation++;
      speaking = blinking = false;
      root.classList.remove("blinking");
      render();
    },
  };
}
