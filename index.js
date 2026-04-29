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

const GLOBAL_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * RunSight — Autonomous project explorer agent.
 * @param {Object} options
 * @param {string} options.projectPath - Path to the project directory
 * @param {boolean} options.headless - Run browser headless (default: true)
 * @param {boolean} options.video - Record session video (default: true)
 * @param {number} options.maxSteps - Max exploration steps (default: 15)
 * @param {string|null} options.llmProvider - 'openai' | 'anthropic' | null
 * @returns {Promise<{screenshots: string[], video: string|null, report: string, summary: string}>}
 */
async function runSight(options = {}) {
  const opts = {
    projectPath: path.resolve(options.projectPath || '.'),
    headless: options.headless !== false,
    video: options.video !== false,
    maxSteps: options.maxSteps || 15,
    llmProvider: options.llmProvider || null
  };

  // Validate LLM config upfront
  if (opts.llmProvider) validateLLMConfig(opts.llmProvider);

  const outputDir = path.join(opts.projectPath, 'outputs');
  const logger = new Logger(outputDir, opts.projectPath);
  let running = [];
  let browser = null;
  let context = null;
  let globalTimer = null;

  try {
    // Global timeout
    const timeoutPromise = new Promise((_, reject) => {
      globalTimer = setTimeout(() => reject(new Error('Global timeout exceeded (5 min)')), GLOBAL_TIMEOUT);
    });

    const pipeline = async () => {
      console.log('🔍 RunSight v1.1.0');
      console.log(`📁 Project: ${opts.projectPath}`);

      // 1. Detect projects
      logger.info('Detecting project type...');
      const projects = await detectProjects(opts.projectPath);
      if (!projects.length) throw new Error('No supported project detected');
      for (const p of projects) logger.info(`Found: ${p.name} (${p.framework})`);

      // Log README context if available
      if (projects[0] && projects[0].readme) {
        const readmePreview = projects[0].readme.split('\n').slice(0, 5).join(' ').trim();
        logger.info(`README: ${readmePreview.slice(0, 150)}...`);
      }

      // Log guide if available, or suggest creating one
      const guide = projects[0] && projects[0].guide;
      if (guide) {
        logger.info(`Guide: .runsight file found — agent will follow navigation instructions`);
      } else {
        logger.info(`Tip: Add a .runsight file to guide the agent (see docs)`);
      }

      // 2. Start all services
      logger.info('Starting services...');
      running = await runProjects(projects, logger);
      const frontend = identifyFrontend(running);
      if (!frontend) throw new Error('No service started successfully. Check project setup.');
      logger.info(`Frontend: ${frontend.url}`);

      // 3. Launch browser
      logger.info('Launching browser...');
      browser = await chromium.launch({ headless: opts.headless });

      // 4. Create context (with or without video)
      const recorder = new Recorder(outputDir);
      if (recorder.isEnabled(opts)) {
        context = await recorder.createContext(browser);
      } else {
        context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      }

      // 5. Navigate to frontend
      const page = await context.newPage();
      logger.info(`Navigating to ${frontend.url}...`);
      await page.goto(frontend.url, { waitUntil: 'networkidle', timeout: 30000 });

      // 6. Explore
      const screenshotter = new Screenshotter(outputDir);
      logger.info('Starting exploration...');
      const exploreOpts = { ...opts, guide };
      const result = await explore(page, exploreOpts, logger, screenshotter);

      // 7. Stop recording
      let videoPath = null;
      if (recorder.isEnabled(opts)) {
        logger.info('Saving video...');
        videoPath = await recorder.stop(context);
        context = null; // Already closed by recorder.stop
      }

      // 8. Save logs and report
      logger.save(result.summary);
      const reportPath = path.join(outputDir, 'report.json');

      // Collect screenshot paths
      const screenshots = result.steps
        .filter(s => s.screenshot)
        .map(s => s.screenshot);

      return { screenshots, video: videoPath, report: reportPath, summary: result.summary };
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
