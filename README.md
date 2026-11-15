# RunSight

> **Your project demos itself.**

[![npm version](https://img.shields.io/npm/v/runsight.svg)](https://www.npmjs.com/package/runsight)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The fastest path from code to proof. One command — your app is explored, recorded, and ready to share.

```bash
npx runsight ./my-project
```

RunSight runs your project, launches a browser, navigates the UI autonomously using AI vision, captures screenshots at every step, records a session video, and outputs a structured report. No config. No test scripts. No manual clicking.

**Stop explaining your app. Let it show itself.**

## Vision

RunSight is evolving from a browser automation tool into the **default way to generate demos for software**.

Today: one command turns any repo into screenshots, video, and a structured report.

Tomorrow: one command turns any repo into a **shareable demo link** — ready for portfolios, recruiters, investors, Product Hunt, or teammates.

The goal: **every `git push` auto-generates a living demo of your project.**

## What It Does

| You used to... | Now you... |
|----------------|------------|
| Manually click through your app after every change | Run one command |
| Record your screen to show someone your project | Get an auto-generated video |
| Write a paragraph explaining what your app does | Send a report.json |
| Spend 20 min making a demo for a job application | Wait 8 seconds |

## How It Works

```
npx runsight ./my-project

🔍 Detecting project type...
✅ Found: Node.js (Next.js)
📦 Installing dependencies...
🚀 Server started on :3000
🌐 Browser launched
🤖 Exploring UI (15 steps)...
📸 15 screenshots captured
🎬 demo.mp4 recorded
📊 report.json written
✅ Done in 8.1s
```

1. **Detect** — identifies your project type and framework automatically, and auto-generates a lightweight understanding of your app (description, pages/routes) from `package.json` and file structure
2. **Run** — installs dependencies, starts the dev server, detects the port
3. **Explore** — AI navigates your UI using a 3-tier strategy (heuristic → priority → LLM vision), informed by that project understanding
4. **Capture** — screenshots every step, records the session on camera: visible cursor, typed input, paced actions, intro and outro cards
5. **Edit** — cuts the agent's thinking time, zooms in on each action, adds captions, optional voice-over and music
6. **Report** — outputs machine-readable `report.json` + human-readable `logs.txt`, with `demo.mp4` and `flow.md` as the shareable highlights

## Quick Start

```bash
# Install into your project (or run without installing via npx)
npm install runsight

# Interactive: pick a model (or "Heuristic" for free/offline), paste an API
# key only if you picked a model, then RunSight explores + records a demo
npx runsight ./my-project

# Free, offline, no API key — rule-based exploration
runsight ./my-project --mode=heuristic

# LLM-guided with a cheap vision model (reads each button, predicts where it leads)
runsight ./my-project --llm-provider=openai --model=gpt-4o-mini

# Crawl every reachable page instead of the focused demo story
runsight ./my-project --coverage=full

# Narrated demo with background music (voice-over needs OPENAI_API_KEY)
runsight ./my-project --voice --music ./track.mp3

# Skip video, limit to 10 steps; show the browser window
runsight ./my-project --no-video --max-steps=10 --no-headless
```

RunSight understands your project automatically — no setup required. It reads
`package.json` and detects your pages/routes to generate demo captions that
actually make sense, even before you write a `.runsight` guide (see below).

In interactive runs, you choose a model from one list (or "Heuristic" to skip
LLM calls entirely); if you pick a model, RunSight then asks for the matching
API key (masked input, held in memory only — never written to disk, logs, or
the report). Set `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` in your environment to
skip that prompt. Non-interactive runs (CI, agents) skip prompting entirely:
they use an available env key automatically, or fall back to heuristic mode.

## Programmatic API

```js
const { runSight } = require('runsight');

const result = await runSight({
  projectPath: './my-project',
  headless: true,
  video: true,
  maxSteps: 15,
  mode: 'llm',           // 'llm' | 'heuristic' (prompts if omitted)
  llmProvider: 'openai', // 'openai' | 'anthropic'
  model: 'gpt-4o-mini',  // model id (prompts if omitted in llm mode)
  coverage: 'happy',     // 'happy' (demo story) | 'full' (crawl)
  voice: true,           // spoken narration (needs OPENAI_API_KEY)
  music: './track.mp3'   // optional background music
});

console.log(result.screenshots); // ['outputs/screenshots/step-1-initial.png', ...]
console.log(result.video);       // 'outputs/videos/demo.mp4'
console.log(result.report);      // 'outputs/report.json'
console.log(result.summary);     // 'Clicked Login → navigated to /dashboard → ...'
```

## Agent Skill Integration

RunSight is designed to be invoked by AI agents — your coding assistant runs it, reads the report, and understands your app without you explaining anything.

**Kiro CLI / Claude:**
```bash
runsight /path/to/project --no-video --max-steps=5
cat /path/to/project/outputs/report.json
```

**Programmatic (Cursor, custom agents):**
```js
const { runSight } = require('runsight');
const result = await runSight({ projectPath: '/path/to/project', maxSteps: 5 });
// Agent reads result.summary and result.report for context
```

## CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `[projectPath]` | `.` | Path to the project directory |
| `--headless` | `true` | Run browser in headless mode |
| `--no-headless` | | Show browser window |
| `--video` | `true` | Record session video |
| `--no-video` | | Disable video recording |
| `--max-steps <n>` | `15` | Maximum exploration steps |
| `--mode <m>` | _(prompts)_ | `llm` (best understanding, needs API key) or `heuristic` (free, offline) |
| `--llm-provider <p>` | | LLM provider: `openai` or `anthropic` (implies `--mode=llm`) |
| `--model <id>` | _(prompts)_ | Model id, e.g. `gpt-4o`, `gpt-4o-mini`, `claude-sonnet-4-20250514` |
| `--coverage <c>` | `happy` | `happy` = focused demo story; `full` = crawl every page |
| `--voice` / `--no-voice` | on in llm mode with `OPENAI_API_KEY` | Spoken narration via OpenAI text-to-speech (narration text is sent to OpenAI) |
| `--music <file>` | | Background music mixed under the demo |

## Output

After running, outputs are saved to `<projectPath>/outputs/`:

```
outputs/
  screenshots/
    step-1-initial.png
    step-2-step.png
    ...
  videos/
    session.webm     (raw recording)
    demo.mp4         (edited 1080p demo: cuts, zoom, captions, voice-over — if FFmpeg available)
  flow.md            (human-readable walkthrough)
  logs.txt           (human-readable)
  report.json        (machine-readable)
```

### report.json Schema

```json
{
  "version": "1.2.0",
  "projectPath": "/path/to/project",
  "startTime": "2026-04-29T06:50:14.957Z",
  "endTime": "2026-04-29T06:50:23.042Z",
  "totalDuration": 8085,
  "steps": [
    {
      "step": 1,
      "action": "Clicked a \"Home\"",
      "detail": "Priority score: 45 → navigated to /",
      "timestamp": "2026-04-29T06:50:16.123Z",
      "screenshot": "outputs/screenshots/step-1-initial.png"
    }
  ],
  "errors": [],
  "summary": "Clicked Home → Clicked About → ..."
}
```

## Supported Project Types

| Type | Detection | Framework Support |
|------|-----------|-------------------|
| Node.js | `package.json` | Next.js, Vite, CRA, Express, Nuxt |
| Python | `requirements.txt`, `pyproject.toml` | Django, Flask, FastAPI |
| Static | `index.html` | Plain HTML/CSS/JS |

## `.runsight` Guide File (optional)

RunSight auto-detects your pages and reads `package.json` to understand your
project without any setup. Add a `.runsight` file only when you want to give
more precise instructions than auto-detection can infer — for example, exact
button text for a login flow, or keyboard controls for a game. When present,
it takes priority; the auto-detected context is still included as background.

```markdown
# Navigation Guide

## Pages
- Home page loads at /
- Click "BOOT SEQUENCE" to start the game
- Click "♫ MUSIC" to toggle audio
- Game over screen shows "REBOOT NEXUS" button

## Important flows
1. Click "BOOT SEQUENCE" → game starts → player runs automatically
2. Wait for game over → click "REBOOT NEXUS" to restart

## Skip these
- Volume slider (range input) — not useful for exploration
- Canvas element — game renders here, no clicks needed

## Demo data
- email: demo@yourapp.com
- password: a-demo-account-password
```

Forms are filled with a realistic demo persona by default. Values under `## Demo data` (matched against each field's name, label or placeholder) take priority — use a throwaway demo account to get past a login screen.

The agent reads this file and includes it in every LLM decision, so it knows which buttons matter and what order to click them.

Supported filenames: `.runsight`, `.runsight.md`, `RUNSIGHT.md`

### Generating the guide with AI

Paste this prompt into your AI tool (Kiro CLI, Claude, Cursor, ChatGPT) while in your project:

```
Analyze this project and create a .runsight file for the RunSight autonomous browser agent. Read the source code and README, then generate a guide with these sections: ## Pages (list every route), ## Important flows (numbered user flows with exact button text in quotes — if the app is a game or interactive experience that requires keyboard input like arrow keys, space, WASD etc., include those key presses as explicit steps in the flow, e.g. "after clicking Start, immediately press ArrowUp and ArrowDown to play"), ## Keyboard actions (if the app uses keyboard input, list every key: - Press ArrowUp — description), ## Skip these (elements to ignore). Use exact UI text in quotes. Save as .runsight in the project root.
```

See [docs/GUIDE_TEMPLATE.md](docs/GUIDE_TEMPLATE.md) for the full prompt and examples.

## Where This Is Going

RunSight is not a testing tool. It's the fastest path from code to proof.

| Phase | What changes |
|-------|-------------|
| **Now (v1.2.0)** | One command → directed, auto-edited demo video (cursor, zoom, cuts, captions, voice-over), flow summary, screenshots, report |
| **Soon (v2.0.0)** | `runsight.dev/demo/abc123` — shareable demo links |
| **Future (v3.0.0)** | `git push` → demo auto-generated in CI |

See the full [Roadmap](docs/ROADMAP.md).

## Requirements

- Node.js 18+
- Playwright (auto-installed with `npm install`)

## Limitations (v1.2.0)

- Single-page apps with client-side routing may not be fully explored
- LLM-guided mode requires API keys and incurs costs (use a cheap model like `gpt-4o-mini` to keep it low)
- Demo video editing requires FFmpeg — bundled with install; falls back to the raw WebM recording if unavailable
- Login needs credentials you provide (`## Demo data` in `.runsight`); sign-up forms are filled with a demo persona
- Voice-over requires an OpenAI key; without one the demo has captions only. No music is bundled — pass your own with `--music`
- Port detection relies on stdout patterns — custom servers may need manual URL

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [CI/CD Pipeline](docs/CICD.md)
- [Changelog](docs/CHANGELOG.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](docs/CONTRIBUTING.md)

## License

MIT
