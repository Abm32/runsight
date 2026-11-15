'use strict';

// vp8:enc:0x4162686931:rs:kv
const fs = require('fs');
const path = require('path');

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
    // A laptop-sized 1280x720 layout rendered at 1.5x = crisp Full HD frames
    // with comfortably large UI. Needs Recorder.LAUNCH_ARGS on the browser:
    // the recorder ignores a context-only deviceScaleFactor.
    return browser.newContext({
      recordVideo: {
        dir: this.tmpDir,
        size: { width: 1920, height: 1080 }
      },
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1.5
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
      // Return the raw WebM. The DemoEditor performs the final encode
      // (captions + MP4) in a single high-quality pass when FFmpeg is available.
      const dest = path.join(this.videoDir, 'session.webm');
      fs.copyFileSync(videoPath, dest);
      return dest;
    }

    return null;
  }

  /** Check if video recording should be enabled */
  isEnabled(options) {
    return options.video !== false;
  }
}

/** Chromium flags required for the recording to capture at 1.5x device scale. */
Recorder.LAUNCH_ARGS = ['--force-device-scale-factor=1.5'];

module.exports = { Recorder };
