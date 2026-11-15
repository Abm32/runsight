---
name: runsight
description: Record a polished demo video of a web project (cursor, zoom, cuts, captions) with RunSight. Use when the user asks for a demo video, product walkthrough, screen recording of their app, or wants to see what their web app does.
---

# RunSight — record a demo of a web project

RunSight starts the project's dev server, drives a recorded browser through the app and edits the result into
`outputs/videos/demo.mp4` (plus `outputs/flow.md`, `outputs/report.json`, screenshots). You are the director —
no API key is needed.

## If the `runsight` MCP tools are available (preferred)

1. `start_demo` with the absolute `projectPath`. It returns a screenshot and a numbered list of interactable elements.
2. Call `act` once per step: `index` of the element, `value` for text fields, a short `caption`, and a
   one-sentence `narration` (what a presenter would say). Each call returns the next page.
3. Call `finish_demo` when the story is told. It returns the paths of the video and report.

Direct it like a founder demoing their product:
- Read the project's README / routes first so you know the core flow.
- Open on what the product is, walk the core flow end to end, end on a satisfying result (something created or submitted).
- Fill a form field by field, then submit it. Never submit a half-filled form.
- Don't revisit pages. Skip logout, delete, legal/footer and external links.
- 6–12 actions is usually right. If an action fails, the next observation says why — pick something else.

To set the server up: `claude mcp add runsight -- npx -y runsight mcp` (other clients: command `npx`, args `["-y", "runsight", "mcp"]`).

## Without MCP (shell only)

1. Read the project, then write a `.runsight` file in its root: `## Pages`, `## Important flows` (numbered, exact
   button text in quotes), `## Skip these`, `## Demo data` (`- email: …`, `- password: …` for login forms).
2. Run `npx -y runsight <projectPath> --mode=heuristic` (add `--max-steps=10`; `--no-video` for a quick dry run).
3. Read `<projectPath>/outputs/report.json` and `outputs/flow.md`; if the flow went wrong, refine `.runsight` and rerun.

## Report back

Give the user the path to `demo.mp4` and a one-line summary of what the demo shows. Mention errors from `report.json`.
