---
name: regen-theme-styles
description: Regenerate app1/v1/theme_styles_{2x,3x}.json from a scale-agnostic source JSON (human-edited, usually under /Users/hy/Downloads/qietu/theme_styles.json). Use when the user says "从源 JSON 重新生成"/"regenerate theme_styles"/"根据源文件更新" after editing theme colors, adding themes, or changing structure. Does NOT commit or tag — that's release-bump's job.
---

# Regenerate theme_styles from source

Rebuilds `app1/v1/theme_styles_{2x,3x}.json` from a human-maintained source JSON that holds scale-agnostic image keys (e.g., `"bg_OfficialGold_light"`). Applies these transformations:

- `id`: `local_X` → `remote_X`
- `isLocal`: `true` → `false`
- Strings inside `iOS.*` matching `^(bg|demo|item|tab)_` → full jsDelivr URL with `@<scale>` suffix, using iOS path `app1/v1/iOS/themeStyle/<Theme>/<key>@<N>x.png`
- Strings inside `macOS.*` matching `^theme_` → full jsDelivr URL with `@<scale>` suffix, using flat macOS path `app1/v1/macOS/themeStyle/<key>@<N>x.png`
- Non-image strings (hex colors starting with `#`, `name` object, etc.) are preserved untouched

## Steps

### 1. Confirm inputs with the user if unclear

- **Source path**: default `/Users/hy/Downloads/qietu/theme_styles.json`. If the user mentions a different path, use that.
- **Target version**: the `@v1.0.X` to pin URLs to. Default is the current version already in `app1/v1/theme_styles_2x.json` (parse any URL). If bumping, `release-bump` should be run after.

### 2. Run the regen script

```bash
node .claude/skills/regen-theme-styles/regen.mjs <sourcePath> <targetVersion>
```

Example:
```bash
node .claude/skills/regen-theme-styles/regen.mjs /Users/hy/Downloads/qietu/theme_styles.json v1.0.6
```

It overwrites:
- `app1/v1/theme_styles_2x.json`
- `app1/v1/theme_styles_3x.json`

And validates that every resulting URL maps to an existing local file.

### 3. Review the diff

```bash
git diff app1/v1/theme_styles_2x.json | head -60
```

Confirm the content looks right: expected themes present, colors preserved, `isLocal` false, `id` is `remote_*`.

### 4. Hand off

- If the regen was just to apply URL version bump: release is ready to cut via `release-bump` skill.
- If content structurally changed (new themes, etc.): may need to also add new image files under `app1/v1/iOS/themeStyle/<Theme>/` and `app1/v1/macOS/themeStyle/` before committing.

## Orphan file check

After regen, run a quick sweep for orphan assets (files that no URL references):

```bash
# Get all referenced paths
grep -oh 'app1/v1/[^"]*\.png' app1/v1/theme_styles_2x.json app1/v1/theme_styles_3x.json | sort -u > /tmp/referenced.txt
# Get all existing PNG files
find app1/v1 -name '*.png' -type f | sed 's|^./||' | sort > /tmp/existing.txt
# Orphans = existing but not referenced
comm -23 /tmp/existing.txt /tmp/referenced.txt
```

If orphans exist (e.g., a theme removed from source but files left behind), ask the user whether to `rm` them before the release.

## Notes

- macOS icons live flat in `macOS/themeStyle/` (no per-theme subdir)
- iOS assets live nested in `iOS/themeStyle/<Theme>/`
- The source JSON format has per-entry `iOS: {...}` and `macOS: {...}` sub-objects
- Do NOT run this skill to just bump the tag version; use `release-bump` instead
