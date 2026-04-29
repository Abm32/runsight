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
  video: 'outputs/videos/session.webm',
  report: 'outputs/report.json',
  summary: 'Clicked Login → navigated to /dashboard → ...'
}
```

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
