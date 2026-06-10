# Roadmap

> RunSight is evolving from a browser automation tool into the **default way to generate demos for software**.

## v0.1.0 — Pre-release ✅

- [x] Project scaffolding and CLI
- [x] Project type detection (Node.js, Python, static)
- [x] Dependency installation and dev server management
- [x] Port detection from stdout + TCP polling
- [x] Playwright browser automation
- [x] 3-tier exploration: heuristic → priority → LLM
- [x] Full-page screenshot capture at each step
- [x] Session video recording via Playwright recordVideo
- [x] Dual output: logs.txt + report.json
- [x] OpenAI and Anthropic LLM vision integration
- [x] CLI with --no-video, --headless, --max-steps, --llm-provider flags
- [x] Blank screen detection
- [x] Action summary generation
- [x] Optional FFmpeg webm-to-mp4 conversion

## v1.0.0 — Production Ready ✅

- [x] Stable CLI and programmatic API
- [x] Merged to main, tagged, published to npm

## v1.1.0 — Guide-Aware Agent ✅ (Current)

- [x] README.md-aware project detection
- [x] `.runsight` guide file support
- [x] Keyboard action support for games/interactive apps
- [x] EADDRINUSE auto-recovery
- [x] Graceful sub-service failure handling
- [x] Dynamic UI polling (30s wait for new elements)
- [x] Input filtering (skip range/hidden/color/file)
- [x] CI/CD pipeline (GitHub Actions → npm auto-publish)

## v1.2.0 — Demo Generator ✅ (Current)

The shift from "recording tool" to "demo generator."

- [x] LLM-guided page understanding — read each button, predict where it leads, rank, summarize
- [x] Heuristic fallback mode — free, offline, no API key
- [x] Interactive setup — choose mode/model, secure in-memory-only API key entry
- [x] Configurable model catalog with cheaper tiers + custom model entry
- [x] Coverage modes — happy-path demo story (default) + full breadth-first crawl
- [x] Auto-edited demo video with burned-in captions (`demo.mp4`)
- [x] Flow summary — human-readable narrative (`flow.md`)
- [x] Caption overlay — auto-generated text captions on video frames
- [x] Bundled FFmpeg — installs with RunSight, works out of the box
- [ ] Screenshot grid — single composite image of all steps for quick sharing (deferred)
- [ ] HTML report — visual report with embedded screenshots and video player (deferred)
- [ ] Custom action scripts (user-defined exploration steps) (deferred)

## v2.0.0 — Shareable Demo Links

The shift from "local output" to "shareable proof."

- [ ] `runsight.dev` hosted platform
- [ ] `runsight.dev/demo/abc123` — shareable demo URLs from any run
- [ ] Embeddable demo widget for READMEs and portfolios
- [ ] Demo versioning — compare demos across commits
- [ ] Team sharing — private demo links with access control
- [ ] PDF report generation

**Use cases unlocked:**
- Portfolio proof for job applications
- Investor/recruiter demo links
- Product Hunt launch assets
- PR review — "here's what this change looks like"

## v3.0.0 — Workflow Integration

The shift from "tool you run" to "part of how software ships."

- [ ] `git push` → demo auto-generated in CI (GitHub Actions, GitLab CI)
- [ ] PR comment bot — auto-posts demo link on every pull request
- [ ] Slack/Discord notifications with demo preview
- [ ] MCP server integration for agent tooling
- [ ] Plugin system for custom exploration strategies
- [ ] Docker container for isolated execution
- [ ] Parallel multi-page exploration

**The end state:** every project has a living demo that updates itself.

## Future Exploration

- [ ] Accessibility audit during exploration
- [ ] Performance metrics collection (LCP, FID, CLS)
- [ ] FFmpeg screen capture (outside-browser recording)
- [ ] Mobile viewport exploration
- [ ] Authentication flow support (OAuth, magic links)
- [ ] Multi-language project support (Ruby, Go, Rust)
