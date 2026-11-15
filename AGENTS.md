# AGENTS.md — Mandatory Development Rules

> **ALL agents, editors, and contributors MUST read this file before making any changes.**
> This includes Kiro CLI, Claude, Cursor, Copilot, Codex, and any human developer.

---

## 1. Version Strategy

Follow [Semantic Versioning](https://semver.org/) strictly:

| Change type | Version bump | Example |
|-------------|-------------|---------|
| Bug fix, typo, crash fix | `patch` | 1.1.0 → 1.1.1 |
| New feature, backward compatible | `minor` | 1.1.0 → 1.2.0 |
| Breaking API/CLI change | `major` | 1.1.0 → 2.0.0 |

**Never skip versions. Never jump from 1.1.0 to 1.3.0.**

## 2. Branch Strategy

```
main                ← stable releases only, never commit directly
v{X.Y.Z}-dev        ← all work happens here
```

### Workflow:
1. Create `v{X.Y.Z}-dev` branch from `main`
2. Make all changes on the dev branch
3. When stable: merge to `main`, tag, push
4. **Never push directly to `main`**

### When to create a new branch:
- **Same branch** — bug fixes for the current version
- **New minor branch** — new features (e.g., `v1.2.0-dev`)
- **New major branch** — breaking changes (e.g., `v2.0.0-dev`)

## 3. Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) — **no exceptions**:

```
feat: add new feature
fix: fix a bug
docs: documentation only
test: add or update tests
refactor: code change, no new feature or fix
chore: build, deps, CI, tooling
ci: CI/CD changes
```

### Rules:
- One logical change per commit (micro-commits)
- Present tense: `fix: handle port conflict` not `fixed: handled port conflict`
- No periods at the end
- Keep subject under 72 characters
- Reference issues if applicable: `fix: handle EADDRINUSE (#12)`

### Examples:
```
feat: add keyboard action support for games
fix: skip range inputs during exploration
docs: update CHANGELOG.md with v1.1.0 features
chore: bump version to v1.1.0
ci: add GitHub Actions npm publish workflow
```

## 4. Release Process

**This is the exact order. Do not skip steps.**

```bash
# 1. Ensure you're on the dev branch
git checkout v{X.Y.Z}-dev

# 2. Update version in these files:
#    - package.json (version field)
#    - index.js (console.log version)
#    - utils/logger.js (report version)
#    - README.md (badge/header)
#    - docs/CHANGELOG.md (add release entry)

# 3. Commit the version bump
git commit -am "chore: bump version to v{X.Y.Z}"

# 4. Merge to main
git checkout main
git merge v{X.Y.Z}-dev

# 5. Tag
git tag -a v{X.Y.Z} -m "v{X.Y.Z} — brief description"

# 6. Push (triggers auto-publish to npm)
git push origin main v{X.Y.Z}-dev --tags
```

## 5. File Structure

Do not reorganize without discussion. Current structure:

```
/agent          — core modules (detector, runner, explorer, recorder, screenshotter)
/strategies     — exploration strategies (heuristic, priority, LLM)
/utils          — utilities (logger, portDetector)
/docs           — documentation (ARCHITECTURE, API, CHANGELOG, ROADMAP, CONTRIBUTING, GUIDE_TEMPLATE)
/outputs        — runtime output (gitignored)
index.js        — programmatic API entry point
cli.js          — CLI entry point
mcp.js          — MCP server entry point (`runsight mcp`)
/skills         — agent skills shipped with the package
```

## 6. Code Style

- **CommonJS** (`require`/`module.exports`) — not ESM
- **async/await** for all async operations
- **JSDoc comments** on all exported functions
- **Error handling** — try/catch with meaningful messages, never swallow errors
- **No new dependencies** without justification — keep the package lean

## 7. Testing Changes

Before merging to main, verify:
1. `node cli.js --help` works
2. `node cli.js /path/to/test-project --max-steps=3 --no-video` completes without errors
3. `outputs/report.json` is valid JSON with steps
4. `outputs/logs.txt` is human-readable

## 8. Documentation Updates

Every feature or fix must update:
- `docs/CHANGELOG.md` — add entry under current version
- `docs/ARCHITECTURE.md` — if module behavior changed
- `docs/API.md` — if API signature changed
- `README.md` — if user-facing behavior changed
