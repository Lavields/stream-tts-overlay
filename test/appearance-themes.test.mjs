import test from 'node:test';
import assert from 'node:assert/strict';
import { appearanceThemes, appearancePalette } from '../public/appearance-themes.js';

test('los diez temas incluyen colores válidos y distintos para ambos modos', () => {
  assert.equal(Object.keys(appearanceThemes).length, 10);
  for (const [id, theme] of Object.entries(appearanceThemes)) {
    assert.ok(theme.name);
    for (const mode of ['light', 'dark']) {
      const palette=appearancePalette(id, mode);
      for (const color of ['background', 'foreground', 'accent']) assert.match(palette[color], /^#[0-9a-f]{6}$/i);
    }
    assert.notEqual(theme.light.background, theme.dark.background);
  }
  assert.equal(appearancePalette('custom', 'light'), null);
});
