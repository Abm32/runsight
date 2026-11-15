'use strict';

// vp8:enc:0x4162686931:rs:kv
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { resolveFfmpeg } = require('./demoEditor');

const FRAME_MS = 40; // capture at most 25 fps

/**
 * Records the session by piping the browser's screencast frames into FFmpeg,
 * stamped with the wall clock. Recording time therefore equals real time, so
 * captions, zooms and cuts (all measured in wall-clock ms) land exactly.
 *
 * Playwright's built-in recorder is only the fallback when FFmpeg is missing:
 * it writes at least one video frame per screen update, so animated pages
 * play back slower than real time and the edit drifts out of sync.
 */
class Recorder {
  constructor(outputDir) {
    this.videoDir = path.join(outputDir, 'videos');
    this.tmpDir = path.join(outputDir, '.video-tmp');
    fs.mkdirSync(this.videoDir, { recursive: true });
    fs.mkdirSync(this.tmpDir, { recursive: true });
    this.ffmpeg = resolveFfmpeg();
    this.t0 = null;      // epoch ms of the first recorded frame (timeline origin)
    this.paused = false; // true while something distorts the page (full-page screenshots)
    this.proc = null;
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
    const base = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 };
    return browser.newContext(this.ffmpeg
      ? base
      : { ...base, recordVideo: { dir: this.tmpDir, size: { width: 1920, height: 1080 } } });
  }

  /**
   * Start recording a page. Resolves once the first frame is captured.
   * @param {import('playwright').Page} page
   * @returns {Promise<number>} epoch ms of video time zero
   */
  async start(page) {
    if (!this.ffmpeg) return (this.t0 = Date.now()); // Playwright is already recording
    this.file = path.join(this.videoDir, 'session.mkv');
    // ponytail: frames are stamped when FFmpeg reads them, so an encoder that
    // falls behind (very slow CPU) would delay timestamps — stamp in-process
    // and mux manually if that ever shows up.
    this.proc = spawn(this.ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-c:v', 'mjpeg', '-use_wallclock_as_timestamps', '1', '-i', '-',
      '-vf', 'scale=1920:1080', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14', '-pix_fmt', 'yuv420p',
      this.file
    ], { stdio: ['pipe', 'ignore', 'pipe'] });
    this.stderr = '';
    this.proc.stderr.on('data', (d) => { this.stderr = (this.stderr + d).slice(-2000); });
    this.proc.stdin.on('error', () => {}); // FFmpeg died — reported from stop()
    this.exited = new Promise((resolve) => this.proc.on('close', resolve));

    let onFirst;
    const first = new Promise((resolve) => { onFirst = resolve; });
    const write = () => {
      if (this.t0 === null) { this.t0 = Date.now(); onFirst(); }
      this.proc.stdin.write(this.latest);
    };
    // Trailing-edge throttle: never more than 25 fps, never lose the final state.
    const offer = () => {
      if (this.timer) { this.dirty = true; return; }
      write();
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.dirty) { this.dirty = false; offer(); }
      }, FRAME_MS);
    };

    this.cdp = await page.context().newCDPSession(page);
    this.cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      if (this.paused) return;
      this.latest = Buffer.from(data, 'base64');
      offer();
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080 });
    await Promise.race([first, new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (this.t0 === null) this.t0 = Date.now();
    return this.t0;
  }

  /**
   * Stop recording: finish the video file and close the context.
   * @param {import('playwright').BrowserContext} context
   * @returns {Promise<string>} Path to saved video
   */
  async stop(context) {
    if (this.proc) {
      await this.cdp.send('Page.stopScreencast').catch(() => {});
      clearTimeout(this.timer);
      if (this.latest) this.proc.stdin.write(this.latest); // gives the last frame its duration
      this.proc.stdin.end();
      const code = await this.exited;
      await context.close();
      if (code !== 0 || !fs.existsSync(this.file)) {
        throw new Error(`Recording failed (ffmpeg exit ${code}): ${this.stderr.trim().split('\n').pop() || 'no output'}`);
      }
      return this.file;
    }

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
