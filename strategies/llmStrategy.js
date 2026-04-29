'use strict';

const SYSTEM_PROMPT = `You are a UI testing agent. You are exploring a web application autonomously.
Given a screenshot of the current page and a list of interactable elements, choose the BEST next action to explore the application thoroughly.

Rules:
- Prefer unexplored navigation links and primary actions
- Avoid repeating actions from the history
- Fill forms with realistic test data before submitting
- Prioritize discovering new pages/features over re-clicking known elements

Respond with ONLY valid JSON: { "elementIndex": <number>, "reason": "<brief explanation>" }`;

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

/**
 * Ask an LLM to decide the next exploration action.
 * @param {Buffer} screenshotBuffer - PNG screenshot
 * @param {Array} elements - Available interactable elements
 * @param {Array<string>} history - Previous action descriptions
 * @param {string} provider - 'openai' or 'anthropic'
 * @returns {Promise<{elementIndex: number, reason: string}|null>}
 */
async function getNextAction(screenshotBuffer, elements, history, provider) {
  const elementList = elements.map((el, i) =>
    `[${i}] ${el.tagName} "${el.text || el.name || el.href || ''}" (${el.inputType || el.type || 'clickable'})`
  ).join('\n');

  const userMsg = `Current page elements:\n${elementList}\n\nPrevious actions:\n${history.join('\n') || 'None yet'}\n\nWhich element should I interact with next?`;
  const b64 = screenshotBuffer.toString('base64');

  try {
    if (provider === 'openai') return await askOpenAI(b64, userMsg);
    if (provider === 'anthropic') return await askAnthropic(b64, userMsg);
    return null;
  } catch (err) {
    console.error(`  ⚠️  LLM error (${provider}): ${err.message}`);
    return null;
  }
}

async function askOpenAI(b64Image, userMsg) {
  const OpenAI = require('openai');
  const client = new OpenAI();

  const resp = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 200,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64Image}` } },
          { type: 'text', text: userMsg }
        ]
      }
    ]
  });

  return parseResponse(resp.choices[0].message.content);
}

async function askAnthropic(b64Image, userMsg) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.default();

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64Image } },
        { type: 'text', text: userMsg }
      ]
    }]
  });

  const text = resp.content.find(c => c.type === 'text');
  return parseResponse(text ? text.text : '');
}

function parseResponse(text) {
  try {
    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.elementIndex !== 'number') return null;
    return { elementIndex: parsed.elementIndex, reason: parsed.reason || '' };
  } catch {
    return null;
  }
}

module.exports = { getNextAction, validateLLMConfig };
