import test from "node:test";
import assert from "node:assert/strict";
import { createAvatarPresence } from "../public/presence.js";

function fixture() {
  const classes = new Set(), attributes = new Map(), finishes = [];
  let blinks = 0;
  const root = {
    classList: {
      toggle(name, value) { value ? classes.add(name) : classes.delete(name); },
      remove(name) { classes.delete(name); },
    },
    setAttribute(name, value) { attributes.set(name, value); },
  };
  const presence = createAvatarPresence(root, () => {
    blinks++;
    return new Promise(resolve => finishes.push(resolve));
  });
  return { presence, classes, attributes, finishes, blinks: () => blinks };
}
test("el avatar empieza oculto, sube solo al hablar y baja aunque una preferencia antigua diga visible", async () => {
  const f = fixture();
  assert.equal(f.attributes.get("aria-hidden"), "true");
  await f.presence.update({ speaking: false, visible: true });
  assert.equal(f.classes.has("is-present"), false);
  await f.presence.update({ speaking: true });
  assert.equal(f.classes.has("is-present"), true);
  await f.presence.update({ speaking: false });
  assert.equal(f.classes.has("is-present"), false);
});
test("termina un solo parpadeo antes de bajar pese a recibir eventos SSE repetidos", async () => {
  const f = fixture(), state = { speaking: false, blinkId: "message-1", blinkAt: 1000 };
  const pending = f.presence.update(state, 1001);
  await f.presence.update(state, 1002);
  assert.equal(f.blinks(), 1);
  assert.equal(f.classes.has("is-present"), true);
  f.finishes.shift()();
  await pending;
  assert.equal(f.classes.has("is-present"), false);
});
test("un parpadeo anterior no esconde el avatar de una nueva lectura", async () => {
  const f = fixture();
  const pending = f.presence.update({ speaking: false, blinkId: "old", blinkAt: 1000 }, 1001);
  await f.presence.update({ speaking: true }, 1002);
  f.finishes.shift()();
  await pending;
  assert.equal(f.classes.has("is-present"), true);
  f.presence.reset();
  assert.equal(f.classes.has("is-present"), false);
});
test("una desconexión oculta el avatar y un evento de parpadeo antiguo no lo hace aparecer", async () => {
  const f = fixture();
  await f.presence.update({ speaking: false, blinkId: "stale", blinkAt: 1000 }, 4000);
  assert.equal(f.blinks(), 0);
  assert.equal(f.classes.has("is-present"), false);
  const pending = f.presence.update({ speaking: false, blinkId: "fresh", blinkAt: 4000 }, 4001);
  f.presence.reset();
  f.finishes.shift()();
  await pending;
  assert.equal(f.classes.has("is-present"), false);
});
