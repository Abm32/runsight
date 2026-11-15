'use strict';

/** Actions that derail a demo: destructive, exits, or legal boilerplate. */
const AVOID_TEXT = /log\s?out|sign\s?out|delete|remove|unsubscribe|deactivate/i;
const BORING_TEXT = /privacy|terms|cookie|legal|licen[cs]e|sitemap/i;

/**
 * Score and sort elements by how well they advance a demo story.
 * @param {Array} elements - From findInteractableElements()
 * @param {Object} [pageInfo] - Optional page metadata
 * @param {number} [pageInfo.viewportHeight=720]
 * @param {string} [pageInfo.url] - current page URL (to resolve relative links)
 * @param {(url: string) => boolean} [pageInfo.isVisited] - whether a URL was already shown
 * @param {string} [pageInfo.lastAction] - description of the previous action
 * @returns {Array} Elements sorted by score descending, with `score` property added
 */
function prioritizeElements(elements, pageInfo = {}) {
  const viewportH = pageInfo.viewportHeight || 720;
  const isField = (el) => el.tagName === 'input' || el.tagName === 'textarea' || el.tagName === 'select';
  const fieldsLeft = elements.some(isField);
  // Mid-form: the previous action filled a field, so keep going until it's submitted.
  const inForm = /^(Filled|Selected)/.test(pageInfo.lastAction || '');

  for (const el of elements) {
    let score = 0;

    // Nav links get highest priority
    if (el.inNav && el.tagName === 'a') score += 30;

    // Primary action buttons
    if (isPrimaryButton(el)) score += 25;

    // Form inputs
    if (el.tagName === 'input' || el.tagName === 'textarea') score += 20;

    // Regular links
    if (el.tagName === 'a' && !el.inNav) score += 15;

    // Secondary buttons
    if (el.tagName === 'button' && !isPrimaryButton(el)) score += 10;

    // Select dropdowns
    if (el.tagName === 'select') score += 10;

    // Above the fold bonus
    if (el.boundingBox && el.boundingBox.y < viewportH) score += 10;

    // Meaningful text bonus
    if (el.text && el.text.length > 2) score += 5;

    // Story: finish a form once started — fields first, then the submit button.
    // Never submit while fields are still empty.
    if (inForm && isField(el)) score += 40;
    if (isPrimaryButton(el)) score += fieldsLeft ? -30 : (inForm ? 50 : 0);

    // Story: don't walk back to pages already shown, leave the app, or hit
    // destructive / boilerplate actions.
    if (el.href) {
      if (/^(mailto:|tel:|javascript:|#)/i.test(el.href)) score -= 40;
      const target = resolveUrl(el.href, pageInfo.url);
      if (target && pageInfo.url && target.host !== new URL(pageInfo.url).host) score -= 50;
      else if (target && pageInfo.isVisited && pageInfo.isVisited(target.href)) score -= 50;
    }
    if (AVOID_TEXT.test(el.text || '')) score -= 80;
    if (BORING_TEXT.test(el.text || '')) score -= 40;

    el.score = score;
  }

  return elements.sort((a, b) => b.score - a.score);
}

function resolveUrl(href, base) {
  try { return new URL(href, base); } catch { return null; }
}

function isPrimaryButton(el) {
  if (el.tagName !== 'button' && el.type !== 'submit') return false;
  const cls = (el.classes || '').toLowerCase();
  const txt = (el.text || '').toLowerCase();
  return el.type === 'submit'
    || cls.includes('primary') || cls.includes('btn-primary') || cls.includes('cta')
    || /^(login|sign\s?in|sign\s?up|submit|register|continue|get started)$/i.test(txt);
}

/**
 * Create a tracker to avoid revisiting URLs and re-clicking elements.
 * @returns {Object}
 */
function createVisitTracker() {
  const visitedUrls = new Set();
  const clickedKeys = new Set();

  return {
    hasVisited(url) { return visitedUrls.has(normalizeUrl(url)); },
    markVisited(url) { visitedUrls.add(normalizeUrl(url)); },
    hasClicked(key) { return clickedKeys.has(key); },
    markClicked(key) { clickedKeys.add(key); },
    /** Generate a unique key for an element */
    elementKey(el) {
      return `${el.tagName}|${el.text || ''}|${el.href || ''}|${el.name || ''}`;
    },
    getStats() {
      return { visitedUrls: visitedUrls.size, clickedElements: clickedKeys.size };
    }
  };
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // /index.html, /about.html and /about/ are the same pages as /, /about.
    const pathname = u.pathname.replace(/(^|\/)index\.html?$/, '$1').replace(/\.html?$/, '').replace(/(.)\/$/, '$1');
    return (pathname || '/') + u.search;
  } catch {
    return url;
  }
}

module.exports = { prioritizeElements, createVisitTracker };
