'use strict';

const fs = require('fs');
const path = require('path');

class Screenshotter {
  /**
   * @param {string} outputDir - Base output directory (screenshots/ will be created inside)
   */
  constructor(outputDir) {
    this.dir = path.join(outputDir, 'screenshots');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /**
   * Capture a full-page screenshot.
   * @param {import('playwright').Page} page
   * @param {number} stepNumber
   * @param {string} [label='']
   * @returns {Promise<string>} File path of saved screenshot
   */
  async capture(page, stepNumber, label = '') {
    const safeName = label.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const filename = `step-${stepNumber}${safeName ? '-' + safeName : ''}.png`;
    const filePath = path.join(this.dir, filename);
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  /**
   * Detect if the page appears blank (no visible text content).
   * @param {import('playwright').Page} page
   * @returns {Promise<boolean>}
   */
  async detectBlankScreen(page) {
    const textLen = await page.evaluate(() => document.body.innerText.trim().length);
    return textLen === 0;
  }
}

module.exports = { Screenshotter };
