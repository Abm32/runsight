'use strict';

const { findInteractableElements, executeAction } = require('../strategies/heuristicStrategy');
const { createVisitTracker } = require('../strategies/priorityStrategy');
const { analyzeCurrentPage, describeAction } = require('./pageAnalyzer');
const { pointAt, holdMs } = require('./director');

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
 * When `options.present` is set the run is performed "on camera": the cursor
 * glides to each target, text is typed, and every action is held long enough
 * to be read and narrated. Time spent thinking (screenshots, analysis, waiting
 * for UI) is reported in `cuts` so the editor can remove it from the video.
 *
 * @param {import('playwright').Page} page
 * @param {Object} options
 * @param {number} [options.maxSteps=15]
 * @param {'llm'|'heuristic'} [options.mode='heuristic']
 * @param {string|null} [options.llmProvider]
 * @param {string|null} [options.model]
 * @param {'happy'|'full'} [options.coverage='happy']
 * @param {string|null} [options.guide]
 * @param {boolean} [options.present=false] - pace and animate actions for a recording
 * @param {number} [options.videoT0] - epoch ms when the recording started (timeline origin)
 * @param {import('../utils/logger').Logger} logger
 * @param {import('./screenshotter').Screenshotter} screenshotter
 * @returns {Promise<{steps: Array, summary: string, pages: Array, cuts: Array<{startMs: number, endMs: number}>}>}
 */
async function explore(page, options, logger, screenshotter) {
  const maxSteps = options.maxSteps || 15;
  const mode = options.mode || (options.llmProvider ? 'llm' : 'heuristic');
  const coverage = options.coverage === 'full' ? 'full' : 'happy';
  const present = options.present === true;
  const tracker = createVisitTracker();
  const history = [];
  const steps = [];
  const pages = []; // page-level summaries for narration
  let plan = [];    // demo story beats (LLM mode), carried from step to step
  let consecutiveErrors = 0;
  const t0 = options.videoT0 || Date.now();
  const now = () => Date.now() - t0;

  // Dead time (thinking / waiting) to cut from the video.
  const cuts = [];
  let cutStart = null;
  const openCut = () => { if (cutStart === null) cutStart = now(); };
  const closeCut = () => {
    if (cutStart !== null && now() - cutStart > 250) cuts.push({ startMs: cutStart, endMs: now() });
    cutStart = null;
  };

  page.on('dialog', async (dialog) => {
    logger.info(`Dialog dismissed: ${dialog.message().slice(0, 100)}`);
    await dialog.dismiss().catch(() => {});
  });
  page.on('pageerror', (err) => logger.error(`Page error: ${err.message}`));

  tracker.markVisited(page.url());
  let lastSummarizedUrl = null;

  // Let the viewer take in the first page before anything happens.
  if (present) await page.waitForTimeout(1800);

  for (let step = 1; step <= maxSteps; step++) {
    let chosen = null;
    try {
      openCut();
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
          closeCut(); // gameplay is content, not dead time
          logger.info('Performing keyboard actions while waiting for UI...');
          for (let round = 0; round < 3; round++) {
            for (const key of keys) {
              const tKey = now();
              await page.keyboard.press(key.key);
              logger.step(step, `Pressed ${key.key}`, key.description || '');
              steps.push(makeStep(step, `Pressed ${key.key}`, key.description || '', null, t0, {
                kind: 'key', tStartMs: tKey, caption: key.description || `Pressing ${key.key}`
              }));
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
          openCut();
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
        guide: options.guide || null, history, screenshotPath: ssPath,
        step, maxSteps, plan, isVisited: (url) => tracker.hasVisited(url)
      });
      if (analysis.plan.length) {
        if (!plan.length) logger.info(`Demo plan: ${analysis.plan.join(' → ')}`);
        plan = analysis.plan;
      }

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

      // The director decided the story is told — end on this page.
      if (analysis.done && coverage !== 'full' && history.length >= 2) {
        logger.info('Demo story complete — stopping');
        break;
      }

      // CHOOSE the action(s) for this page based on coverage mode.
      const actionPlan = coverage === 'full'
        ? analysis.ranked.map(r => r.element)   // breadth-first: try all, ranked
        : [analysis.recommended].filter(Boolean); // happy-path: just the best

      for (const target of actionPlan) {
        if (step > maxSteps) break;
        chosen = target;
        const isRecommended = target === analysis.recommended;
        const ranking = analysis.ranked.find(r => r.element === target);
        const said = isRecommended ? analysis : describeAction(target, step);
        const predictedDestination = ranking ? ranking.predictedDestination : '';

        // ON CAMERA from here: point, act, then hold so the viewer can follow.
        closeCut();
        const tStart = now();
        const prevUrl = page.url();
        const point = present ? await pointAt(page, page.locator(chosen.selector).first()) : null;
        const actionDesc = await executeAction(page, chosen, {
          value: isRecommended ? analysis.inputValue : '',
          typeDelay: present ? 45 : 0,
          guide: options.guide || null
        });
        const tActed = now();
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

        // Hold on the result long enough to read the caption / hear the narration.
        if (present) {
          const remaining = holdMs(said.narration || said.caption) - (now() - tStart);
          await page.waitForTimeout(Math.max(navigated ? 1200 : 700, remaining));
        }

        const reason = isRecommended ? analysis.recommendedReason : (ranking ? `priority ${ranking.priority}` : '');
        const detail = `${reason}${navigated ? ' → navigated to ' + safePath(newUrl) : ''}`;
        logger.step(step, actionDesc, detail);
        logger.addScreenshot(step, ssPath); // attach now that the step entry exists
        tracker.markClicked(tracker.elementKey(chosen));
        history.push(actionDesc);
        const viewport = page.viewportSize();
        steps.push(makeStep(step, actionDesc, detail, null, t0, {
          kind: 'action', caption: said.caption, narration: said.narration, predictedDestination, navigated,
          fromUrl: safePath(prevUrl), toUrl: safePath(newUrl), reason,
          tStartMs: tStart, tActedMs: tActed,
          // Where the action happened, as a fraction of the viewport — drives the zoom.
          point: point && viewport ? { x: point.x / viewport.width, y: point.y / viewport.height } : null
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
  closeCut(); // the final look-around that found nothing more to do

  const summary = history.length ? history.join(' → ') : 'No actions taken';
  return { steps, summary, pages, cuts };
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
