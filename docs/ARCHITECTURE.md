# Architecture

## Vision

RunSight is the **fastest path from code to proof**. It's evolving from a browser automation tool into the default way to generate demos for software.

The architecture is designed to support three phases:
1. **v1.x** — Local agent: detect → run → explore → capture → report
2. **v2.x** — Shareable output: local agent + hosted demo links (`runsight.dev`)
3. **v3.x** — Workflow integration: CI triggers → auto-generated demos on every push

## Overview

RunSight is a modular autonomous agent that detects, runs, and explores web projects.

```mermaid
graph TD
    CLI["cli.js (yargs)"] --> API["index.js (runSight API)"]
    API --> DET["agent/detector.js"]
    API --> RUN["agent/runner.js"]
    API --> EXP["agent/explorer.js"]
    API --> REC["agent/recorder.js"]
    API --> SS["agent/screenshotter.js"]
    API --> LOG["utils/logger.js"]
    API --> DIR["agent/director.js"]
    API --> NAR["agent/flowNarrator.js"]
    API --> VO["agent/voiceover.js"]
    API --> ED["agent/demoEditor.js"]
    EXP --> DIR
    DET --> CTX["agent/contextBuilder.js"]
    RUN --> PD["utils/portDetector.js"]
    EXP --> HS["strategies/heuristicStrategy.js"]
    EXP --> PS["strategies/priorityStrategy.js"]
    EXP --> LS["strategies/llmStrategy.js"]
    LS --> OAI["OpenAI GPT-4o"]
    LS --> ANT["Anthropic Claude"]
```

## Modules

| Module | Path | Responsibility |
|--------|------|----------------|
| CLI | `cli.js` | Parse arguments, invoke API |
| API | `index.js` | Orchestrate full pipeline |
| Detector | `agent/detector.js` | Identify project types (Node.js/Python/static), detect frameworks, return run commands. Supports monorepo scanning. |
| Runner | `agent/runner.js` | Install deps via spawn, start dev servers, detect ports from stdout, manage process lifecycle. Includes killAll() and identifyFrontend(). |
| Explorer | `agent/explorer.js` | 3-tier exploration loop: heuristic discovery → priority scoring → LLM guidance. Dialog handling, error capture, stop conditions, summary generation. |
| Screenshotter | `agent/screenshotter.js` | Full-page PNG capture with step naming. Blank screen detection via text content check. |
| Recorder | `agent/recorder.js` | Playwright recordVideo context wrapper. Records a 1280×720 layout at 1.5× device scale (Full HD frames); needs `Recorder.LAUNCH_ARGS` on the browser. Returns the raw WebM. |
| Director | `agent/director.js` | On-camera presentation: injected cursor overlay + click ripple, smooth scroll and cursor glide to targets (`pointAt`), intro/outro title cards (`showCard`), read/narration hold times (`holdMs`). |
| Logger | `utils/logger.js` | Dual output: logs.txt + report.json. Tracks steps, errors, screenshots. |
| Port Detector | `utils/portDetector.js` | Parse ports from stdout via regex, TCP poll with timeout. Zero external deps. |
| Heuristic | `strategies/heuristicStrategy.js` | DOM-order element discovery (links, buttons, inputs, selects). Filters by visibility/size. Executes actions; fills forms from a consistent demo persona or the guide's `## Demo data`, optionally typing key by key. |
| Priority | `strategies/priorityStrategy.js` | Score elements by semantic importance (nav +30, primary btn +25, input +20, etc) plus story rules: finish a started form before submitting, penalize already-shown pages, external, destructive and legal links. Visit tracker prevents repeats. |
| LLM | `strategies/llmStrategy.js` | Vision LLM action selection + page analysis (`analyzePage`: read every element, predict destinations, rank, summarize). OpenAI + Anthropic, configurable model, JSON parsing, graceful fallback. |
| Page Analyzer | `agent/pageAnalyzer.js` | Unifies LLM + heuristic understanding into one ranked, captioned view of a page (per-element predicted destinations, recommended next action, page summary). |
| Flow Narrator | `agent/flowNarrator.js` | Builds `flow.md` (pages visited, predicted destinations, walkthrough) and the edit timeline: captions + narration lines and zoom targets, in wall-clock time. |
| Demo Editor | `agent/demoEditor.js` | Resolves FFmpeg (bundled → system → none) and builds one filter graph: cut dead time, zoom/pan onto actions, burn captions, mix voice-over and music, encode `demo.mp4`. Maps wall-clock times to recording time (the recorder runs slow during animation). Falls back to a captions-only edit, then to the raw WebM. Self-check: `node agent/demoEditor.js`. |
| Voice-over | `agent/voiceover.js` | Synthesizes narration clips with OpenAI text-to-speech. Optional; any failure yields a silent demo. |
| Prompt | `utils/prompt.js` | Interactive mode/model selection + secure, in-memory-only API key handling (masked input, env-var-first, never persisted). |
| Models config | `config/models.js` | Configurable catalog of vision models per provider (incl. cheaper tiers + custom). |

