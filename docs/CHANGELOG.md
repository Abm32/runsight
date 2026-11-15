# Changelog

All notable changes to RunSight will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-11-15

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
- **On-camera direction** (`agent/director.js`) — the recording now looks like a person presenting: a visible cursor glides to each target with a click ripple, off-screen targets are scrolled to smoothly, text is typed character by character, and each action is held long enough to read. An intro title card (project name + description) and an outro card bookend the video
- **Auto-zoom, dead-time cuts** (`agent/demoEditor.js`) — the editor zooms in on every action and pans between nearby ones, and cuts out the time the agent spent thinking (screenshots, LLM calls, waiting for UI), so the demo only shows the product moving
- **Voice-over** (`agent/voiceover.js`) — spoken narration via OpenAI text-to-speech, mixed into `demo.mp4`. On by default in `llm` mode when `OPENAI_API_KEY` is set; `--voice` / `--no-voice` to force. Model and voice configurable via `RUNSIGHT_TTS_MODEL` / `RUNSIGHT_TTS_VOICE`
- **Background music** — `--music <file>` mixes a track under the demo (looped, ducked under narration, faded out)
- **Demo story planning** — in `llm` mode the model now acts as a demo director: it keeps a plan of story beats across steps, chooses realistic values to type, writes a spoken narration line per action, and ends the demo when the story is told. In `heuristic` mode ranking is story-aware: forms are filled field by field then submitted, pages already shown are not revisited, and logout/delete/external/legal links are avoided; the run stops when only those are left
- **Realistic demo data** — forms are filled with a consistent persona (name, email, password, company…) matched on field name/label/placeholder instead of `Test User`. A `## Demo data` (or `## Credentials`) section in `.runsight` supplies real values, e.g. a demo account for login flows
- New CLI flags / API options: `--voice`, `--music`

### Changed
- `agent/explorer.js` now understands each page before acting (understand → rank → click best → navigate → repeat)
- `agent/recorder.js` returns the raw WebM; the demo editor owns the single high-quality encode pass
- Hardened blank-screen detection (settle + re-check) and added recovery from browser error pages (e.g. a server that stops responding mid-run)
- `report.json` version is now `1.2.0`
- Recording is now crisp Full HD: a 1280×720 layout rendered at 1.5× device scale (was 720p), encoded at higher quality (CRF 18)
- Captions start when the cursor sets off rather than after the action lands, and are corrected for the recorder's timing drift (Playwright video runs slow while the page animates)
- After an LLM auth/quota error (401/403/429) the run switches to heuristic exploration instead of retrying on every step
- `package.json` now declares an explicit `files` field so only the runtime-needed directories are published

### Fixed
- Text inputs with no `type` attribute could never be filled (selector used `[type="text"]`, which does not match them)
- Form fields without a placeholder were collapsed into a single element during discovery, so only the first was filled; fields are now also labelled from their `<label>`
- `/`, `/index.html` and `/page.html` vs `/page` were treated as different pages, causing the home link to be "explored" again

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
