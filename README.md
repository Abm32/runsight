# RunSight

> 🚧 **Under Development** — v0.1.0 pre-release

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

## Quick Start

```bash
npm install -g runsight
runsight ./my-project
```

Or use programmatically:

```js
const { runSight } = require('runsight');
const result = await runSight({ projectPath: './my-project' });
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Changelog](docs/CHANGELOG.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](docs/CONTRIBUTING.md)

## License

MIT
