#!/usr/bin/env node
// Regenerate app1/v1/theme_styles_{2x,3x}.json from a scale-agnostic source JSON.
// Usage: node .claude/skills/regen-theme-styles/regen.mjs <sourcePath> <targetVersion>

import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , srcArg, versionArg] = process.argv;
if (!srcArg || !versionArg) {
  console.error('Usage: node regen.mjs <sourcePath> <targetVersion>');
  console.error('Example: node regen.mjs /Users/hy/Downloads/qietu/theme_styles.json v1.0.6');
  process.exit(1);
}

const VERSION_RE = /^v\d+\.\d+\.\d+$/;
if (!VERSION_RE.test(versionArg)) {
  console.error('Version must match vX.Y.Z');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '../../..');
const BASE = `https://cdn.jsdelivr.net/gh/hdheyou/my-app-assets@${versionArg}/app1/v1`;

const toIosUrl = (key, scale) => {
  const theme = key.split('_')[1];
  return `${BASE}/iOS/themeStyle/${theme}/${key}@${scale}.png`;
};
const toMacUrl = (key, scale) => `${BASE}/macOS/themeStyle/${key}@${scale}.png`;

function transformNode(node, scale, platform) {
  if (typeof node === 'string') {
    if (platform === 'iOS' && /^(bg|demo|item|tab)_/.test(node)) return toIosUrl(node, scale);
    if (platform === 'macOS' && /^theme_/.test(node)) return toMacUrl(node, scale);
    return node;
  }
  if (Array.isArray(node)) return node.map((n) => transformNode(n, scale, platform));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = transformNode(v, scale, platform);
    return out;
  }
  return node;
}

function transformEntry(entry, scale) {
  const out = { ...entry };
  if (typeof entry.id === 'string') out.id = entry.id.replace(/^local_/, 'remote_');
  if (typeof entry.isLocal === 'boolean') out.isLocal = false;
  if (entry.iOS) out.iOS = transformNode(entry.iOS, scale, 'iOS');
  if (entry.macOS) out.macOS = transformNode(entry.macOS, scale, 'macOS');
  return out;
}

async function validate(path, version) {
  const raw = await readFile(path, 'utf8');
  const urls = raw.match(/https:\/\/[^"\s]+/g) ?? [];
  const prefix = `https://cdn.jsdelivr.net/gh/hdheyou/my-app-assets@${version}/`;
  let missing = 0;
  for (const url of urls) {
    if (!url.startsWith(prefix)) continue;
    const rel = url.slice(prefix.length);
    try {
      await access(join(REPO, rel));
    } catch {
      console.error(`  MISSING: ${rel}`);
      missing++;
    }
  }
  console.log(`  ${path}: ${urls.length} URLs, ${missing} missing`);
  return missing;
}

console.log(`Regenerating from ${srcArg} with pin @${versionArg}`);
const src = JSON.parse(await readFile(srcArg, 'utf8'));
if (!Array.isArray(src)) {
  console.error('Source must be a JSON array of theme entries');
  process.exit(1);
}

let totalMissing = 0;
for (const scale of ['2x', '3x']) {
  const out = src.map((e) => transformEntry(e, scale));
  const path = join(REPO, `app1/v1/theme_styles_${scale}.json`);
  await writeFile(path, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${path}`);
  totalMissing += await validate(path, versionArg);
}

if (totalMissing > 0) {
  console.error(`\nFAILED: ${totalMissing} URL(s) point to missing files.`);
  console.error('Either add the missing assets, or edit the source JSON to remove stale references.');
  process.exit(1);
}
console.log('\nOK: regeneration complete, all URLs resolve.');
