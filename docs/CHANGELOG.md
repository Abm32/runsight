# Changelog

All notable changes to RunSight will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-06-10

### Added
- **Demo generator workflow** — RunSight now records an awesome, narratable demo, not just a raw screen capture
- **Page understanding** (`agent/pageAnalyzer.js`) — on every page, the agent reads each button/link, predicts where it leads, ranks them, and summarizes the page
- **Two exploration modes, chosen interactively at runtime:**
  - `llm` — best understanding (reads each element via vision, predicts destinations). Needs an API key.
  - `heuristic` — free, offline, no key (rule-based ranking + attribute-based destination guesses)
- **Interactive setup prompts** (`utils/prompt.js`) — a single unified list of every model (grouped by provider, cheap tiers first) plus a "Heuristic" entry; the API key is only asked for once an LLM model is actually picked, and only if it isn't already in the environment. Keys are held in memory for the run only — never written to disk, logs, or the report; input is masked; env vars are used first
- **Automatic project-context understanding** (`agent/contextBuilder.js`) — with no `.runsight` guide present, RunSight now reads `package.json` (description, keywords) and detects pages/routes from common framework conventions (Next.js `pages/`/`app/` router, `src/pages`, `src/views`, static multi-page `*.html`) and synthesizes a lightweight guide automatically. This feeds the same LLM prompt and heuristic destination-guessing path a hand-written `.runsight` file would — no setup required for a solid first demo. When a `.runsight` file *is* present, the auto context is appended as supplementary background rather than overriding it
- **Guide-aware heuristic captions** (`agent/pageAnalyzer.js`) — `guessDestination`/page summaries now cross-reference the `.runsight` guide or auto-generated context to produce more specific narration even with no API key (e.g. "the /dashboard page — main app view" instead of just "the /dashboard page")
- **Silent non-interactive default** — when running non-interactively (CI, agents) with no `--mode`/`--model` flags, RunSight now automatically uses an available `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` from the environment if present, and falls back to `heuristic` mode without prompting or erroring if not
- **Resilient postinstall** (`scripts/postinstall.js`) — skips the Chromium download if already installed, and never fails `npm install` in offline/sandboxed environments (falls back to a manual-install hint instead); honors `RUNSIGHT_SKIP_BROWSER_INSTALL`/`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`
- **Hero output summary** (`cli.js`) — the CLI now prints a boxed "Your demo is ready" block at the end of every run, surfacing `demo.mp4` and `flow.md` first as the shareable artifacts
- **Configurable model catalog** (`config/models.js`) — OpenAI (gpt-4o, gpt-4.1, gpt-4o-mini, gpt-4.1-mini) and Anthropic (claude-sonnet-4, claude-3-5-haiku), including cheaper tiers and a custom model entry
- **Coverage modes** — `--coverage=happy` (default, focused demo story) and `--coverage=full` (breadth-first crawl of every page)
- **Auto-edited demo video** (`agent/demoEditor.js`) — burns timed captions onto the recording and encodes a polished `demo.mp4`
- **Flow narration** (`agent/flowNarrator.js`) — writes `flow.md` with pages visited, predicted destinations, and a step-by-step walkthrough
- **Bundled FFmpeg** — `@ffmpeg-installer/ffmpeg` is installed with RunSight, so demo editing works out of the box (falls back to system FFmpeg, then to the raw WebM recording)
- New CLI flags: `--mode`, `--model`, `--coverage`

### Changed
- `agent/explorer.js` now understands each page before acting (understand → rank → click best → navigate → repeat)
- `agent/recorder.js` returns the raw WebM; the demo editor owns the single high-quality encode pass
- Hardened blank-screen detection (settle + re-check) and added recovery from browser error pages (e.g. a server that stops responding mid-run)
- `report.json` version is now `1.2.0`
- `package.json` now declares an explicit `files` field so only the runtime-needed directories are published

## [1.1.1] - 2026-04-29

### Changed
- Repositioned project vision: "Your project demos itself" — from browser agent to demo generator
- Updated package.json description and keywords to match new positioning
- Rewrote README.md with vision section, before/after table, and roadmap preview
- Rewrote ROADMAP.md with 3-phase evolution: demo generator → shareable links → workflow integration
- Updated ARCHITECTURE.md with vision statement and future module placeholders

## [1.1.0] - 2026-04-29

### Added
- README.md-aware project detection — reads README for project context before scanning
- Graceful sub-service failure handling — warns and continues instead of crashing
- `.runsight` guide file support — tells the agent how to navigate your app
- `.runsight` guide template with ready-to-use AI prompt (`docs/GUIDE_TEMPLATE.md`)
- Keyboard action support — parse from `.runsight` guide, execute during gameplay
- EADDRINUSE auto-recovery — detects port conflicts, kills blocking process, retries
- Error log files — saves detailed `error-<name>.log` with process output on failure
- Dynamic UI polling — waits up to 30s for new elements after page state changes

### Fixed
- No longer treats subdirectories (public/, video/, etc.) as separate services when root has a runnable server
- Range/hidden/color/file inputs skipped during exploration (caused timeouts)
- Input selector builder uses type+name attributes instead of text content
- Failed elements marked as clicked to prevent retry loops
- Variable scoping bug in explorer catch block (`chosen is not defined`)
- Expanded ignore list for non-service directories (dist, build, out, public, static, etc.)

### Changed
- Monorepo detection only activates when root directory has no runnable project

## [1.0.0] - 2026-04-29

### Changed
- Promoted v0.1.0 pre-release to v1.0.0 production ready
- Merged `v0.1.0-dev` branch into `main`

## [0.1.0] - 2026-04-29

### Added
- Project scaffolding and directory structure
- CLI entry point with yargs (`runsight [path] [options]`)
- Programmatic API stub (`runSight(options)`)
- Logger with dual output (logs.txt + report.json)
- Project detector (Node.js, Python, static, monorepo)
- Port detector (stdout regex parsing + TCP polling)
- Project runner (install, start, port detect, process cleanup)
- Screenshotter (full-page PNG, blank screen detection)
- Video recorder (Playwright recordVideo, optional FFmpeg mp4 conversion)
- Heuristic exploration strategy (DOM element discovery + action execution)
- Priority-based exploration strategy (scored element ordering + visit tracker)
- LLM-guided exploration strategy (OpenAI GPT-4o + Anthropic Claude vision)
- Browser explorer (3-tier strategy orchestration, stop conditions, summary)
- Main orchestrator pipeline (detect → run → explore → capture → report)
- Full documentation (ARCHITECTURE, API, ROADMAP, CONTRIBUTING, CHANGELOG)
