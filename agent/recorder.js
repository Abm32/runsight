'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class Recorder {
  constructor(outputDir) {
    this.videoDir = path.join(outputDir, 'videos');
    this.tmpDir = path.join(outputDir, '.video-tmp');
    fs.mkdirSync(this.videoDir, { recursive: true });
    fs.mkdirSync(this.tmpDir, { recursive: true });
  }

  /**
   * Create a browser context with video recording enabled.
   * @param {import('playwright').Browser} browser
   * @param {Object} [opts]
   * @returns {Promise<import('playwright').BrowserContext>}
   */
  async createContext(browser, opts = {}) {
    return browser.newContext({
      recordVideo: {
        dir: this.tmpDir,
        size: { width: 1280, height: 720 }
      },
      viewport: { width: 1280, height: 720 }
    });
  }

  /**
   * Stop recording: close context, move video to output dir.
   * @param {import('playwright').BrowserContext} context
   * @returns {Promise<string>} Path to saved video
   */
  async stop(context) {
    const pages = context.pages();
    let videoPath = null;

    // Get video path before closing
    if (pages.length > 0 && pages[0].video()) {
      videoPath = await pages[0].video().path();
    }

    await context.close();

    if (videoPath && fs.existsSync(videoPath)) {
      const dest = path.join(this.videoDir, 'session.webm');
      fs.copyFileSync(videoPath, dest);

      // Try converting to mp4 if ffmpeg is available
      const mp4Path = await this.convertToMp4(dest);
      return mp4Path || dest;
    }

    return null;
  }

  /**
   * Attempt to convert webm to mp4 via ffmpeg.
   * @param {string} webmPath
   * @returns {Promise<string|null>} mp4 path or null if ffmpeg unavailable
   */
  async convertToMp4(webmPath) {
    const mp4Path = webmPath.replace(/\.webm$/, '.mp4');
    try {
      execSync(`ffmpeg -i "${webmPath}" -y "${mp4Path}" 2>/dev/null`);
      return mp4Path;
    } catch {
      return null;
    }
  }

  /** Check if video recording should be enabled */
  isEnabled(options) {
    return options.video !== false;
  }
}

module.exports = { Recorder };
