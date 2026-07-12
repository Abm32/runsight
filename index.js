'use strict';

/* @license MIT */ /* 72756e7369676874:4162686931 */

const path = require('path');
const { chromium } = require('playwright');
const { detectProjects } = require('./agent/detector');
const { runProjects, killAll, identifyFrontend } = require('./agent/runner');
const { explore } = require('./agent/explorer');
const { Screenshotter } = require('./agent/screenshotter');
const { Recorder } = require('./agent/recorder');
const { Logger } = require('./utils/logger');
const { validateLLMConfig } = require('./strategies/llmStrategy');
const { resolveExplorationConfig } = require('./utils/prompt');

const GLOBAL_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * RunSight — Autonomous project explorer + demo recorder.
 * @param {Object} options
 * @param {string} options.projectPath - Path to the project directory
 * @param {boolean} [options.headless=true] - Run browser headless
 * @param {boolean} [options.video=true] - Record session video
 * @param {number} [options.maxSteps=15] - Max exploration steps
 * @param {'llm'|'heuristic'|null} [options.mode] - Exploration mode (prompts if null & interactive)
 * @param {string|null} [options.llmProvider] - 'openai' | 'anthropic' | null
 * @param {string|null} [options.model] - Model id for llm mode
 * @param {'happy'|'full'} [options.coverage='happy'] - Demo story vs full crawl
 * @returns {Promise<{screenshots: string[], video: string|null, flow: string|null, report: string, summary: string}>}
 */
async function runSight(options = {}) {
  // Resolve mode/provider/model interactively when not fully specified.
  // Handles secure, in-memory-only API key collection.
  const cfg = await resolveExplorationConfig({
    mode: options.mode || null,
    llmProvider: options.llmProvider || null,
    model: options.model || null
  });

  const opts = {
    projectPath: path.resolve(options.projectPath || '.'),
    headless: options.headless !== false,
    video: options.video !== false,
    maxSteps: options.maxSteps || 15,
    mode: cfg.mode,
    llmProvider: cfg.llmProvider,
    model: cfg.model,
    coverage: options.coverage === 'full' ? 'full' : 'happy'
  };

  // Validate LLM config upfront (key should already be in env via resolve step).
  if (opts.mode === 'llm' && opts.llmProvider) validateLLMConfig(opts.llmProvider);

  const outputDir = path.join(opts.projectPath, 'outputs');
  const logger = new Logger(outputDir, opts.projectPath);
  let running = [];
  let browser = null;
  let context = null;
  let globalTimer = null;

  try {
    const timeoutPromise = new Promise((_, reject) => {
      globalTimer = setTimeout(() => reject(new Error('Global timeout exceeded (5 min)')), GLOBAL_TIMEOUT);
    });

    const pipeline = async () => {
      console.log('🔍 RunSight v1.2.0');
      console.log(`📁 Project: ${opts.projectPath}`);
      console.log(`🧭 Mode: ${opts.mode}${opts.model ? ' (' + opts.model + ')' : ''} · Coverage: ${opts.coverage}`);

      logger.info('Detecting project type...');
      const projects = await detectProjects(opts.projectPath);
      if (!projects.length) throw new Error('No supported project detected');
      for (const p of projects) logger.info(`Found: ${p.name} (${p.framework})`);

      if (projects[0] && projects[0].readme) {
        const readmePreview = projects[0].readme.split('\n').slice(0, 5).join(' ').trim();
        logger.info(`README: ${readmePreview.slice(0, 150)}...`);
      }

      const guide = projects[0] && projects[0].guide;
      const guideSource = projects[0] && projects[0].guideSource;
      if (guideSource === 'file') {
        logger.info('Guide: .runsight file found — agent will follow navigation instructions');
      } else if (guideSource === 'auto') {
        logger.info('Understanding: auto-generated project context from package.json + detected routes');
      } else {
        logger.info('Tip: Add a .runsight file for more precise navigation instructions (see docs)');
      }

      logger.info('Starting services...');
      running = await runProjects(projects, logger);
      const frontend = identifyFrontend(running);
      if (!frontend) throw new Error('No service started successfully. Check project setup.');
      logger.info(`Frontend: ${frontend.url}`);

      logger.info('Launching browser...');
      browser = await chromium.launch({ headless: opts.headless });

      const recorder = new Recorder(outputDir);
      if (recorder.isEnabled(opts)) {
        context = await recorder.createContext(browser);
      } else {
        context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      }

      const page = await context.newPage();
      logger.info(`Navigating to ${frontend.url}...`);
      await page.goto(frontend.url, { waitUntil: 'networkidle', timeout: 30000 });

      const screenshotter = new Screenshotter(outputDir);
      logger.info('Starting exploration...');
      const exploreOpts = { ...opts, guide };
      const result = await explore(page, exploreOpts, logger, screenshotter);

      // Stop recording to get the raw video path.
      let rawVideoPath = null;
      if (recorder.isEnabled(opts)) {
        logger.info('Saving video...');
        rawVideoPath = await recorder.stop(context);
        context = null; // closed by recorder.stop
      }

      // Narrate + edit into a demo video (graceful fallback handled inside).
      let videoPath = rawVideoPath;
      let flowPath = null;
      try {
        const { buildNarrative } = require('./agent/flowNarrator');
        const narrative = buildNarrative(result, opts);
        flowPath = narrative.write(outputDir);

        if (rawVideoPath) {
          const { DemoEditor } = require('./agent/demoEditor');
          const editor = new DemoEditor(outputDir);
          const edited = await editor.edit(rawVideoPath, narrative.captions, logger);
          if (edited) videoPath = edited;
        }
      } catch (err) {
        logger.error(`Demo post-processing skipped: ${err.message}`);
      }

      logger.save(result.summary);
      const reportPath = path.join(outputDir, 'report.json');

      const screenshots = result.steps.filter(s => s.screenshot).map(s => s.screenshot);
      return { screenshots, video: videoPath, flow: flowPath, report: reportPath, summary: result.summary };
    };

    return await Promise.race([pipeline(), timeoutPromise]);
  } catch (err) {
    logger.error(err.message);
    logger.save('Failed: ' + err.message);
    throw err;
  } finally {
    clearTimeout(globalTimer);
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    killAll(running);
  }
}

module.exports = { runSight };
