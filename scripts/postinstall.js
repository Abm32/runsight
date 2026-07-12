#!/usr/bin/env node
'use strict';

/**
 * Postinstall: ensure Playwright's Chromium is available.
 *
 * Resilient by design:
 *  - Skips the download entirely if Chromium is already installed (fast
 *    reinstalls, Docker layer caching, CI with a pre-warmed browser cache).
 *  - Never fails `npm install` — a sandboxed/offline CI environment (no
 *    network egress) should still let the package install; RunSight will
 *    just report a clear error the first time a browser launch is attempted.
 */

const { execSync } = require('child_process');

function chromiumAlreadyInstalled() {
  try {
    const { chromium } = require('playwright');
    const exePath = chromium.executablePath();
    return Boolean(exePath) && require('fs').existsSync(exePath);
  } catch {
    return false;
  }
}

function main() {
  // Respect explicit opt-out (useful for CI images that install browsers separately).
  if (process.env.RUNSIGHT_SKIP_BROWSER_INSTALL) {
    console.log('RunSight: RUNSIGHT_SKIP_BROWSER_INSTALL set — skipping Chromium install.');
    return;
  }
  if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) {
    console.log('RunSight: PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD set — skipping Chromium install.');
    return;
  }

  if (chromiumAlreadyInstalled()) {
    console.log('RunSight: Chromium already installed — skipping download.');
    return;
  }

  try {
    console.log('RunSight: installing Chromium for browser automation...');
    execSync('npx playwright install chromium', { stdio: 'inherit' });
  } catch (err) {
    console.warn('RunSight: could not install Chromium automatically (offline or sandboxed environment?).');
    console.warn('           RunSight will still install; run `npx playwright install chromium` manually before first use.');
    // Never fail the package install over this.
  }
}

main();
