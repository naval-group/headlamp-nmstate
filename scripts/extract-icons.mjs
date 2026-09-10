/**
 * Regenerates src/mdi-icons.json, the offline icon bundle.
 *
 * Every icon the plugin renders must ship inside the bundle: @iconify/react
 * otherwise fetches it from the Iconify CDN at runtime, which silently leaves
 * blank squares in an air-gapped install.
 *
 * The icon set is not a project dependency — it is only needed when the icon
 * list changes:
 *
 *   npm install --no-save @iconify-json/mdi
 *   node scripts/extract-icons.mjs
 *   npm uninstall @iconify-json/mdi
 *
 * The script scans src/ for `mdi:*` references, so adding an icon to a
 * component and re-running it is all that is required.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
const OUT = 'src/mdi-icons.json';

function walk(dir) {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(tsx?|jsx?)$/.test(entry) ? [path] : [];
  });
}

const used = new Set();
for (const file of walk(SRC)) {
  for (const match of readFileSync(file, 'utf8').matchAll(/mdi:([a-z0-9-]+)/g)) {
    used.add(match[1]);
  }
}

const source = JSON.parse(
  readFileSync('node_modules/@iconify-json/mdi/icons.json', 'utf8')
);

const icons = {};
const missing = [];
for (const name of [...used].sort()) {
  if (source.icons[name]) icons[name] = source.icons[name];
  else missing.push(name);
}

if (missing.length) {
  console.error(`Unknown mdi icons referenced in src/: ${missing.join(', ')}`);
  process.exit(1);
}

writeFileSync(
  OUT,
  JSON.stringify(
    { prefix: 'mdi', width: source.width ?? 24, height: source.height ?? 24, icons },
    null,
    1
  ) + '\n'
);
console.log(`Wrote ${Object.keys(icons).length} icons to ${OUT}`);