## Data Flow

1. **Detect** → Scan project directory for markers (`package.json`, `requirements.txt`, `index.html`)
2. **Run** → Install dependencies, start dev servers, detect ports
3. **Explore** → Launch browser, navigate to frontend URL, execute 3-tier exploration loop
4. **Capture** → Screenshot at each step, record video for full session. With video on, the run is performed on camera: intro card → paced, animated actions → outro card. The explorer reports its thinking time as `cuts`
5. **Edit** → Narrate (optional voice-over), then cut dead time, zoom onto actions, caption, and mix audio into `demo.mp4`
6. **Report** → Save `logs.txt` (human) + `report.json` (machine) + screenshots + video

## Exploration Strategy Tiers

### Tier 1: Heuristic (Base)
- Finds all interactable DOM elements (links, buttons, inputs, selects)
- Filters by visibility, size, enabled state
- Executes actions in DOM order with dummy data for inputs

### Tier 2: Priority-based (Scoring)
- Scores elements by semantic importance (nav links > primary buttons > inputs > secondary)
- Tracks visited URLs and clicked elements to avoid repeats
- Above-the-fold elements get bonus score

### Tier 3: LLM-guided (Vision)
- Sends screenshot + element list to GPT-4o or Claude
- LLM decides which element to interact with next and why
- Falls back to priority tier on API failure

## Future Modules (Planned)

These modules don't exist yet but represent the architectural direction:

| Module | Phase | Responsibility |
|--------|-------|----------------|
| Screenshot Grid | v1.2.x | Composite single image from all step screenshots (deferred) |
| HTML Reporter | v1.2.x | Visual report with embedded screenshots and video player (deferred) |
| Upload Service | v2.0.0 | Push outputs to `runsight.dev`, return shareable URL |
| Demo Versioning | v2.0.0 | Compare demos across commits, track changes |
| CI Plugin | v3.0.0 | GitHub Actions / GitLab CI integration, auto-trigger on push |
| PR Bot | v3.0.0 | Auto-comment demo links on pull requests |

> Demo Editor and Flow Narrator shipped in v1.2.0 — see the Modules table above.

## Design Decisions

### Why Playwright over Puppeteer?
- Built-in video recording (`recordVideo`) — no FFmpeg dependency for basic video
- Better cross-browser support (Chromium, Firefox, WebKit)
- Auto-waiting and better stability for dynamic pages
- Active development by Microsoft

### Why 3-tier exploration instead of LLM-only?
- **Cost**: LLM calls cost money per screenshot analyzed (~$0.004/image with GPT-4o)
- **Speed**: Heuristic + priority runs in milliseconds; LLM adds 1-3s per step
- **Reliability**: LLM APIs can fail; heuristic/priority always work
- **Offline**: Works without API keys in heuristic+priority mode

### Why CommonJS over ESM?
- Maximum compatibility with existing Node.js tooling
- Simpler `require()` for agent skill integration
- No `.mjs` extension confusion

### Trade-offs

| Decision | Pro | Con |
|----------|-----|-----|
| Playwright recordVideo | No external deps, works headless | Only captures browser viewport, not system |
| Stdout port detection | Zero deps, works with any server | May miss non-standard output formats |
| DOM-based element discovery | Fast, reliable, no vision needed | Misses canvas/WebGL/iframe content |
| Priority scoring | Deterministic, predictable | May miss context-dependent important elements |
| LLM vision | Understands visual context | Slow, costly, requires API key |
| Wall-clock edit timeline | No frame-accurate sync needed from the recorder | Timing is calibrated, not exact — cuts keep a 300 ms margin |
