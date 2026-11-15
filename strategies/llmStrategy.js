'use strict';

const { DEFAULT_MODEL } = require('../config/models');

const SYSTEM_PROMPT = `You are a UI testing agent. You are exploring a web application autonomously.
Given a screenshot of the current page and a list of interactable elements, choose the BEST next action to explore the application thoroughly.

Rules:
- Prefer unexplored navigation links and primary actions
- Avoid repeating actions from the history
- Fill forms with realistic test data before submitting
- Prioritize discovering new pages/features over re-clicking known elements

Respond with ONLY valid JSON: { "elementIndex": <number>, "reason": "<brief explanation>" }`;

const ANALYZE_SYSTEM_PROMPT = `You are directing and presenting a short product demo video of a web application.
You are given a screenshot of the current page and a numbered list of its interactable elements
(buttons, links, inputs). Decide the next on-camera action.

Tell a coherent story, like a founder demoing their product:
- Open by showing what the product is, then walk through its core flow end to end, and finish on a
  satisfying result (something created, submitted, or revealed).
- When a form is part of the story, fill its fields one at a time, then submit it. Never submit an
  empty or half-filled form.
- Do not revisit pages already shown. Avoid logout, delete, legal/footer and external links.
- You have a limited number of steps. Spend them on the product's core value.

For EVERY element, infer what it does and where it likely leads if activated, and rank them by how
well they advance the demo.

Respond with ONLY valid JSON of this exact shape:
{
  "pageSummary": "<one sentence describing what this page is and its purpose>",
  "plan": ["<3-6 short beats outlining the whole demo story, updated as you learn the app>"],
  "elements": [
    { "index": <number>, "label": "<short human label>", "predictedDestination": "<where/what activating it leads to>", "priority": <0-100>, "isPrimary": <true|false> }
  ],
  "recommendedIndex": <number>,
  "recommendedReason": "<why this is the best next step for the demo>",
  "inputValue": "<if the recommended element is a text field: the realistic value to type, otherwise empty string>",
  "demoCaption": "<short on-screen caption for the action we are about to take, e.g. 'Opening the dashboard'>",
  "narration": "<one natural spoken sentence, max 18 words, that a presenter would say during this action: what we are doing and why it matters>",
  "done": <true only if the demo story is complete and nothing valuable is left to show>
}`;

/** Set when the provider rejects our credentials or quota; skips further calls this run. */
let llmUnavailable = false;

/**
 * Validate LLM configuration. Throws if API key is missing.
 * @param {string} provider - 'openai' or 'anthropic'
 */
function validateLLMConfig(provider) {
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required when using --llm-provider=openai');
  }
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required when using --llm-provider=anthropic');
  }
}

/** Resolve a usable model id for a provider, falling back to a sensible default. */
function modelFor(provider, model) {
  return model || DEFAULT_MODEL[provider] || (provider === 'anthropic' ? 'claude-3-5-haiku-20241022' : 'gpt-4o-mini');
}

/**
 * Analyze a page: understand every element, predict where each leads, rank them,
 * summarize the page, and recommend the best next action for a demo.
 *
 * This is the richer, demo-oriented call. It returns structured data the explorer
 * uses to drive a happy-path story and to caption the recording.
 *
 * @param {Buffer} screenshotBuffer - PNG screenshot of the current page
 * @param {Array} elements - Interactable elements (from heuristic discovery)
 * @param {Array<string>} history - Previous action descriptions
 * @param {string} provider - 'openai' | 'anthropic'
 * @param {Object} [opts]
 * @param {string} [opts.model] - model id
 * @param {string|null} [opts.guide] - .runsight guide content
 * @param {string} [opts.url] - current page URL (context)
 * @param {number} [opts.step] - current step number
 * @param {number} [opts.maxSteps] - step budget for the whole demo
 * @param {string[]} [opts.plan] - demo story beats from earlier steps
 * @param {string} [opts.persona] - demo persona data to keep form values consistent
 * @returns {Promise<{pageSummary: string, plan: string[], elements: Array, recommendedIndex: number, recommendedReason: string, inputValue: string, demoCaption: string, narration: string, done: boolean}|null>}
 */
async function analyzePage(screenshotBuffer, elements, history, provider, opts = {}) {
  if (llmUnavailable) return null;
  const elementList = elements.map((el, i) =>
    `[${i}] ${el.tagName} "${el.text || el.name || el.href || ''}" (${el.inputType || el.type || 'clickable'})${el.inNav ? ' [nav]' : ''}`
  ).join('\n');

  let userMsg = '';
  if (opts.guide) {
    userMsg += `PROJECT GUIDE (authoritative navigation instructions — follow these):\n${opts.guide}\n\n`;
  }
  if (opts.url) userMsg += `Current URL: ${opts.url}\n\n`;
  if (opts.step && opts.maxSteps) userMsg += `This is step ${opts.step} of at most ${opts.maxSteps}.\n\n`;
  if (opts.plan && opts.plan.length) userMsg += `DEMO PLAN so far (follow it, adapt if the app differs):\n- ${opts.plan.join('\n- ')}\n\n`;
  if (opts.persona) userMsg += `Demo persona for form fields (use these unless the guide provides data): ${opts.persona}\n\n`;
  userMsg += `Interactable elements on this page:\n${elementList}\n\n`;
  userMsg += `Actions already taken:\n${history.join('\n') || 'None yet'}\n\n`;
  userMsg += `Analyze the page and recommend the single best next action to advance the demo.`;

  const b64 = screenshotBuffer.toString('base64');
  const model = modelFor(provider, opts.model);

  try {
    const raw = provider === 'anthropic'
      ? await callAnthropic(b64, userMsg, ANALYZE_SYSTEM_PROMPT, model, 1500)
      : await callOpenAI(b64, userMsg, ANALYZE_SYSTEM_PROMPT, model, 1500);
    return parseAnalysis(raw, elements.length);
  } catch (err) {
    console.error(`  ⚠️  LLM analyze error (${provider}/${model}): ${err.message}`);
    // Bad key / no credits / rate limit (already retried by the SDK) will not
    // fix itself mid-run — stop asking instead of stalling every step.
    if ([401, 403, 429].includes(err.status)) {
      llmUnavailable = true;
      console.error('  ⚠️  LLM unavailable — continuing this run with heuristic exploration');
    }
    return null;
  }
}

