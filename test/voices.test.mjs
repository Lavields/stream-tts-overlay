import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isSpanish, supportsSpanish } from "../public/voices.js";
import { avatars, countryAvatars, normalizeAvatar, blink } from "../public/avatars.js";
test("filtra español y excluye inglés, portugués y metadatos ausentes", () => {
  for (const lang of ["es", "es-CL", "es_MX", "Spanish", "español"])
    assert.ok(isSpanish(lang));
  for (const lang of ["en-US", "pt-BR", undefined, "esperanto"])
    assert.equal(isSpanish(lang), false);
  assert.ok(supportsSpanish({ verified_languages: [{ language: "es" }] }));
  assert.ok(supportsSpanish({ labels: { language: "Spanish" } }));
  assert.equal(supportsSpanish({ labels: { language: "English" } }), false);
  assert.equal(supportsSpanish({}), false);
});
test("el catálogo incluye solo voces genéricas en español, sin duplicados", async () => {
  const c = JSON.parse(await readFile(new URL("../public/voice-catalog.json", import.meta.url)));
  assert.equal(c.community.length, 0);
  assert.equal(c.requested.length, 9);
  assert.equal(new Set(c.requested.map(v => v.id)).size, 9);
  assert.deepEqual(c.requested.map(v => v.tag), ["verity", "cutegirl", "terror", "madre", "mujer2", "colombiana", "chilena", "argentina", "mexicana"]);
  assert.ok(c.requested.every(v => isSpanish(v.language) && /^[a-f0-9]{32}$/.test(v.id) && v.source.startsWith("https://fish.audio/")));
});

test("migra avatares anteriores y cierra un parpadeo completo", async () => {
  assert.equal(normalizeAvatar("canadian-m"), "male");
  assert.equal(normalizeAvatar("sock-f"), "female");
  const classes = new Set();
  const root = {
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
  };
  const done = blink(root);
  assert.ok(classes.has("blinking"));
  await done;
  assert.equal(classes.size, 0);
});
test("los avatares incluyen los diez países con IDs estables y sin duplicados", () => {
  assert.equal(avatars.length,19);
  assert.equal(new Set(avatars.map(a=>a.id)).size,19);
  assert.deepEqual(countryAvatars.map(a=>a.id),[
    'cat-peru','cat-chile','cat-argentina','cat-bolivia','cat-mexico','cat-colombia',
    'cat-venezuela','cat-espana','cat-japon','cat-corea-del-sur',
  ]);
  for(const avatar of countryAvatars)assert.equal(normalizeAvatar(avatar.id),avatar.id);
});
test("todos los sprites tienen canal alfa y cuatro cuadros cuadrados", async () => {
  for (const {id} of avatars) {
    const b = await readFile(
      new URL(`../public/assets/avatars/${id}-sprites.png`, import.meta.url),
    );
    assert.equal(b.subarray(1, 4).toString(), "PNG");
    assert.equal(b[25], 6);
    assert.equal(b.readUInt32BE(16), b.readUInt32BE(20));
    assert.equal(b.readUInt32BE(16) % 2, 0);
    const thumb=await readFile(new URL(`../public/assets/avatars/${id}-thumb.png`,import.meta.url));
    assert.equal(thumb.readUInt32BE(16),160);
    assert.equal(thumb.readUInt32BE(20),160);
  }
});
