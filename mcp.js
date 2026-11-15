'use strict';

/**
 * RunSight as an MCP server (stdio).
 *
 * Lets any MCP client — Claude Code, Claude Desktop, Cursor, Codex, … — record
 * a demo. Two ways:
 *  - `record_demo`: RunSight drives itself (heuristics, or an LLM if configured).
 *  - `start_demo` → `act` … → `finish_demo`: the connected agent is the director.
 *    It sees each page and picks every action, so no API key is needed — the
 *    model the user is already talking to does the thinking.
 *
 * ponytail: hand-rolled JSON-RPC over newline-delimited stdio (tools only)
 * instead of the MCP SDK dependency — switch to the SDK if resources, prompts
 * or HTTP transport are ever needed.
 */

const path = require('path');
const readline = require('readline');
const { version } = require('./package.json');

const DIRECTING = 'Direct it like a founder demoing their product: show what it is, walk the core flow end to end ' +
  '(fill a form field by field, then submit), end on a satisfying result. Skip logout, delete, legal and external links.';

const TOOLS = [
  {
    name: 'record_demo',
    description: 'Record a demo video of a web project fully automatically: RunSight starts the app, explores it, ' +
      'and edits demo.mp4 (cursor, zoom, cuts, captions). Use start_demo instead when you want to choose the actions yourself. ' +
      'Can take a few minutes.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Absolute path to the project directory' },
        maxSteps: { type: 'number', description: 'Maximum actions (default 15)' },
        video: { type: 'boolean', description: 'Record video (default true). false = screenshots + report only' },
        mode: { type: 'string', enum: ['heuristic', 'llm'], description: 'heuristic = free/offline; llm = uses the API key in the server environment' },
        model: { type: 'string', description: 'Model id for llm mode' },
        baseUrl: { type: 'string', description: 'OpenAI-compatible endpoint for a self-hosted model (needs model)' }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'start_demo',
    description: 'Start an agent-directed demo recording: RunSight starts the app and a recorded browser, then returns ' +
      'a screenshot and the numbered interactable elements of the first page. You then call `act` for each step and ' +
      '`finish_demo` at the end. ' + DIRECTING + ' May take a minute or more while dependencies install and the server starts.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Absolute path to the project directory' },
        maxSteps: { type: 'number', description: 'Maximum actions (default 15)' },
        video: { type: 'boolean', description: 'Record video (default true)' },
        voice: { type: 'boolean', description: 'Speak your narration lines (needs OPENAI_API_KEY in the server environment)' }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'act',
    description: 'Perform one on-camera action in the running demo and get the resulting page back. ' +
      'Clicks links/buttons, types `value` into fields, picks options in selects.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Element index from the latest observation' },
        value: { type: 'string', description: 'Text to type when the element is a field (omit to use realistic demo data)' },
        caption: { type: 'string', description: 'Short on-screen caption, e.g. "Creating a new project"' },
        narration: { type: 'string', description: 'One spoken sentence (max ~18 words) a presenter would say during this action' }
      },
      required: ['index']
    }
  },
  {
    name: 'finish_demo',
    description: 'End the running demo: adds the outro, edits the video, and returns the output file paths.',
    inputSchema: { type: 'object', properties: {} }
  }
];

/** The one demo in progress (a recording owns a browser and a dev server). */
let session = null;

/**
 * Start a directed run and bridge RunSight's `decide` callback to tool calls:
 * each tool call waits for the next observation (or the final outcome).
 * @param {Object} options - runSight options
 * @param {Function} run - runSight (injectable for the self-check)
 * @returns {Promise<{obs?: Object, result?: Object, error?: string}>} first observation or outcome
 */
function startSession(options, run) {
  const s = { obs: null, answer: null, deliver: () => {} };
  s.next = () => new Promise((resolve) => { s.deliver = resolve; });
  const decide = (obs) => new Promise((resolve) => {
    s.obs = obs;
    s.answer = resolve;
    s.deliver({ obs });
  });
  const settle = (outcome) => {
    if (session === s) session = null;
    s.deliver(outcome);
  };
  session = s;
  const first = s.next();
  Promise.resolve()
    .then(() => run({ ...options, decide }))
    .then((result) => settle({ result }), (err) => settle({ error: err.message }));
  return first;
}

