'use strict';

const { findInteractableElements, executeAction } = require('../strategies/heuristicStrategy');
const { createVisitTracker } = require('../strategies/priorityStrategy');
const { analyzeCurrentPage } = require('./pageAnalyzer');

/** Key name mapping for .runsight guide */
const KEY_MAP = {
  'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight',
  'space': 'Space', 'enter': 'Enter', 'escape': 'Escape', 'tab': 'Tab',
  'w': 'w', 's': 's', 'a': 'a', 'd': 'd',
  'arrowup': 'ArrowUp', 'arrowdown': 'ArrowDown', 'arrowleft': 'ArrowLeft', 'arrowright': 'ArrowRight'
};

/**
 * Parse keyboard actions from .runsight guide.
 * Looks for lines like: - Press ArrowUp to jump
 * @param {string|null} guide
 * @returns {Array<{key: string, description: string, delay: number}>}
 */
function parseKeyboardActions(guide) {
  if (!guide) return [];
  const actions = [];
  const lines = guide.split('\n');
  for (const line of lines) {
    const match = line.match(/[-*]\s*(?:Press|Key|press|key)\s+(\S+)\s*(.*)/i);
    if (match) {
      const rawKey = match[1].replace(/[`"']/g, '');
      const key = KEY_MAP[rawKey.toLowerCase()] || rawKey;
      const description = match[2].replace(/^[-—–:]\s*/, '').trim();
      actions.push({ key, description, delay: 500 });
    }
  }
  return actions;
}

/**
 * Autonomously explore a web page, understanding each page before acting.
 *
 * Per page: capture screenshot → discover elements → ANALYZE (understand each
 * button, predict destinations, rank, summarize) → pick best action → execute →
 * navigate → repeat. Records rich per-step metadata for narration and video.
 *
 * Coverage:
 *  - 'happy' (default): always take the single best action — a focused demo story.
 *  - 'full': breadth-first — exhaust each page's actions before moving on.
 *
 * @param {import('playwright').Page} page
 * @param {Object} options
 * @param {number} [options.maxSteps=15]
 * @param {'llm'|'heuristic'} [options.mode='heuristic']
 * @param {string|null} [options.llmProvider]
 * @param {string|null} [options.model]
 * @param {'happy'|'full'} [options.coverage='happy']
 * @param {string|null} [options.guide]
 * @param {import('../utils/logger').Logger} logger
 * @param {import('./screenshotter').Screenshotter} screenshotter
 * @returns {Promise<{steps: Array, summary: string, pages: Array}>}
 */
async function explore(page, options, logger, screenshotter) {
  const maxSteps = options.maxSteps || 15;
  const mode = options.mode || (options.llmProvider ? 'llm' : 'heuristic');
  const coverage = options.coverage === 'full' ? 'full' : 'happy';
  const tracker = createVisitTracker();
  const history = [];
  const steps = [];
  const pages = []; // page-level summaries for narration
  let consecutiveErrors = 0;
  const t0 = Date.now();

  page.on('dialog', async (dialog) => {
    logger.info(`Dialog dismissed: ${dialog.message().slice(0, 100)}`);
    await dialog.dismiss().catch(() => {});
  });
  page.on('pageerror', (err) => logger.error(`Page error: ${err.message}`));

  tracker.markVisited(page.url());
  let lastSummarizedUrl = null;

  for (let step = 1; step <= maxSteps; step++) {
    let chosen = null;
    try {
      let ssPath = await screenshotter.capture(page, step, step === 1 ? 'initial' : 'step');
      logger.addScreenshot(step, ssPath);

      if (await screenshotter.detectBlankScreen(page)) {
        // A page can be transiently blank during navigation. Settle and re-check
        // before deciding the demo is over, so we don't stop prematurely.
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(800);
        if (await screenshotter.detectBlankScreen(page)) {
          logger.info('Blank screen detected — stopping exploration');
          break;
        }
        // Recovered — recapture the now-populated page.
        ssPath = await screenshotter.capture(page, step, step === 1 ? 'initial' : 'step');
        logger.addScreenshot(step, ssPath);
      }

      let allElements = await findInteractableElements(page);
      let fresh = allElements.filter(el => !tracker.hasClicked(tracker.elementKey(el)));

      // No fresh elements → keyboard actions (games) then poll for dynamic UI.
      if (!fresh.length) {
        const keys = parseKeyboardActions(options.guide);
        if (keys.length) {
          logger.info('Performing keyboard actions while waiting for UI...');
          for (let round = 0; round < 3; round++) {
            for (const key of keys) {
              await page.keyboard.press(key.key);
              logger.step(step, `Pressed ${key.key}`, key.description || '');
              steps.push(makeStep(step, `Pressed ${key.key}`, key.description || '', null, t0, { kind: 'key' }));
              const curStep = step;
              step++;
              if (step > maxSteps) break;
              await page.waitForTimeout(key.delay || 500);
              const gSS = await screenshotter.capture(page, curStep, 'gameplay');
              logger.addScreenshot(curStep, gSS);
              if (steps.length) steps[steps.length - 1].screenshot = gSS;
            }
            allElements = await findInteractableElements(page);
            fresh = allElements.filter(el => !tracker.hasClicked(tracker.elementKey(el)));
            if (fresh.length || step > maxSteps) break;
            await page.waitForTimeout(1000);
          }
        }

        if (!fresh.length && step <= maxSteps) {
          logger.info('Waiting for new UI elements...');
          for (let wait = 0; wait < 15; wait++) {
            await page.waitForTimeout(2000);
            allElements = await findInteractableElements(page);
            fresh = allElements.filter(el => !tracker.hasClicked(tracker.elementKey(el)));
            if (fresh.length) { logger.info(`New elements found after ${(wait + 1) * 2}s`); break; }
          }
        }

        if (!fresh.length) { logger.info('No new elements — stopping'); break; }
      }

      if (!allElements.length) { logger.info('No interactable elements found — stopping'); break; }

      // UNDERSTAND THE PAGE: read every element, predict destinations, rank, summarize.
      const analysis = await analyzeCurrentPage(page, fresh, {
        mode, llmProvider: options.llmProvider || null, model: options.model || null,
        guide: options.guide || null, history, screenshotPath: ssPath
      });

      // Record a page-level summary once per distinct page.
      const curUrl = page.url();
      if (curUrl !== lastSummarizedUrl) {
        lastSummarizedUrl = curUrl;
        pages.push({
          url: curUrl,
          summary: analysis.pageSummary,
          elementCount: fresh.length,
          source: analysis.source,
          topActions: analysis.ranked.slice(0, 5).map(r => ({
            label: r.label, predictedDestination: r.predictedDestination, priority: r.priority
          }))
        });
        logger.info(`Page: ${analysis.pageSummary} (${analysis.source})`);
      }

      // CHOOSE the action(s) for this page based on coverage mode.
      const actionPlan = coverage === 'full'
        ? analysis.ranked.map(r => r.element)   // breadth-first: try all, ranked
        : [analysis.recommended].filter(Boolean); // happy-path: just the best

      for (const target of actionPlan) {
        if (step > maxSteps) break;
        chosen = target;
        const ranking = analysis.ranked.find(r => r.element === target);
        const caption = (target === analysis.recommended)
          ? analysis.caption
          : `Clicking "${ranking ? ranking.label : 'element'}"`;
        const predictedDestination = ranking ? ranking.predictedDestination : '';

        const prevUrl = page.url();
        const actionDesc = await executeAction(page, chosen);
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        // Wait for the URL to settle — some static servers redirect to clean URLs
        // (e.g. /page.html → /page) slightly after networkidle.
        const newUrl = await waitForUrlSettle(page, prevUrl);
        await page.waitForTimeout(400);

        // If the click led to a browser error page (e.g. server stopped responding),
        // don't mis-report it as navigation. Try to recover by going back.
        if (/^chrome-error:|^about:neterror/.test(newUrl)) {
          logger.error(`Action led to an unreachable page (server may have stopped). Attempting to recover...`);
          await page.goBack({ waitUntil: 'networkidle', timeout: 8000 }).catch(() => {});
          tracker.markClicked(tracker.elementKey(chosen));
          consecutiveErrors++;
          if (consecutiveErrors >= 3) { logger.info('Too many unreachable pages — stopping'); break; }
          break; // re-analyze the (recovered) page on the next outer iteration
        }

        const navigated = newUrl !== prevUrl;
        if (navigated) tracker.markVisited(newUrl);

        const reason = (target === analysis.recommended) ? analysis.recommendedReason : (ranking ? `priority ${ranking.priority}` : '');
        const detail = `${reason}${navigated ? ' → navigated to ' + safePath(newUrl) : ''}`;
        logger.step(step, actionDesc, detail);
        logger.addScreenshot(step, ssPath); // attach now that the step entry exists
        tracker.markClicked(tracker.elementKey(chosen));
        history.push(actionDesc);
        steps.push(makeStep(step, actionDesc, detail, null, t0, {
          kind: 'action', caption, predictedDestination, navigated,
          fromUrl: safePath(prevUrl), toUrl: safePath(newUrl), reason
        }));
        // attach screenshot captured at the top of this step to the first action
        if (steps.length) steps[steps.length - 1].screenshot = ssPath;

        consecutiveErrors = 0;
        step++;

        // In happy-path mode we only take one action, then re-analyze the new page.
        if (coverage !== 'full') { step--; break; }
        // In full mode, the page likely changed after navigation — re-discover.
        if (navigated) break;
      }

      consecutiveErrors = 0;
    } catch (err) {
      if (chosen) tracker.markClicked(tracker.elementKey(chosen));
      consecutiveErrors++;
      logger.error(`Step ${step} failed: ${err.message}`);
      if (consecutiveErrors >= 3) { logger.info('Too many consecutive errors — stopping'); break; }
    }
  }

  const summary = history.length ? history.join(' → ') : 'No actions taken';
  return { steps, summary, pages };
}

/** Build a rich step record for narration/video. */
function makeStep(step, action, detail, screenshot, t0, extra = {}) {
  return {
    step,
    action,
    detail,
    screenshot,
    tMs: Date.now() - t0, // ms since exploration start — used to align video captions
    timestamp: new Date().toISOString(),
    ...extra
  };
}

function safePath(url) {
  try { return new URL(url).pathname; } catch { return url; }
}

/**
 * Wait briefly for the page URL to change/stabilize after an action.
 * Returns as soon as the URL differs from `prevUrl`, or after a short timeout.
 * @param {import('playwright').Page} page
 * @param {string} prevUrl
 * @returns {Promise<string>} the (possibly new) URL
 */
async function waitForUrlSettle(page, prevUrl, { tries = 6, intervalMs = 200 } = {}) {
  for (let i = 0; i < tries; i++) {
    const u = page.url();
    if (u !== prevUrl) return u;
    await page.waitForTimeout(intervalMs);
  }
  return page.url();
}

module.exports = { explore };
