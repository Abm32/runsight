'use strict';

/**
 * Score and sort elements by exploration priority.
 * @param {Array} elements - From findInteractableElements()
 * @param {Object} [pageInfo] - Optional page metadata
 * @param {number} [pageInfo.viewportHeight=720]
 * @returns {Array} Elements sorted by score descending, with `score` property added
 */
function prioritizeElements(elements, pageInfo = {}) {
  const viewportH = pageInfo.viewportHeight || 720;

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

    el.score = score;
  }

  return elements.sort((a, b) => b.score - a.score);
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
