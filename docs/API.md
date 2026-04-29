# API Reference

## Programmatic API

### `runSight(options)`

Main entry point. Detects, runs, explores a project and returns results.

```js
const { runSight } = require('runsight');

const result = await runSight({
  projectPath: './my-project',
  headless: true,
  video: true,
  maxSteps: 15,
  llmProvider: null // 'openai' | 'anthropic' | null
});
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectPath` | `string` | `'.'` | Path to the project directory |
| `headless` | `boolean` | `true` | Run browser in headless mode |
| `video` | `boolean` | `true` | Record session video |
| `maxSteps` | `number` | `15` | Maximum exploration steps |
| `llmProvider` | `string\|null` | `null` | LLM provider: `'openai'` or `'anthropic'` |

#### Return Value

```js
{
  screenshots: ['outputs/screenshots/step-1-initial.png', ...],
  video: 'outputs/videos/session.mp4',  // or session.webm, or null if --no-video
  report: 'outputs/report.json',
  summary: 'Clicked Login → navigated to /dashboard → ...'
}
```

#### Errors

| Error | Cause |
|-------|-------|
| `No supported project detected` | No `package.json`, `requirements.txt`, or `index.html` found |
| `No frontend service detected` | Services started but none identified as frontend |
| `OPENAI_API_KEY environment variable is required...` | `--llm-provider=openai` used without API key |
| `ANTHROPIC_API_KEY environment variable is required...` | `--llm-provider=anthropic` used without API key |
| `Global timeout exceeded (5 min)` | Pipeline took longer than 5 minutes |

## Internal Modules

### `detectProjects(projectPath)` — `agent/detector.js`
Returns array of detected project configurations.

### `runProjects(projects, logger)` — `agent/runner.js`
Installs deps and starts dev servers. Returns running process handles.

### `killAll(running)` — `agent/runner.js`
Terminates all running server processes.

### `explore(page, options, logger, screenshotter)` — `agent/explorer.js`
Runs the 3-tier exploration loop on a Playwright page.

### `findInteractableElements(page)` — `strategies/heuristicStrategy.js`
Discovers all visible, enabled, interactable DOM elements.

### `prioritizeElements(elements)` — `strategies/priorityStrategy.js`
Scores and sorts elements by exploration priority.

### `getNextAction(screenshot, elements, history, provider)` — `strategies/llmStrategy.js`
Asks an LLM to choose the next action based on a screenshot.

## CLI

```bash
runsight [projectPath] [options]
```

| Flag | Description |
|------|-------------|
| `--no-video` | Disable video recording |
| `--headless` | Run headless (default: true) |
| `--no-headless` | Show browser window |
| `--max-steps <n>` | Max exploration steps (default: 15) |
| `--llm-provider <p>` | LLM provider: `openai` or `anthropic` |
