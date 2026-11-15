'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Synthesize spoken narration clips with OpenAI text-to-speech.
 *
 * Voice-over is optional polish: any failure (no key, network, model retired)
 * is logged and yields no clips, and the demo is still produced silently.
 * Model / voice can be changed with RUNSIGHT_TTS_MODEL / RUNSIGHT_TTS_VOICE.
 *
 * @param {Array<{tMs: number, text: string}>} lines - what to say and when (raw recording time)
 * @param {string} outputDir - RunSight output directory
 * @param {import('../utils/logger').Logger} [logger]
 * @returns {Promise<Array<{tMs: number, file: string}>>}
 */
async function synthesizeVoiceover(lines, outputDir, logger) {
  const spoken = (lines || []).filter(l => l.text && l.text.trim());
  if (!spoken.length) return [];
  if (!process.env.OPENAI_API_KEY) {
    if (logger) logger.info('Voice-over skipped — it needs OPENAI_API_KEY');
    return [];
  }

  const dir = path.join(outputDir, '.video-tmp', 'voice');
  fs.mkdirSync(dir, { recursive: true });
  const model = process.env.RUNSIGHT_TTS_MODEL || 'gpt-4o-mini-tts';
  const voice = process.env.RUNSIGHT_TTS_VOICE || 'alloy';

  try {
    const OpenAI = require('openai');
    const client = new OpenAI();
    const clips = await Promise.all(spoken.map(async (line, i) => {
      const resp = await client.audio.speech.create({ model, voice, input: line.text, response_format: 'mp3' });
      const file = path.join(dir, `line-${i}.mp3`);
      fs.writeFileSync(file, Buffer.from(await resp.arrayBuffer()));
      return { tMs: line.tMs, file };
    }));
    if (logger) logger.info(`Voice-over: ${clips.length} lines narrated (${model}, ${voice})`);
    return clips;
  } catch (err) {
    if (logger) logger.error(`Voice-over skipped (${err.message}) — demo will be silent`);
    return [];
  }
}

module.exports = { synthesizeVoiceover };
