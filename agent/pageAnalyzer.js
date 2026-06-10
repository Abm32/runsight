'use strict';

const fs = require('fs');
const { prioritizeElements } = require('../strategies/priorityStrategy');
const { analyzePage } = require('../strategies/llmStrategy');

/**
 * Heuristic destination guess from an element's attributes — used when there is
 * no LLM, so the demo narration still has something meaningful to say.
 * @param {Object} el
 * @returns {string}
 */
function guessDestination(el) {
  if (el.href) {
    if (/^https?:\/\//i.test(el.href) && !el.href.includes('localhost')) return 'an external site';
    const path = el.href.replace(/^https?:\/\/[^/]+/i, '') || '/';
    return `the ${path} page`;
  }
  const txt = (el.text || el.name || '').toLowerCase();
  if (/log\s?out|sign\s?out/.test(txt)) return 'sign-out';
  if (/log\s?in|sign\s?in/.test(txt)) return 'the login flow';
  if (/sign\s?up|register|get started/.test(txt)) return 'the sign-up flow';
  if (/submit|save|continue|next/.test(txt)) return 'the next step in this flow';
  if (el.tagName === 'input' || el.tagName === 'textarea') return 'a filled form field';
  if (el.tagName === 'select') return 'a selected option';
  return 'an in-page action or state change';
}

/**
 * Build a short human label for an element.
 * @param {Object} el
 */
function labelFor(el) {
  return (el.text || el.name || el.href || el.tagName || 'element').toString().slice(0, 80);
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
 * @returns {Promise<{
 *   pageSummary: string,
 *   ranked: Array<{ element: Object, label: string, predictedDestination: string, priority: number, isPrimary: boolean }>,
 *   recommended: Object|null,
 *   recommendedReason: string,
 *   caption: string,
 *   source: 'llm'|'heuristic'
 * }>}
 */
async function analyzeCurrentPage(page, elements, ctx) {
  // Always compute the heuristic baseline — it's the fallback and the floor.
  const scored = prioritizeElements([...elements], { viewportHeight: 720 });
  const heuristicRanked = scored.map(el => ({
    element: el,
    label: labelFor(el),
    predictedDestination: guessDestination(el),
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
        url: page.url()
      });

      if (analysis && analysis.elements.length) {
        const ranked = analysis.elements.map(a => ({
          element: elements[a.index],
          label: a.label || labelFor(elements[a.index]),
          predictedDestination: a.predictedDestination || guessDestination(elements[a.index]),
          priority: a.priority,
          isPrimary: a.isPrimary
        })).filter(r => r.element);

        const recEl = analysis.recommendedIndex >= 0 ? elements[analysis.recommendedIndex] : (ranked[0] && ranked[0].element);
        const caption = analysis.demoCaption
          || (recEl ? `Clicking "${labelFor(recEl)}"` : 'Exploring the page');

        return {
          pageSummary: analysis.pageSummary || 'Current page',
          ranked: ranked.length ? ranked : heuristicRanked,
          recommended: recEl || (heuristicRanked[0] && heuristicRanked[0].element) || null,
          recommendedReason: analysis.recommendedReason || 'LLM recommendation',
          caption,
          source: 'llm'
        };
      }
    } catch (err) {
      console.error(`  ⚠️  Page analysis fell back to heuristic: ${err.message}`);
    }
  }

  // Heuristic mode (or LLM fallback).
  const top = heuristicRanked[0] || null;
  return {
    pageSummary: `Page at ${safePath(page.url())}`,
    ranked: heuristicRanked,
    recommended: top ? top.element : null,
    recommendedReason: top ? `Priority score: ${top.priority}` : 'No elements',
    caption: top ? `Clicking "${top.label}"` : 'Exploring the page',
    source: 'heuristic'
  };
}

function safePath(url) {
  try { return new URL(url).pathname; } catch { return url; }
}

module.exports = { analyzeCurrentPage, guessDestination, labelFor };
