'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Resolve a usable ffmpeg binary path.
 * Preference: bundled (@ffmpeg-installer/ffmpeg) → system 'ffmpeg' → null.
 * @returns {string|null}
 */
function resolveFfmpeg() {
  // 1. Bundled static binary (installed as a dependency, works after `npm i runsight`).
  try {
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer && installer.path && fs.existsSync(installer.path)) return installer.path;
  } catch { /* not installed — try system */ }

  // 2. System ffmpeg on PATH.
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg';
  } catch { /* not on PATH */ }

  return null;
}

/** Escape text for ffmpeg drawtext filter. */
function escapeDrawText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\u2019")   // curly apostrophe avoids quote-escaping headaches
    .replace(/%/g, '\\%')
    .slice(0, 80);
}

class DemoEditor {
  /** @param {string} outputDir */
  constructor(outputDir) {
    this.videoDir = path.join(outputDir, 'videos');
    fs.mkdirSync(this.videoDir, { recursive: true });
    this.ffmpeg = resolveFfmpeg();
  }

  /** Whether editing is available. */
  get available() {
    return Boolean(this.ffmpeg);
  }

  /**
   * Burn captions into the video and produce a polished MP4.
   * Captions appear at the bottom, timed to each action.
   *
   * @param {string} inputPath - raw webm/mp4 from the recorder
   * @param {Array<{tMs:number, durationMs:number, text:string}>} captions
   * @param {import('../utils/logger').Logger} [logger]
   * @returns {Promise<string|null>} path to edited mp4, or null on failure
   */
  async edit(inputPath, captions, logger) {
    if (!this.available) {
      if (logger) logger.info('FFmpeg not available — keeping raw recording (no captions). Install FFmpeg or the bundled installer for edited demos.');
      return null;
    }
    if (!inputPath || !fs.existsSync(inputPath)) return null;

    const out = path.join(this.videoDir, 'demo.mp4');

    // Build a drawtext filter chain — one entry per caption, shown during its window.
    const filters = (captions || [])
      .filter(c => c.text)
      .map((c) => {
        const start = (c.tMs || 0) / 1000;
        const end = start + Math.max(1.2, (c.durationMs || 2500) / 1000);
        const text = escapeDrawText(c.text);
        return `drawtext=text='${text}':x=(w-text_w)/2:y=h-80:` +
          `fontcolor=white:fontsize=28:box=1:boxcolor=black@0.6:boxborderw=12:` +
          `enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`;
      });

    const vf = filters.length ? filters.join(',') : null;

    const args = ['-y', '-i', inputPath];
    if (vf) args.push('-vf', vf);
    args.push(
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-movflags', '+faststart',
      out
    );

    try {
      execFileSync(this.ffmpeg, args, { stdio: 'ignore' });
      if (logger) logger.info(`Edited demo video written: ${out}`);
      return out;
    } catch (err) {
      if (logger) logger.error(`FFmpeg editing failed (${err.message}) — keeping raw recording`);
      return null;
    }
  }
}

module.exports = { DemoEditor, resolveFfmpeg };
