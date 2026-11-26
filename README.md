# RunSight

> **Your project demos itself.**

[![npm version](https://img.shields.io/npm/v/runsight.svg)](https://www.npmjs.com/package/runsight)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

One command runs your web app, explores it in a real browser, and hands you an edited demo video — cursor, zoom, captions — plus screenshots and a report.

```bash
npx runsight ./my-project
```

![RunSight exploring a sample app and producing an edited demo video](docs/demo.gif)

*Made by RunSight itself: `npx runsight ./tasklane --mode=heuristic` on a small sample app. No API key, no script, no manual editing — about a minute from command to this 34-second video ([full-quality MP4](https://github.com/Abm32/runsight/releases/download/v1.3.2/demo.mp4)).*

**Works free, no API key.** Three ways to run it:

| | Cost | How |
|---|---|---|
| **Heuristic mode** | Free, offline | `npx runsight ./my-project --mode=heuristic` |
| **Your AI agent directs it** (Claude Code, Cursor, Codex — MCP) | No extra key: uses the agent you already have | `claude mcp add runsight -- npx -y runsight mcp` |
| **Your own model** (Ollama, LM Studio, OpenRouter, or an OpenAI / Anthropic key) | Whatever your model costs | `--base-url=… --model=…` |

Heuristic mode follows navigation and forms by rule; an agent or a vision model understands the app and tells a better story.

## How It's Different

| Instead of… | You would… | With RunSight |
|---|---|---|
| A screen recorder (Loom, OBS) | Click through the app yourself, then edit the recording | Nobody clicks; the video comes out already cut, zoomed and captioned |
| A Playwright script with `recordVideo` | Write and maintain a script per app, and get a raw, unedited recording | No script — it finds the pages, forms and buttons itself |
| A browser agent (browser-use and similar) | Give an LLM a task and get the task done — not a video | The output *is* the deliverable: `demo.mp4`, a written walkthrough, screenshots and `report.json`. An LLM is optional |

RunSight is built on Playwright; it is the part that decides what to show and turns the session into something you can share.

## What It Does

| You used to... | Now you... |
|----------------|------------|
| Manually click through your app after every change | Run one command |
| Record your screen to show someone your project | Get an auto-generated, edited video |
| Write a paragraph explaining what your app does | Send `flow.md` or `report.json` |
| Spend an evening making a demo for a launch or job application | Wait about a minute |

## How It Works

```
$ npx runsight ./tasklane --mode=heuristic

🔍 RunSight v1.3.3
  ℹ️  Found: tasklane (static)
  ℹ️  tasklane ready at http://localhost:3000
  ℹ️  Starting exploration...
  [step-1] Clicked a "Tasks" → navigated to /tasks
  [step-2] Clicked a "Pricing" → navigated to /pricing
  [step-3] Clicked a "Sign up" → navigated to /signup
  [step-4] Filled text input "name" with "Alex Morgan"
  ...
  [step-7] Clicked button "Create account"
  ℹ️  Editing demo video (cuts, zoom, captions)...

  ✅ Your demo is ready
  🎬 Video       outputs/videos/demo.mp4
  📝 Walkthrough outputs/flow.md
  📸 Screenshots 7 captured
  📊 Report      outputs/report.json
```

(Output trimmed. This run took 56 seconds; with `--no-video` it takes under 10.)

1. **Detect** — identifies your project type and framework automatically, and auto-generates a lightweight understanding of your app (description, pages/routes) from `package.json` and file structure
2. **Run** — installs dependencies, starts the dev server, detects the port
3. **Explore** — navigates your UI on its own: rule-based ranking in heuristic mode, or a vision model / your AI agent reading each page, informed by that project understanding
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

# Your own model — any OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter, Groq, vLLM…)
runsight ./my-project --base-url=http://localhost:11434/v1 --model=llava

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

// Bring your own brain: decide each action yourself (any model, any logic, no API key)
await runSight({
  projectPath: './my-project',
  decide: async ({ url, elements, screenshot, history, suggestedIndex }) => {
    // elements: [{ index, tag, label, type, href, used }], screenshot: JPEG Buffer
    if (history.length >= 6) return { done: true };
    return { index: suggestedIndex, caption: 'Next step', narration: 'Here is the next step.' };
  }
});

console.log(result.screenshots); // ['outputs/screenshots/step-1-initial.png', ...]
console.log(result.video);       // 'outputs/videos/demo.mp4'
console.log(result.report);      // 'outputs/report.json'
console.log(result.summary);     // 'Clicked Login → navigated to /dashboard → ...'
```

## Use Any Model

RunSight is not tied to one provider. Pick whichever fits:

| You have… | Use |
|-----------|-----|
| Nothing (free, offline) | `--mode=heuristic` |
| An OpenAI or Anthropic key | `--llm-provider=openai\|anthropic --model=<any model id>` |
| A local or self-hosted model (Ollama, LM Studio, vLLM, llama.cpp) | `--base-url=http://localhost:11434/v1 --model=<id>` — no key needed |
| Another hosted provider with an OpenAI-compatible API (OpenRouter, Groq, Together, Gemini…) | `--base-url=<their endpoint> --model=<id>` with `OPENAI_API_KEY=<their key>` |
| Claude Code, Cursor, Codex or any MCP client | `runsight mcp` — the agent you are already talking to directs the demo, no key |
| Your own code | `runSight({ decide })` — a callback picks each action |

The model must accept image input (RunSight sends page screenshots). With `--base-url`, requests — including
whatever is in `OPENAI_API_KEY` — go to that endpoint instead of OpenAI, and voice-over is off unless you pass `--voice`.

## Use From Claude, Cursor, Codex (MCP)

`runsight mcp` runs RunSight as an MCP server over stdio. The connected agent sees each page (screenshot +
numbered elements), chooses every action, and writes the captions and narration — its model is the brain,
so no API key is involved.

```bash
# Claude Code
claude mcp add runsight -- npx -y runsight mcp
```

```jsonc
// Cursor (.cursor/mcp.json), Claude Desktop (claude_desktop_config.json), and most other clients
{ "mcpServers": { "runsight": { "command": "npx", "args": ["-y", "runsight", "mcp"] } } }
```

```toml
# Codex (~/.codex/config.toml)
[mcp_servers.runsight]
command = "npx"
args = ["-y", "runsight", "mcp"]
```

Then ask: *"Record a demo of this project with runsight."*

| Tool | What it does |
|------|--------------|
| `start_demo` | Starts the app and a recorded browser; returns the first page |
| `act` | Performs one action (`index`, optional `value`, `caption`, `narration`); returns the next page |
| `finish_demo` | Adds the outro, edits the video, returns output paths |
| `record_demo` | Fully automatic run (heuristic, or an LLM configured in the server's environment) |

**As a Claude skill:** copy `skills/runsight/` from this package into `~/.claude/skills/` (or your project's
`.claude/skills/`). It teaches Claude when and how to record a demo, with or without the MCP server.

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
| `--base-url <url>` | | OpenAI-compatible endpoint for your own model (needs `--model`) |
| `mcp` | | `runsight mcp` — run as an MCP server (stdio) |
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
    session.mkv      (raw recording, real-time)
    demo.mp4         (edited 1080p 50 fps demo: cuts, zoom, captions, voice-over — if FFmpeg available)
  flow.md            (human-readable walkthrough)
  logs.txt           (human-readable)
  report.json        (machine-readable)
```

### report.json Schema

```json
{
  "version": "1.3.3",
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

| Status | What |
|-------|-------------|
| **Works today (v1.3.3)** | Any model or your AI agent (MCP) → directed, auto-edited demo video (cursor, zoom, cuts, captions, voice-over), flow summary, screenshots, report — all written to local files |
| **Planned, not built (v2.0.0)** | Shareable hosted demo links |
| **Planned, not built (v3.0.0)** | `git push` → demo generated automatically in CI |

Nothing in the planned rows exists yet; today you run the command yourself and share the files. The long-term goal is that every project has a living demo that updates itself. See the full [Roadmap](docs/ROADMAP.md).

## Requirements

- Node.js 18+
- Playwright (auto-installed with `npm install`)

## Limitations (v1.3.3)

- Single-page apps with client-side routing may not be fully explored
- Heuristic mode is rule-based: it follows navigation and forms but can miss an app's core feature — direct it with an agent (MCP), a model, or a `.runsight` guide for a better story
- Hosted OpenAI / Anthropic models need an API key and cost money (a cheap model like `gpt-4o-mini` keeps it low); heuristic, MCP and local-model runs do not
- Demo video editing requires FFmpeg — bundled with install; falls back to a raw, unedited WebM recording if unavailable
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

## Not To Be Confused With

This is `runsight` on **npm** ([Abm32/runsight](https://github.com/Abm32/runsight)) — the demo video generator. The Python package of the same name on PyPI (`runsight-ai/runsight`, a YAML workflow engine for AI agents) is a separate, unrelated project.

## License

MIT
