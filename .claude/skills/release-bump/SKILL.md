---
name: release-bump
description: Release a new immutable version tag for the my-app-assets repo. Use when the user says "发 v1.0.X"/"发新版"/"release v1.0.X"/"bump tag"/"发布 vX.Y.Z" or similar — triggers the full flow of updating URL pins in theme_styles JSONs, updating config.json's version field, committing on dev, merging to main, creating and pushing the new tag, and verifying via jsDelivr.
---

# Release a new version tag

Used after content is ready (images edited, source JSON changed, etc.) to cut a new immutable release. Each tag is a frozen snapshot — never force-move existing tags.

## Preconditions

1. Repo: `my-app-assets` (GitHub owner `hdheyou`)
2. Currently on `dev` branch (or similar working branch)
3. Any content changes already staged or present in working tree
4. Node available on PATH (used to run `bump.mjs`)

## Steps

### 1. Determine current and target version

- **Current**: parse any `@v1.0.X` from `app1/v1/theme_styles_2x.json` (grep the first URL)
- **Target**: the user typically specifies (e.g., "发 v1.0.7"). If they don't, auto-increment the patch number. Never reuse an existing tag — check `git tag -l` first.

### 2. Patch version references

Run:

```bash
node .claude/skills/release-bump/bump.mjs <currentVersion> <targetVersion>
```

The script updates, in place:
- `app1/v1/theme_styles_2x.json`: `@<current>` → `@<target>` on every URL
- `app1/v1/theme_styles_3x.json`: same
- `app1/v1/config.json`: `version` field only (URLs inside config.json use `{version}` template, so no URL rewrite needed)

It also validates that every URL in both JSONs maps to an existing local file and prints the count. Abort the release if any file is missing — that indicates a drift.

### 3. Commit, merge, push, tag

All in one chained bash call for atomicity:

```bash
git add -A
git commit -m "release: bump to <targetVersion>

<1-line summary of what changed in this release>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git checkout main
git merge --ff-only dev
git push origin main
git tag -a <targetVersion> -m "<targetVersion>: <release note>"
git push origin <targetVersion>
git checkout dev
```

### 4. Verify via jsDelivr

Wait ~15s for jsDelivr to index the new tag, then:

```bash
curl -s "https://cdn.jsdelivr.net/gh/hdheyou/my-app-assets@<targetVersion>/app1/v1/theme_styles_2x.json" | head -c 300
```

Expect: JSON starts with `[{ "id": "remote_...", ...` and image URLs contain `@<targetVersion>`.

Also verify config.json (served from `@main`, no tag pin):

```bash
curl -s "https://cdn.jsdelivr.net/gh/hdheyou/my-app-assets@main/app1/v1/config.json"
```

Expect: `"version": "<targetVersion>"`. If still showing the old version, purge jsDelivr:

```bash
curl -s "https://purge.jsdelivr.net/gh/hdheyou/my-app-assets@main/app1/v1/config.json"
```

## Critical rules

- **Never force-move an existing tag.** jsDelivr treats tags as immutable and its purge is throttled/unreliable for tag moves. If you need to fix content already released under a tag, always bump to the next patch version.
- **Never push to `main` directly.** Always commit on `dev`, then `git merge --ff-only dev` into main.
- Use annotated tags (`git tag -a`), not lightweight tags.
- If `git merge --ff-only` fails, abort — do not resolve conflicts mid-release. Figure out why main and dev diverged before retrying.

## Context for the flow (why the design is this way)

- `v1/` is a frozen **schema** version (client code knows its path)
- `v1.0.X` is a content **release** tag (each is an immutable snapshot)
- `theme_styles_{2x,3x}.json` have URLs pinned to a specific tag → that tag's content always references that same tag's images → self-consistent frozen snapshots
- `config.json` is the entry point fetched via `@main` (mutable pointer), tells the app which version to use; URLs inside config.json use `{version}` template that the app substitutes with the `version` field value

See `memory/project_structure.md` for the full model.
