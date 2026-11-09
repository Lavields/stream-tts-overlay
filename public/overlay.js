import { avatarSVG, setMouth, blink } from "./avatars.js";
import { createAvatarPresence } from "./presence.js";
const root = document.querySelector("#overlay-stage"),
  avatar = document.querySelector("#overlay-avatar");
const presence = createAvatarPresence(root, () => blink(avatar));
const userLabel = document.querySelector("#overlay-user"), textLabel = document.querySelector("#overlay-text");
const caption = textLabel.closest('.overlay-caption');
function fitCaption() {
  if (!caption) return;
  // Only measure when content or viewport changes, never on mouth-level events.
  caption.style.removeProperty('--overlay-font-size');
  const base = parseFloat(getComputedStyle(textLabel).fontSize);
  const fits = () => {
    const style = getComputedStyle(caption);
    const contentBottom = caption.getBoundingClientRect().bottom -
      parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth);
    // The decorative speech-balloon tail extends outside the padding box.
    return textLabel.getBoundingClientRect().bottom <= contentBottom + 1 &&
      textLabel.scrollWidth <= textLabel.clientWidth + 1 &&
      userLabel.scrollWidth <= userLabel.clientWidth + 1;
  };
  if (fits()) return;
  let low = 8, high = base;
  caption.style.setProperty('--overlay-font-size', low + 'px');
  for (let i = 0; i < 9; i++) {
    const size = (low + high) / 2;
    caption.style.setProperty('--overlay-font-size', size + 'px');
    if (fits()) low = size;
    else high = size;
  }
  caption.style.setProperty('--overlay-font-size', Math.floor(low * 10) / 10 + 'px');
}
let resizeFrame;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(fitCaption);
});
document.fonts?.ready.then(fitCaption);
let previous = "",
  timeout;
const source = new EventSource("/api/events?overlay=1");
source.addEventListener("overlay", (e) => {
  const s = JSON.parse(e.data);
  if (previous !== s.avatar) {
    avatar.innerHTML = avatarSVG(s.avatar);
    previous = s.avatar;
  }
  presence.update(s);
  root.classList.toggle("idle", !s.speaking);
  setMouth(avatar, s.speaking ? s.level : 0);
  let contentChanged = false;
  if (userLabel.textContent !== s.user) { userLabel.textContent = s.user; contentChanged = true; }
  const text = String(s.text || "").replace(/\{\d{1,6}\}/g," ").replace(/\s+/g," ").trim();
  if (textLabel.textContent !== text) { textLabel.textContent = text; contentChanged = true; }
  if (contentChanged) fitCaption();
  clearTimeout(timeout);
  if (s.speaking)
    timeout = setTimeout(() => {
      setMouth(avatar, 0);
      root.classList.add("idle");
      presence.reset();
    }, 3000);
});
source.onerror = () => {
  setMouth(avatar, 0);
  root.classList.add("idle");
  presence.reset();
};
