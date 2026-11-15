'use strict';

const fs = require('fs');
const { prioritizeElements } = require('../strategies/priorityStrategy');
const { analyzePage } = require('../strategies/llmStrategy');
const { PERSONA } = require('../strategies/heuristicStrategy');

/**
 * Heuristic destination guess from an element's attributes — used when there is
 * no LLM, so the demo narration still has something meaningful to say.
 * When a project guide/context is available (hand-written `.runsight` or
 * auto-generated from package.json + detected routes), matching route
 * descriptions are used to make the guess more specific.
 * @param {Object} el
 * @param {string|null} [guide] - `.runsight` guide or auto-generated project context
 * @returns {string}
 */
function guessDestination(el, guide) {
  if (el.href) {
    if (/^https?:\/\//i.test(el.href) && !el.href.includes('localhost')) return 'an external site';
    const hrefPath = el.href.replace(/^https?:\/\/[^/]+/i, '') || '/';
    const known = describeRouteFromGuide(hrefPath, guide);
    return known ? `the ${hrefPath} page — ${known}` : `the ${hrefPath} page`;
  }
  const txt = (el.text || el.name || '').toLowerCase();
  if (/log\s?out|sign\s?out/.test(txt)) return 'sign-out';
  if (/log\s?in|sign\s?in/.test(txt)) return 'the login flow';
  if (/sign\s?up|register|get started/.test(txt)) return 'the sign-up flow';
  if (/submit|save|continue|next/.test(txt)) return 'the next step in this flow';
  if (el.tagName === 'input' || el.tagName === 'textarea') return 'a filled form field';
  if (el.tagName === 'select') return 'a selected option';
  // Fall back to matching the button's own text against a route name in the guide
  // (e.g. a "Dashboard" button when the guide lists a "/dashboard" page).
  const known = describeRouteFromGuide(txt, guide);
  if (known) return known;
  return 'an in-page action or state change';
}

/**
 * Look up a route path (or button text) against lines like
 * "- /dashboard — Main app view" in a `.runsight` guide or auto-generated
 * project context, and return the trailing description if found.
 * @param {string} needle - a URL path or lowercase button text
 * @param {string|null} guide
 * @returns {string|null}
 */
function describeRouteFromGuide(needle, guide) {
  if (!guide || !needle) return null;
  const clean = needle.replace(/^\//, '').toLowerCase();
  if (!clean) return null;
  const lines = guide.split('\n');
  for (const line of lines) {
    const m = line.match(/^[-*]\s*\/?([\w-]+)[^\w-]*[—\-:]\s*(.+)$/);
    if (m && m[1].toLowerCase() === clean) return m[2].trim().slice(0, 140);
  }
  return null;
}

/**
 * Build a short page summary. Prefers the project's own description
 * (from package.json / README, via the guide/context text) so the demo
 * narration reflects what the app actually is instead of just its URL.
 * @param {string} url
 * @param {string|null} guide
 * @returns {string}
 */
function summarizePage(url, guide) {
  const path = safePath(url);
  const desc = extractProjectDescription(guide);
  if (desc) return `${path === '/' ? 'Home page' : `Page at ${path}`} — ${desc}`;
  return `Page at ${path}`;
}

/** Pull the "## What this project is" line out of an auto-generated context block. */
function extractProjectDescription(guide) {
  if (!guide) return null;
  const m = guide.match(/## What this project is\s*\n([^\n]+)/);
  return m ? m[1].trim().slice(0, 160) : null;
}

/**
 * Build a short human label for an element.
 * @param {Object} el
 */
function labelFor(el) {
  return (el.text || el.name || el.href || el.tagName || 'element').toString().slice(0, 80);
}

const OPENERS = ['Next,', 'Now', 'Then', 'From here,'];

/**
 * Build a caption and a spoken line for an action without an LLM.
 * @param {Object} el - element about to be activated
 * @param {number} step - step number (varies the sentence opener)
 * @returns {{caption: string, narration: string}}
 */
function describeAction(el, step) {
  const label = labelFor(el).replace(/\s+/g, ' ');
  const opener = OPENERS[step % OPENERS.length];
  if (el.tagName === 'input' || el.tagName === 'textarea') {
    const field = (el.text || el.name || 'the field').replace(/[_-]+/g, ' ').toLowerCase();
    return { caption: `Entering ${field}`, narration: `${opener} we fill in the ${field}.` };
  }
  if (el.tagName === 'select') {
    return { caption: 'Choosing an option', narration: `${opener} we pick an option from the list.` };
  }
  if (el.href) {
    return { caption: `Opening ${label}`, narration: `${opener} we open ${label}.` };
  }
  return { caption: `Clicking "${label}"`, narration: `${opener} we click ${label}.` };
}

/**
 * Analyze the current page and return a ranked, understood view of its elements
 * plus the recommended next action and a caption — regardless of mode.
 *
 * In LLM mode this reads each button via the model and predicts destinations.
 * In heuristic mode it uses priority scoring and attribute-based destination guesses.
 *
 * @param {import('playwright').Page} page
 * @param {Array} elements - fresh (unclicked) interactable elements
 * @param {Object} ctx
 * @param {'llm'|'heuristic'} ctx.mode
 * @param {string|null} ctx.llmProvider
 * @param {string|null} ctx.model
 * @param {string|null} ctx.guide
 * @param {Array<string>} ctx.history
 * @param {string} ctx.screenshotPath - path to the current step screenshot (for LLM vision)
 * @param {number} [ctx.step] - current step number
 * @param {number} [ctx.maxSteps] - step budget
 * @param {string[]} [ctx.plan] - demo story beats from earlier steps (LLM mode)
 * @param {(url: string) => boolean} [ctx.isVisited] - whether a URL was already shown
 * @returns {Promise<{
 *   pageSummary: string,
 *   ranked: Array<{ element: Object, label: string, predictedDestination: string, priority: number, isPrimary: boolean }>,
 *   recommended: Object|null,
 *   recommendedReason: string,
 *   caption: string,
 *   narration: string,
 *   inputValue: string,
 *   plan: string[],
 *   done: boolean,
 *   source: 'llm'|'heuristic'
 * }>}
 */
async function analyzeCurrentPage(page, elements, ctx) {
  // Always compute the heuristic baseline — it's the fallback and the floor.
  const viewport = page.viewportSize();
  const history = ctx.history || [];
  const scored = prioritizeElements([...elements], {
    viewportHeight: viewport ? viewport.height : 720,
    url: page.url(),
    isVisited: ctx.isVisited,
    lastAction: history[history.length - 1]
  });
  const heuristicRanked = scored.map(el => ({
    element: el,
    label: labelFor(el),
    predictedDestination: guessDestination(el, ctx.guide),
    priority: el.score,
    isPrimary: false
  }));

  // Try LLM analysis when in LLM mode and a screenshot is available.
  if (ctx.mode === 'llm' && ctx.llmProvider && ctx.screenshotPath) {
    try {
      const buf = fs.readFileSync(ctx.screenshotPath);
      const analysis = await analyzePage(buf, elements, ctx.history || [], ctx.llmProvider, {
        model: ctx.model,
        guide: ctx.guide,
        url: page.url(),
        step: ctx.step,
        maxSteps: ctx.maxSteps,
        plan: ctx.plan,
        persona: `${PERSONA.name}, ${PERSONA.email}, password ${PERSONA.password}, company ${PERSONA.company}`
      });

      if (analysis && analysis.elements.length) {
        const ranked = analysis.elements.map(a => ({
          element: elements[a.index],
          label: a.label || labelFor(elements[a.index]),
          predictedDestination: a.predictedDestination || guessDestination(elements[a.index], ctx.guide),
          priority: a.priority,
          isPrimary: a.isPrimary
        })).filter(r => r.element);

        const recEl = analysis.recommendedIndex >= 0 ? elements[analysis.recommendedIndex] : (ranked[0] && ranked[0].element);
        const caption = analysis.demoCaption
          || (recEl ? `Clicking "${labelFor(recEl)}"` : 'Exploring the page');

        return {
          pageSummary: analysis.pageSummary || summarizePage(page.url(), ctx.guide),
          ranked: ranked.length ? ranked : heuristicRanked,
          recommended: recEl || (heuristicRanked[0] && heuristicRanked[0].element) || null,
          recommendedReason: analysis.recommendedReason || 'LLM recommendation',
          caption,
          narration: analysis.narration || caption,
          inputValue: analysis.inputValue,
          plan: analysis.plan,
          done: analysis.done,
          source: 'llm'
        };
      }
    } catch (err) {
      console.error(`  ⚠️  Page analysis fell back to heuristic: ${err.message}`);
    }
  }

  // Heuristic mode (or LLM fallback).
  const top = heuristicRanked[0] || null;
  const said = top ? describeAction(top.element, ctx.step || 0) : { caption: 'Exploring the page', narration: '' };
  return {
    pageSummary: summarizePage(page.url(), ctx.guide),
    ranked: heuristicRanked,
    recommended: top ? top.element : null,
    recommendedReason: top ? `Priority score: ${top.priority}` : 'No elements',
    caption: said.caption,
    narration: said.narration,
    inputValue: '',
    plan: [],
    // Only derailing actions are left (already-seen pages, external or legal links).
    done: !top || top.priority <= 0,
    source: 'heuristic'
  };
}

function safePath(url) {
  try { return new URL(url).pathname; } catch { return url; }
}

module.exports = { analyzeCurrentPage, guessDestination, labelFor, describeAction };
