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

const FPS = 25;
const ZOOM = 0.3;        // extra magnification while an action is in focus (1 + ZOOM)
const ZOOM_RAMP = 0.55;  // seconds to ease in / out
const sec = (ms) => Number((ms / 1000).toFixed(3));

/**
 * Sort and merge time intervals, optionally shrinking each one first.
 * @param {Array<{startMs: number, endMs: number}>} list
 * @param {number} [shrinkMs=0] - trimmed off both ends of every interval
 * @param {number} [minMs=0] - intervals shorter than this (after shrinking) are dropped
 * @returns {Array<{startMs: number, endMs: number}>}
 */
function mergeIntervals(list, shrinkMs = 0, minMs = 0) {
  const out = [];
  const sorted = (list || []).map(c => ({ startMs: c.startMs + shrinkMs, endMs: c.endMs - shrinkMs }))
    .filter(c => c.endMs - c.startMs >= minMs && c.endMs > c.startMs)
    .sort((x, y) => x.startMs - y.startMs);
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (last && c.startMs <= last.endMs) last.endMs = Math.max(last.endMs, c.endMs);
    else out.push({ ...c });
  }
  return out;
}

/**
 * Prepare dead-time intervals for cutting. Each is shrunk so the cut lands
 * between two identical frames even if timing is a few frames off.
 * @param {Array<{startMs: number, endMs: number}>} cuts
 * @returns {Array<{startMs: number, endMs: number}>}
 */
function normalizeCuts(cuts) {
  return mergeIntervals(cuts, 300, 400);
}

/**
 * Map a time in the raw recording to its time in the edited video (after
 * the cuts are removed). A time inside a cut maps to the cut point.
 * @param {number} tMs
 * @param {Array<{startMs: number, endMs: number}>} cuts - normalized
 * @returns {number}
 */
function remapTime(tMs, cuts) {
  let removed = 0;
  for (const c of cuts) {
    if (tMs <= c.startMs) break;
    removed += Math.min(tMs, c.endMs) - c.startMs;
  }
  return tMs - removed;
}

/**
 * Turn zoom windows into keyframes {t, a, x, y}: `a` is zoom amount 0..1, x/y
 * the focus point as a viewport fraction. Windows close together are joined by
 * a pan instead of zooming out and straight back in.
 * @param {Array<{start: number, end: number, x: number, y: number}>} zooms - seconds, edited time
 * @returns {Array<{t: number, a: number, x: number, y: number}>}
 */
function zoomKeys(zooms) {
  const keys = [];
  const push = (t, a, z) => {
    const last = keys[keys.length - 1];
    keys.push({ t: Number(Math.max(t, last ? last.t + 0.04 : 0).toFixed(3)), a, x: z.x, y: z.y });
  };
  const near = (a, b) => b.start - a.end < ZOOM_RAMP * 2 + 0.6;
  zooms.forEach((z, i) => {
    const prev = zooms[i - 1];
    const next = zooms[i + 1];
    if (!(prev && near(prev, z))) push(z.start, 0, z);
    push(z.start + ZOOM_RAMP, 1, z);
    push(z.end, 1, z);
    if (!(next && near(z, next))) push(z.end + ZOOM_RAMP, 0, z);
  });
  return keys;
}

/**
 * FFmpeg expression interpolating one keyframe field over time with an
 * ease-in-out curve. Evaluates to 0 outside the keyframes.
 * @param {Array} keys - from zoomKeys()
 * @param {'a'|'x'|'y'} field
 * @param {string} T - time variable expression (seconds)
 * @returns {string}
 */
function keyExpr(keys, field, T) {
  const parts = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (a.a === 0 && b.a === 0) continue; // not zoomed — value is irrelevant
    const from = Number(a[field].toFixed(4));
    const delta = Number((b[field] - a[field]).toFixed(4));
    const value = delta === 0
      ? `${from}`
      : `(${from}+${delta}*(1-cos(PI*(${T}-${a.t})/${Number((b.t - a.t).toFixed(3))}))/2)`;
    parts.push(`gte(${T},${a.t})*lt(${T},${b.t})*${value}`);
  }
  return parts.join('+') || '0';
}

/**
 * Build the FFmpeg filter graph for the edit. Pure — no I/O.
 * Input 0 is the recording; inputs 1..N are voice clips; then optional music.
 * @param {Object} tl
 * @param {Array<{tMs: number, durationMs: number, text: string}>} [tl.captions]
 * @param {Array<{startMs: number, endMs: number}>} [tl.cuts]
 * @param {Array<{startMs: number, endMs: number, x: number, y: number}>} [tl.zooms]
 * @param {Array<{tMs: number}>} [tl.voice]
 * @param {boolean} [tl.music]
 * @param {number} [tl.durationMs] - wall-clock length of the run, on the same clock as the times above
 * @param {number} [tl.videoDurationMs] - actual length of the recording file
 * @param {Array<{startMs: number, endMs: number}>} [tl.stills] - other spans where the screen was static (title cards)
 * @returns {{graph: string, hasAudio: boolean, durationSec: number|null}}
 */
