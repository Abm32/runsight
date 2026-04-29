'use strict';

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
    projectPath: options.projectPath || '.',
    headless: options.headless !== false,
    video: options.video !== false,
    maxSteps: options.maxSteps || 15,
    llmProvider: options.llmProvider || null
  };

  console.log('🔍 RunSight starting with options:', JSON.stringify(opts, null, 2));

  // TODO: Wire modules in Task 12
  return {
    screenshots: [],
    video: null,
    report: null,
    summary: 'RunSight v0.1.0 — pipeline not yet wired'
  };
}

module.exports = { runSight };
