#!/usr/bin/env node
// Bump version references for my-app-assets release.
// Usage: node .claude/skills/release-bump/bump.mjs <currentVersion> <targetVersion>
// Example: node .claude/skills/release-bump/bump.mjs v1.0.6 v1.0.7

import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , currentArg, targetArg] = process.argv;
if (!currentArg || !targetArg) {
  console.error('Usage: node bump.mjs <currentVersion> <targetVersion>');
  console.error('Example: node bump.mjs v1.0.6 v1.0.7');
  process.exit(1);
}

const VERSION_RE = /^v\d+\.\d+\.\d+$/;
if (!VERSION_RE.test(currentArg) || !VERSION_RE.test(targetArg)) {
  console.error('Versions must match vX.Y.Z');
  process.exit(1);
}
if (currentArg === targetArg) {
  console.error('Current and target versions are identical; nothing to do');
  process.exit(1);
}

// Resolve repo root from this script's location: <repo>/.claude/skills/release-bump/bump.mjs
const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '../../..');

const THEME_STYLES = [
  join(REPO, 'app1/v1/theme_styles_2x.json'),
  join(REPO, 'app1/v1/theme_styles_3x.json'),
];
const CONFIG = join(REPO, 'app1/v1/config.json');

async function patchThemeStyles(path, from, to) {
  const raw = await readFile(path, 'utf8');
  const search = `/my-app-assets@${from}/`;
  const replace = `/my-app-assets@${to}/`;
  if (!raw.includes(search)) {
    throw new Error(`${path} has no occurrences of ${search} — wrong current version?`);
  }
  const next = raw.replaceAll(search, replace);
  await writeFile(path, next);
  const count = (next.match(new RegExp(replace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
  console.log(`  ${path}: ${count} URLs updated`);
}

async function patchConfig(path, target) {
  const raw = await readFile(path, 'utf8');
  const data = JSON.parse(raw);
  if (!data.version) throw new Error(`${path} missing "version" field`);
  const prev = data.version;
  data.version = target;
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
  console.log(`  ${path}: version ${prev} -> ${target}`);
}

async function validateUrls(path, target) {
  const raw = await readFile(path, 'utf8');
  const urls = raw.match(/https:\/\/[^"\s]+/g) ?? [];
  let missing = 0;
  for (const url of urls) {
    const prefix = `https://cdn.jsdelivr.net/gh/hdheyou/my-app-assets@${target}/`;
    if (!url.startsWith(prefix)) continue;
    const relPath = url.slice(prefix.length);
    const abs = join(REPO, relPath);
    try {
      await access(abs);
    } catch {
      console.error(`  MISSING: ${relPath}`);
      missing++;
    }
  }
  console.log(`  ${path}: ${urls.length} URLs, ${missing} missing local files`);
  return missing;
}

console.log(`Bumping ${currentArg} -> ${targetArg}`);
console.log('\n[1/3] Patching theme_styles JSONs');
for (const p of THEME_STYLES) await patchThemeStyles(p, currentArg, targetArg);

console.log('\n[2/3] Patching config.json version field');
await patchConfig(CONFIG, targetArg);

console.log('\n[3/3] Validating all URLs resolve to local files');
let totalMissing = 0;
for (const p of THEME_STYLES) totalMissing += await validateUrls(p, targetArg);

if (totalMissing > 0) {
  console.error(`\nFAILED: ${totalMissing} URL(s) point to missing files. Release aborted — fix before committing.`);
  process.exit(1);
}
console.log('\nOK: all URLs resolve. Safe to commit + tag.');