function buildFilterGraph(tl) {
  // Playwright's recorder writes at least one video frame per screen update, so
  // whenever the page animates faster than 25fps the video runs slow and ends
  // up longer than the wall-clock run. The stretch only accrues while things
  // move, so spread it over the time that was neither cut nor a static card.
  const wall = tl.durationMs || 0;
  const quiet = mergeIntervals([...(tl.cuts || []), ...(tl.stills || [])]);
  const moving = (ms) => remapTime(ms, quiet);
  const stretch = tl.videoDurationMs && moving(wall) > 0
    ? Math.min(0.3, Math.max(0, (tl.videoDurationMs - wall) / moving(wall)))
    : 0;
  const warp = (ms) => Math.max(0, ms + stretch * moving(ms)); // wall clock → recording time

  const cuts = normalizeCuts((tl.cuts || []).map(c => ({ startMs: warp(c.startMs), endMs: warp(c.endMs) })));
  const at = (ms) => sec(remapTime(warp(ms), cuts)); // wall clock ms → edited seconds

  const v = [`fps=${FPS}`];
  if (cuts.length) {
    const dead = cuts.map(c => `between(t,${sec(c.startMs)},${sec(c.endMs)})`).join('+');
    v.push(`select='not(${dead})'`, `setpts=N/${FPS}/TB`);
  }

  const zooms = (tl.zooms || [])
    .map(z => ({ start: at(z.startMs), end: at(z.endMs), x: z.x, y: z.y }))
    .filter(z => z.end > z.start)
    .sort((a, b) => a.start - b.start);
  if (zooms.length) {
    const keys = zoomKeys(zooms);
    const T = `(on/${FPS})`;
    // Upscale first: zoompan positions its window on whole pixels, which shows
    // as jitter during slow moves unless there are spare pixels to land on.
    v.push('scale=iw*2:ih*2:flags=bicubic');
    v.push(`zoompan=z='1+${ZOOM}*(${keyExpr(keys, 'a', T)})'` +
      `:x='max(0,min(iw-iw/zoom,(${keyExpr(keys, 'x', T)})*iw-iw/zoom/2))'` +
      `:y='max(0,min(ih-ih/zoom,(${keyExpr(keys, 'y', T)})*ih-ih/zoom/2))'` +
      `:d=1:s=1920x1080:fps=${FPS}`);
  }

  for (const c of tl.captions || []) {
    if (!c.text) continue;
    const start = at(c.tMs || 0);
    const end = Math.max(start + 1.2, at((c.tMs || 0) + (c.durationMs || 2500)));
    v.push(`drawtext=text='${escapeDrawText(c.text)}':x=(w-text_w)/2:y=h-130:` +
      `fontcolor=white:fontsize=40:box=1:boxcolor=black@0.65:boxborderw=18:` +
      `enable='between(t,${start},${end})'`);
  }
  v.push('format=yuv420p');

  const chains = [`[0:v]${v.join(',')}[v]`];
  const durationSec = tl.videoDurationMs ? sec(remapTime(tl.videoDurationMs, cuts)) : (wall ? at(wall) : null);

  // Audio: every clip is delayed to its cue and padded to full length, so the
  // mix always has the same number of live inputs and a constant level (older
  // FFmpeg builds rescale `amix` whenever an input ends).
  const labels = [];
  (tl.voice || []).forEach((clip, i) => {
    const delay = Math.max(1, Math.round(at(clip.tMs) * 1000));
    chains.push(`[${i + 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${delay}|${delay},apad[a${i}]`);
    labels.push(`[a${i}]`);
  });
  if (tl.music) {
    chains.push(`[${(tl.voice || []).length + 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${labels.length ? 0.1 : 0.35}[bed]`);
    labels.push('[bed]');
  }
  if (labels.length && durationSec) {
    const fade = `afade=t=out:st=${Math.max(0, durationSec - 1.5).toFixed(2)}:d=1.5`;
    chains.push(`${labels.join('')}amix=inputs=${labels.length}:dropout_transition=0,volume=${labels.length},` +
      `atrim=0:${durationSec},${fade}[a]`);
  }

  return { graph: chains.join(';'), hasAudio: Boolean(labels.length && durationSec), durationSec };
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
   * Length of a media file in ms, read from FFmpeg's banner (ffprobe is not bundled).
   * @param {string} file
   * @returns {number|null}
   */
  probeDurationMs(file) {
    let banner = '';
    try {
      execFileSync(this.ffmpeg, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      banner = String(err.stderr || ''); // expected: FFmpeg exits non-zero with no output file
    }
    const m = banner.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
    return m ? Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000) : null;
  }

  /**
   * Edit the raw recording into the final demo: remove dead time, zoom in on
   * each action, burn in captions, and mix narration / music.
   *
   * @param {string} inputPath - raw webm/mp4 from the recorder
   * @param {Object|Array} timeline - see buildFilterGraph(); a bare captions array is also accepted
   * @param {Array<{tMs: number, file: string}>} [timeline.voice] - narration clips
   * @param {string|null} [timeline.music] - path to a background music file
   * @param {import('../utils/logger').Logger} [logger]
   * @returns {Promise<string|null>} path to edited mp4, or null on failure
   */
  async edit(inputPath, timeline, logger) {
    if (!this.available) {
      if (logger) logger.info('FFmpeg not available — keeping raw recording (no captions). Install FFmpeg or the bundled installer for edited demos.');
      return null;
    }
    if (!inputPath || !fs.existsSync(inputPath)) return null;

    const full = Array.isArray(timeline) ? { captions: timeline } : (timeline || {});
    let music = full.music || null;
    if (music && !fs.existsSync(music)) {
      if (logger) logger.error(`Music file not found: ${music} — continuing without music`);
      music = null;
    }
    const out = path.join(this.videoDir, 'demo.mp4');

    // Try the full edit first; if FFmpeg rejects it, still deliver a captioned cut.
    const timing = { cuts: full.cuts, stills: full.stills, durationMs: full.durationMs, videoDurationMs: this.probeDurationMs(inputPath) };
    const attempts = [
      { ...full, ...timing, music },
      { captions: full.captions, ...timing }
    ];
    for (const [i, tl] of attempts.entries()) {
      const { graph, hasAudio, durationSec } = buildFilterGraph({ ...tl, music: Boolean(tl.music) });
      // Keep the edit decision list next to the raw footage for troubleshooting.
      fs.writeFileSync(path.join(path.dirname(inputPath), '..', '.video-tmp', 'timeline.json'),
        JSON.stringify({ timeline: tl, graph }, null, 2));
      const args = ['-y', '-i', inputPath];
      for (const clip of tl.voice || []) args.push('-i', clip.file);
      if (tl.music) args.push('-stream_loop', '-1', '-i', tl.music);
      args.push('-filter_complex', graph, '-map', '[v]');
      if (hasAudio) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '160k');
      if (durationSec) args.push('-t', String(durationSec));
      args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out);

      try {
        execFileSync(this.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
        if (logger) logger.info(`Edited demo video written: ${out}`);
        return out;
      } catch (err) {
        const why = String(err.stderr || err.message).trim().split('\n').slice(-2).join(' | ');
        const last = i === attempts.length - 1;
        if (logger) logger.error(`FFmpeg ${i === 0 ? 'full edit' : 'basic edit'} failed (${why}) — ${last ? 'keeping raw recording' : 'retrying without zoom/audio'}`);
      }
    }
    return null;
  }
}

