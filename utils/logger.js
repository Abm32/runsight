'use strict';

const fs = require('fs');
const path = require('path');

class Logger {
  /**
   * @param {string} outputDir - Directory for logs.txt and report.json
   * @param {string} [projectPath] - Project being analyzed
   */
  constructor(outputDir, projectPath = '.') {
    this.outputDir = outputDir;
    this.projectPath = projectPath;
    this.steps = [];
    this.errors = [];
    this.infos = [];
    this.startTime = new Date();
    fs.mkdirSync(outputDir, { recursive: true });
  }

  /** Log an exploration step */
  step(n, action, detail = '') {
    const entry = {
      step: n,
      action,
      detail,
      timestamp: new Date().toISOString(),
      screenshot: null
    };
    this.steps.push(entry);
    console.log(`  [step-${n}] ${action}${detail ? ' — ' + detail : ''}`);
  }

  /** Associate a screenshot path with a step */
  addScreenshot(stepN, filePath) {
    const entry = this.steps.find(s => s.step === stepN);
    if (entry) entry.screenshot = filePath;
  }

  /** Log an error */
  error(msg) {
    const entry = { message: msg, timestamp: new Date().toISOString() };
    this.errors.push(entry);
    console.error(`  ❌ ${msg}`);
  }

  /** Log an info message */
  info(msg) {
    const entry = { message: msg, timestamp: new Date().toISOString() };
    this.infos.push(entry);
    console.log(`  ℹ️  ${msg}`);
  }

  /** Write logs.txt and report.json to outputDir */
  save(summary = '') {
    const endTime = new Date();
    const duration = endTime - this.startTime;

    // logs.txt — human-readable
    const lines = [
      `RunSight Log — ${this.startTime.toISOString()}`,
      `Project: ${this.projectPath}`,
      `Duration: ${(duration / 1000).toFixed(1)}s`,
      ''
    ];
    for (const s of this.steps) {
      lines.push(`[step-${s.step}] ${s.action}${s.detail ? ' — ' + s.detail : ''}`);
      if (s.screenshot) lines.push(`  📸 ${s.screenshot}`);
    }
    if (this.errors.length) {
      lines.push('', '--- Errors ---');
      for (const e of this.errors) lines.push(`[${e.timestamp}] ${e.message}`);
    }
    if (summary) lines.push('', '--- Summary ---', summary);
    fs.writeFileSync(path.join(this.outputDir, 'logs.txt'), lines.join('\n'));

    // report.json — machine-readable
    const report = {
      version: '1.1.0',
      projectPath: this.projectPath,
      startTime: this.startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalDuration: duration,
      steps: this.steps,
      errors: this.errors,
      summary
    };
    fs.writeFileSync(
      path.join(this.outputDir, 'report.json'),
      JSON.stringify(report, null, 2)
    );
  }
}

module.exports = { Logger };
