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
  mode: 'llm',                // 'llm' | 'heuristic' (prompts if omitted & interactive)
  llmProvider: 'openai',      // 'openai' | 'anthropic'
  model: 'gpt-4o-mini',       // model id (prompts if omitted in llm mode)
  coverage: 'happy',          // 'happy' (demo story) | 'full' (crawl)
  voice: true,                // spoken narration (OpenAI TTS)
  music: './track.mp3'        // optional background music
});
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectPath` | `string` | `'.'` | Path to the project directory |
| `headless` | `boolean` | `true` | Run browser in headless mode |
| `video` | `boolean` | `true` | Record session video |
| `maxSteps` | `number` | `15` | Maximum exploration steps |
| `mode` | `'llm'\|'heuristic'\|null` | `null` | Exploration mode. If null and interactive, prompts the user. Non-interactive defaults to `heuristic`. |
| `llmProvider` | `string\|null` | `null` | LLM provider: `'openai'` or `'anthropic'` (implies `mode: 'llm'`) |
| `model` | `string\|null` | `null` | Model id for llm mode (e.g. `gpt-4o`, `gpt-4o-mini`, `claude-sonnet-4-20250514`). Prompts if omitted. |
| `coverage` | `'happy'\|'full'` | `'happy'` | `happy` = focused demo story; `full` = breadth-first crawl |
| `voice` | `boolean` | on in `llm` mode when `OPENAI_API_KEY` is set | Spoken narration via OpenAI text-to-speech. Needs `OPENAI_API_KEY`; skipped with a log line if unavailable |
| `music` | `string\|null` | `null` | Path to a background music file mixed under the demo |

> **API keys:** In `llm` mode, the provider's key is read from the environment
> (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`). If absent and running interactively,
> RunSight prompts for it with masked input and holds it in memory only — it is
> never written to disk, logs, or the report. Interactively, mode/model selection
> happens through a single unified list (every LLM model plus a "Heuristic"
> entry); the key prompt only appears after an LLM model is chosen.
>
> **Project understanding:** when no `.runsight` guide file exists, RunSight
> auto-generates a lightweight project context from `package.json`
> (description, keywords) and detected pages/routes (`agent/contextBuilder.js`).
> This feeds both the LLM prompt and the heuristic destination-guessing logic,
> so demo captions are meaningful without any setup.

#### Return Value

```js
{
  screenshots: ['outputs/screenshots/step-1-initial.png', ...],
  video: 'outputs/videos/demo.mp4',     // edited demo (or session.webm, or null if --no-video)
  flow: 'outputs/flow.md',              // human-readable narrative (or null)
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

### `executeAction(page, element, opts)` — `strategies/heuristicStrategy.js`
Performs an action. `opts.value` overrides the demo-persona value, `opts.typeDelay` types key by key, `opts.guide` supplies `## Demo data`.

### `installCursor(context)`, `pointAt(page, locator)`, `showCard(page, card, ms)` — `agent/director.js`
On-camera presentation helpers: visible cursor, glide to a target, title cards.

### `DemoEditor#edit(inputPath, timeline, logger)` — `agent/demoEditor.js`
Edits the raw recording. `timeline`: `{ captions, zooms, cuts, stills, voice, music, durationMs }` (a bare captions array is still accepted).

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
| `--mode <m>` | `llm` (best, needs key) or `heuristic` (free). Prompts if omitted. |
| `--llm-provider <p>` | LLM provider: `openai` or `anthropic` (implies `--mode=llm`) |
| `--model <id>` | Model id (e.g. `gpt-4o-mini`). Prompts if omitted in llm mode. |
| `--coverage <c>` | `happy` (demo story, default) or `full` (crawl every page) |
| `--voice` / `--no-voice` | Spoken narration (OpenAI TTS). Default: on in llm mode when `OPENAI_API_KEY` is set |
| `--music <file>` | Background music mixed under the demo |