/** Turn an observation / outcome into MCP tool-result content. */
function render(out) {
  if (out.error) return { content: [{ type: 'text', text: `Demo failed: ${out.error}` }], isError: true };
  if (out.result) {
    const r = out.result;
    const lines = ['Demo finished.'];
    if (r.video) lines.push(`Video: ${r.video}`);
    if (r.flow) lines.push(`Walkthrough: ${r.flow}`);
    if (r.report) lines.push(`Report: ${r.report}`);
    if (r.screenshots && r.screenshots.length) lines.push(`Screenshots: ${r.screenshots.length} in ${path.dirname(r.screenshots[0])}`);
    if (r.summary) lines.push(`Summary: ${r.summary}`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
  const o = out.obs;
  const lines = [`Step ${o.step} of at most ${o.maxSteps} — ${o.url}`];
  if (o.lastError) lines.push(`Previous action failed: ${o.lastError}`);
  if (o.step === 1 && o.guide) lines.push(`Project guide:\n${String(o.guide).slice(0, 2000)}`);
  if (o.history.length) lines.push(`Done so far: ${o.history.join(' → ')}`);
  lines.push('Interactable elements (the screenshot shows the viewport; elements may be below the fold):');
  for (const el of o.elements) {
    lines.push(`[${el.index}] ${el.tag}${el.type ? `(${el.type})` : ''} "${el.label}"${el.href ? ` → ${el.href}` : ''}${el.used ? ' (already used)' : ''}`);
  }
  if (o.suggestedIndex >= 0) lines.push(`Heuristic suggestion: [${o.suggestedIndex}]`);
  lines.push('Next: call `act` with an index (add `value` for fields, plus a `caption` and one-sentence `narration`), or `finish_demo` when the story is told.');
  const content = [{ type: 'text', text: lines.join('\n') }];
  if (o.screenshot) content.unshift({ type: 'image', data: o.screenshot.toString('base64'), mimeType: 'image/jpeg' });
  return { content };
}

const fail = (text) => ({ content: [{ type: 'text', text }], isError: true });

/**
 * Execute one tool call.
 * @param {string} name
 * @param {Object} args
 * @param {Function} [run] - runSight (injectable for the self-check)
 * @returns {Promise<{content: Array, isError?: boolean}>}
 */
async function callTool(name, args = {}, run = require('./index').runSight) {
  if (name === 'record_demo' || name === 'start_demo') {
    if (session) return fail('A demo is already in progress — call finish_demo first.');
    if (typeof args.projectPath !== 'string' || !args.projectPath) return fail('projectPath is required.');
    const common = { projectPath: args.projectPath, maxSteps: args.maxSteps, video: args.video };
    if (name === 'start_demo') return render(await startSession({ ...common, voice: args.voice }, run));
    try {
      return render({ result: await run({ ...common, mode: args.mode, model: args.model, baseUrl: args.baseUrl }) });
    } catch (err) {
      return render({ error: err.message });
    }
  }
  if (name === 'act' || name === 'finish_demo') {
    const s = session;
    if (!s || !s.answer) return fail('No demo in progress — call start_demo first.');
    let decision = { done: true };
    if (name === 'act') {
      if (!Number.isInteger(args.index) || args.index < 0 || args.index >= s.obs.elements.length) {
        return fail(`index must be an element index from the latest observation (0–${s.obs.elements.length - 1}).`);
      }
      decision = { index: args.index, value: args.value, caption: args.caption, narration: args.narration };
    }
    const answer = s.answer;
    s.answer = null; // one decision per observation
    const next = s.next();
    answer(decision);
    return render(await next);
  }
  return fail(`Unknown tool: ${name}`);
}

/**
 * Handle one JSON-RPC message.
 * @param {Object} msg
 * @returns {Promise<Object|null>} response, or null for notifications
 */
async function handle(msg) {
  if (msg.id === undefined || msg.id === null) return null; // notification
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  switch (msg.method) {
    case 'initialize':
      return reply({
        protocolVersion: (msg.params && msg.params.protocolVersion) || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'runsight', version }
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call':
      return reply(await callTool(msg.params && msg.params.name, (msg.params && msg.params.arguments) || {}));
    default:
      return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
  }
}

/**
 * Serve MCP over stdio until stdin closes.
 * @returns {void}
 */
function serve() {
  // stdout carries the protocol — route RunSight's progress output to stderr.
  console.log = console.error;
  const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    try {
      const res = await handle(msg);
      if (res) send(res);
    } catch (err) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: err.message } });
    }
  });
  rl.on('close', () => process.exit(0));
}

module.exports = { serve, handle, callTool };

// Self-check: `node mcp.js`
if (require.main === module) {
  const assert = require('assert');
  (async () => {
    const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
    assert.strictEqual(init.result.protocolVersion, '2024-11-05');
    assert.strictEqual(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
    assert.strictEqual((await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).result.tools.length, 4);
    assert.ok((await handle({ jsonrpc: '2.0', id: 3, method: 'nope' })).error);
    assert.ok((await callTool('act', { index: 0 })).isError, 'act without a session');

    // A fake run that asks for two decisions, then finishes.
    const seen = [];
    const obs = (step) => ({ step, maxSteps: 5, url: 'http://x/', history: [], elements: [{ index: 0, tag: 'a', label: 'Home', type: '', href: '/' }], suggestedIndex: 0 });
    const fakeRun = async ({ decide }) => {
      for (let step = 1; ; step++) {
        const d = await decide(obs(step));
        seen.push(d);
        if (d.done) return { video: '/out/demo.mp4', summary: 'ok' };
      }
    };
    const first = await callTool('start_demo', { projectPath: '/p' }, fakeRun);
    assert.ok(/Step 1 of/.test(first.content[0].text));
    assert.ok((await callTool('start_demo', { projectPath: '/p' }, fakeRun)).isError, 'second session refused');
    assert.ok((await callTool('act', { index: 7 })).isError, 'out-of-range index');
    const second = await callTool('act', { index: 0, caption: 'Go home' });
    assert.ok(/Step 2 of/.test(second.content[0].text));
    const done = await callTool('finish_demo');
    assert.ok(/demo\.mp4/.test(done.content[0].text));
    assert.deepStrictEqual(seen.map(d => d.done ? 'done' : d.index), [0, 'done']);
    assert.ok((await callTool('finish_demo')).isError, 'session cleared');

    const failing = await callTool('start_demo', { projectPath: '/p' }, async () => { throw new Error('boom'); });
    assert.ok(failing.isError && /boom/.test(failing.content[0].text));
    console.log('mcp self-check passed');
  })().catch((err) => { console.error(err); process.exit(1); });
}
