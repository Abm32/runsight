# RunSight

> 🚀 **v1.1.0** — Production Ready

Autonomous agent that runs projects, explores them via browser, captures screenshots, and records demo videos — automatically.

Designed as a pluggable **agent skill** for Kiro CLI, Claude, and Cursor.

## Features

- Auto-detect project type (Node.js, Python, static)
- Install dependencies and start dev servers
- Launch browser and autonomously explore the UI
- 3-tier exploration: heuristic → priority-based → LLM-guided
- Capture full-page screenshots at each step
- Record session video via Playwright
- Output structured logs (`logs.txt`) and reports (`report.json`)

## Requirements

- Node.js 18+
- Playwright (auto-installed with `npm install`)

## Installation

```bash
npm install -g runsight
```

Or use directly:

```bash
npx runsight ./my-project
```

## Quick Start

```bash
# Explore a project with defaults (headless, video, 15 steps)
runsight ./my-project

# Skip video, limit to 10 steps
runsight ./my-project --no-video --max-steps=10

# Show browser window
runsight ./my-project --no-headless

# Use LLM-guided exploration (requires API key)
OPENAI_API_KEY=sk-... runsight ./my-project --llm-provider=openai
ANTHROPIC_API_KEY=sk-... runsight ./my-project --llm-provider=anthropic
```

## Programmatic API

```js
const { runSight } = require('runsight');

const result = await runSight({
  projectPath: './my-project',
  headless: true,
  video: true,
  maxSteps: 15,
  llmProvider: null // 'openai' | 'anthropic'
});

console.log(result.screenshots); // ['outputs/screenshots/step-1-initial.png', ...]
console.log(result.video);       // 'outputs/videos/session.mp4'
console.log(result.report);      // 'outputs/report.json'
console.log(result.summary);     // 'Clicked Login → navigated to /dashboard → ...'
```

## Agent Skill Integration

RunSight is designed to be invoked by AI agents:

**Kiro CLI / Claude:**
```bash
# Agent runs this command, parses JSON report
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
| `--llm-provider <p>` | | LLM provider: `openai` or `anthropic` |

## Output

After running, outputs are saved to `<projectPath>/outputs/`:

```
outputs/
  screenshots/
    step-1-initial.png
    step-2-step.png
    ...
  videos/
    session.webm
    session.mp4      (if FFmpeg available)
  logs.txt           (human-readable)
  report.json        (machine-readable)
```

### report.json Schema

```json
{
  "version": "0.1.0",
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

## Limitations (v0.1.0)

- Single-page apps with client-side routing may not be fully explored
- LLM-guided mode requires API keys and incurs costs
- Video recording adds ~2-3s overhead
- No authentication flow support (login forms get dummy data)
- Port detection relies on stdout patterns — custom servers may need manual URL

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Changelog](docs/CHANGELOG.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](docs/CONTRIBUTING.md)

## License

MIT
