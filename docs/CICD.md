# CI/CD Pipeline

## Overview

RunSight uses **GitHub Actions** to automatically publish to npm when a version tag is pushed.

```
Developer pushes tag (v1.2.0)
        │
        ▼
GitHub Actions detects tag push (v*)
        │
        ▼
Checks out code → installs deps → runs `npm publish`
        │
        ▼
Package live on npm within ~60 seconds
```

## What triggers a publish?

**Only version tags.** The workflow runs when a git tag matching `v*` is pushed to GitHub.

| Action | Triggers publish? |
|--------|-------------------|
| Push commits to `main` | ❌ No |
| Push commits to `v1.2.0-dev` | ❌ No |
| Push tag `v1.2.0` | ✅ Yes |
| Push tag `v1.2.1` | ✅ Yes |
| Push tag `v2.0.0` | ✅ Yes |
| Create a GitHub Release | ❌ No (unless it creates a tag) |

## How to release a new version

### Step-by-step

```bash
# 1. You're on the dev branch with all changes committed
git checkout v1.2.0-dev

# 2. Bump version in all files (package.json, index.js, logger.js, README, CHANGELOG)
#    See AGENTS.md section 4 for the full list

# 3. Commit the version bump
git commit -am "chore: bump version to v1.2.0"

# 4. Merge to main
git checkout main
git merge v1.2.0-dev

# 5. Create the tag — THIS is what triggers npm publish
git tag -a v1.2.0 -m "v1.2.0 — description of changes"

# 6. Push everything
git push origin main v1.2.0-dev --tags
#                                ^^^^^^
#                    This pushes the tag → triggers GitHub Actions → publishes to npm
```

### Shortcut (if already on main with changes merged)

```bash
npm version patch   # auto-bumps package.json 1.1.0 → 1.1.1, creates git tag
git push origin main --tags   # pushes tag → auto-publishes
```

Note: `npm version` only bumps `package.json`. You still need to manually update `index.js`, `logger.js`, `README.md`, and `CHANGELOG.md`. Use the full process from AGENTS.md for minor/major releases.

## Workflow file

Located at `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'          # Only runs when a v* tag is pushed

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci --ignore-scripts
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### What each step does:

1. **Trigger** — GitHub detects a tag push matching `v*`
2. **Checkout** — clones the repo at the tagged commit
3. **Setup Node** — installs Node.js 20, configures npm registry
4. **Install** — `npm ci --ignore-scripts` (skips postinstall to avoid installing Playwright on CI)
5. **Publish** — `npm publish` using the `NPM_TOKEN` secret for authentication

## Secrets

| Secret | Where to set | Purpose |
|--------|-------------|---------|
| `NPM_TOKEN` | GitHub → Settings → Secrets → Actions | Authenticates `npm publish` |

**Location:** https://github.com/Abm32/KiroVision/settings/secrets/actions

**To rotate the token:**
1. Go to https://www.npmjs.com/settings/tokens
2. Delete the old token
3. Create a new Granular Access Token with publish permission
4. Update the `NPM_TOKEN` secret on GitHub

## Monitoring

After pushing a tag, check the publish status at:
**https://github.com/Abm32/KiroVision/actions**

- ✅ Green = published successfully
- ❌ Red = failed (check logs for error)

Verify on npm: https://www.npmjs.com/package/runsight

## Common issues

| Problem | Cause | Fix |
|---------|-------|-----|
| Workflow didn't run | Tag not pushed (`--tags` missing) | `git push origin --tags` |
| 403 Forbidden | NPM_TOKEN expired or missing | Rotate token, update GitHub secret |
| Version conflict | Version already exists on npm | Bump version, create new tag |
| `npm ci` fails | Lockfile out of sync | Run `npm install` locally, commit `package-lock.json` |