/**
 * Ask an LLM to decide the next exploration action (lightweight, legacy call).
 * @param {Buffer} screenshotBuffer - PNG screenshot
 * @param {Array} elements - Available interactable elements
 * @param {Array<string>} history - Previous action descriptions
 * @param {string} provider - 'openai' or 'anthropic'
 * @param {string|null} [guide] - .runsight guide content
 * @param {string} [model] - model id
 * @returns {Promise<{elementIndex: number, reason: string}|null>}
 */
async function getNextAction(screenshotBuffer, elements, history, provider, guide, model) {
  const elementList = elements.map((el, i) =>
    `[${i}] ${el.tagName} "${el.text || el.name || el.href || ''}" (${el.inputType || el.type || 'clickable'})`
  ).join('\n');

  let userMsg = '';
  if (guide) {
    userMsg += `PROJECT GUIDE (follow these instructions for navigation):\n${guide}\n\n`;
  }
  userMsg += `Current page elements:\n${elementList}\n\nPrevious actions:\n${history.join('\n') || 'None yet'}\n\nWhich element should I interact with next?`;
  const b64 = screenshotBuffer.toString('base64');
  const m = modelFor(provider, model);

  try {
    const raw = provider === 'anthropic'
      ? await callAnthropic(b64, userMsg, SYSTEM_PROMPT, m, 200)
      : await callOpenAI(b64, userMsg, SYSTEM_PROMPT, m, 200);
    return parseResponse(raw);
  } catch (err) {
    console.error(`  ⚠️  LLM error (${provider}/${m}): ${err.message}`);
    return null;
  }
}

/**
 * Single OpenAI vision chat call. Returns the raw text content.
 * @returns {Promise<string>}
 */
async function callOpenAI(b64Image, userMsg, systemPrompt, model, maxTokens) {
  const OpenAI = require('openai');
  const client = new OpenAI();

  const resp = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64Image}` } },
          { type: 'text', text: userMsg }
        ]
      }
    ]
  });

  return resp.choices[0].message.content;
}

/**
 * Single Anthropic vision message call. Returns the raw text content.
 * @returns {Promise<string>}
 */
async function callAnthropic(b64Image, userMsg, systemPrompt, model, maxTokens) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.default();

  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64Image } },
        { type: 'text', text: userMsg }
      ]
    }]
  });

  const text = resp.content.find(c => c.type === 'text');
  return text ? text.text : '';
}

/** Parse the lightweight next-action JSON response. */
function parseResponse(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.elementIndex !== 'number') return null;
    return { elementIndex: parsed.elementIndex, reason: parsed.reason || '' };
  } catch {
    return null;
  }
}

/**
 * Parse and sanitize the richer page-analysis JSON response.
 * @param {string} text
 * @param {number} elementCount - number of elements (for bounds clamping)
 */
function parseAnalysis(text, elementCount) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    const els = Array.isArray(parsed.elements) ? parsed.elements : [];
    const clean = els
      .filter(e => typeof e.index === 'number' && e.index >= 0 && e.index < elementCount)
      .map(e => ({
        index: e.index,
        label: String(e.label || '').slice(0, 120),
        predictedDestination: String(e.predictedDestination || '').slice(0, 200),
        priority: Math.max(0, Math.min(100, Number(e.priority) || 0)),
        isPrimary: Boolean(e.isPrimary)
      }))
      .sort((a, b) => b.priority - a.priority);

    let recommendedIndex = Number(parsed.recommendedIndex);
    if (Number.isNaN(recommendedIndex) || recommendedIndex < 0 || recommendedIndex >= elementCount) {
      recommendedIndex = clean.length ? clean[0].index : -1;
    }

    return {
      pageSummary: String(parsed.pageSummary || '').slice(0, 300),
      elements: clean,
      recommendedIndex,
      recommendedReason: String(parsed.recommendedReason || '').slice(0, 300),
      demoCaption: String(parsed.demoCaption || '').slice(0, 120),
      narration: String(parsed.narration || '').slice(0, 240),
      inputValue: String(parsed.inputValue || '').slice(0, 200),
      plan: Array.isArray(parsed.plan) ? parsed.plan.map(b => String(b).slice(0, 160)).slice(0, 8) : [],
      done: parsed.done === true
    };
  } catch {
    return null;
  }
}

module.exports = { getNextAction, analyzePage, validateLLMConfig };
