# Architecture

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
| Explorer | `agent/explorer.js` | Drive browser with 3-tier strategy |
| Screenshotter | `agent/screenshotter.js` | Full-page PNG capture with step naming. Blank screen detection via text content check. |
| Recorder | `agent/recorder.js` | Playwright recordVideo context wrapper. Auto-converts to mp4 if FFmpeg available. |
| Logger | `utils/logger.js` | Dual output: logs.txt + report.json. Tracks steps, errors, screenshots. |
| Port Detector | `utils/portDetector.js` | Parse ports from stdout via regex, TCP poll with timeout. Zero external deps. |
| Heuristic | `strategies/heuristicStrategy.js` | DOM-order element discovery (links, buttons, inputs, selects). Filters by visibility/size. Executes with dummy data. |
| Priority | `strategies/priorityStrategy.js` | Score elements by semantic importance (nav +30, primary btn +25, input +20, etc). Visit tracker prevents repeats. |
| LLM | `strategies/llmStrategy.js` | Vision LLM-guided action selection |

## Data Flow

1. **Detect** → Scan project directory for markers (`package.json`, `requirements.txt`, `index.html`)
2. **Run** → Install dependencies, start dev servers, detect ports
3. **Explore** → Launch browser, navigate to frontend URL, execute 3-tier exploration loop
4. **Capture** → Screenshot at each step, record video for full session
5. **Report** → Save `logs.txt` (human) + `report.json` (machine) + screenshots + video

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