module.exports = { DemoEditor, resolveFfmpeg, buildFilterGraph, normalizeCuts, remapTime, zoomKeys };


// Self-check: `node agent/demoEditor.js`
if (require.main === module) {
  const assert = require('assert');
  const cuts = normalizeCuts([{ startMs: 5000, endMs: 8000 }, { startMs: 1000, endMs: 3000 }, { startMs: 9000, endMs: 9500 }]);
  assert.deepStrictEqual(cuts, [{ startMs: 1300, endMs: 2700 }, { startMs: 5300, endMs: 7700 }]); // short one dropped
  assert.strictEqual(remapTime(1000, cuts), 1000);       // before any cut
  assert.strictEqual(remapTime(2000, cuts), 1300);       // inside a cut → the cut point
  assert.strictEqual(remapTime(4000, cuts), 2600);       // after first cut
  assert.strictEqual(remapTime(10000, cuts), 6200);      // after both
  const keys = zoomKeys([{ start: 1, end: 2, x: 0.2, y: 0.3 }, { start: 2.5, end: 4, x: 0.8, y: 0.6 }, { start: 9, end: 10, x: 0.5, y: 0.5 }]);
  assert.ok(keys.every((k, i) => i === 0 || k.t > keys[i - 1].t), 'keyframes strictly increase');
  assert.deepStrictEqual(keys.map(k => k.a), [0, 1, 1, 1, 1, 0, 0, 1, 1, 0]); // first two joined by a pan
  const g = buildFilterGraph({
    captions: [{ tMs: 4000, durationMs: 2000, text: "It's 100%: done" }],
    cuts: [{ startMs: 1000, endMs: 3000 }], zooms: [{ startMs: 4000, endMs: 5000, x: 0.5, y: 0.5 }],
    voice: [{ tMs: 4000 }], durationMs: 10000
  });
  assert.ok(g.graph.includes("select='not(between(t,1.3,2.7))'"));
  assert.ok(g.graph.includes('adelay=2600|2600'));
  assert.ok(g.hasAudio && g.durationSec === 8.6);
  // Recording ran 10% slow over its 8s of motion (2s were cut): t=4s is 2s into the motion → +0.2s.
  const w = buildFilterGraph({ voice: [{ tMs: 4000 }], cuts: [{ startMs: 1000, endMs: 3000 }], durationMs: 10000, videoDurationMs: 10800 });
  assert.ok(w.graph.includes('adelay=2800|2800') && w.durationSec === 9.4, w.graph);
  console.log('demoEditor self-check passed');
}
