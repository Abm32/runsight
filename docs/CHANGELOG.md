# Changelog

All notable changes to RunSight will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
