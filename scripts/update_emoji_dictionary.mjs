// Refresh the bundled Spanish emoji names from Unicode CLDR. No runtime requests.
import { writeFile } from 'node:fs/promises';
const base = 'https://raw.githubusercontent.com/unicode-org/cldr-json/main/';
const names = {};
for (const locale of ['es', 'es-419']) {
  for (const [folder, key] of [['cldr-annotations-full', 'annotations'], ['cldr-annotations-derived-full', 'annotationsDerived']]) {
    const url = `${base}cldr-json/${folder}/${key}/${locale}/annotations.json`;
    const response = await fetch(url);
    if (!response.ok) throw Error(`CLDR ${locale}: HTTP ${response.status}`);
    const data = await response.json();
    for (const [emoji, entry] of Object.entries(data[key].annotations)) {
      if (entry.tts?.[0] && /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(emoji))
        names[emoji.replace(/[\uFE0E\uFE0F]/gu, '')] = entry.tts[0];
    }
  }
}
const license = await fetch(`${base}LICENSE`);
if (!license.ok) throw Error(`CLDR license: HTTP ${license.status}`);
await writeFile(new URL('../public/emoji-license.txt', import.meta.url), await license.text());
await writeFile(new URL('../public/emoji-names.js', import.meta.url), `// Spanish emoji names from Unicode CLDR (es + es-419).\n// Source: https://github.com/unicode-org/cldr-json\n// License: public/emoji-license.txt\nexport const emojiNames = ${JSON.stringify(names, null, 0)};\n`);
console.log(`Bundled ${Object.keys(names).length} Spanish emoji names.`);
