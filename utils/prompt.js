'use strict';

const readline = require('readline');
const { PROVIDERS, listAllModels, resolveModel, DEFAULT_MODEL } = require('../config/models');

/**
 * Interactive setup prompts for RunSight.
 *
 * SECURITY NOTES (API keys):
 *  - Keys are held in memory only (process.env) for the lifetime of the run.
 *  - Keys are NEVER written to disk, logs.txt, report.json, or any output file.
 *  - Key input is masked (not echoed to the terminal, not stored in shell history).
 *  - If a provider's env var is already set, we use it and never prompt.
 *  - Keys are only ever sent to the official OpenAI / Anthropic API endpoints
 *    via their official SDKs.
 */

/** Whether we have an interactive TTY to prompt on. */
function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Ask a single line question (echoed input — safe for non-secret answers).
 * @param {string} query
 * @returns {Promise<string>}
 */
function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Ask for a secret with masked input (characters not echoed).
 * The value is returned to the caller and never logged.
 * @param {string} query
 * @returns {Promise<string>}
 */
function askSecret(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const stdout = process.stdout;

    // Mute echoed output: readline writes the typed char to output; we intercept
    // and suppress everything after the prompt so the key never appears on screen.
    const onData = () => { /* keep stdin flowing */ };
    process.stdin.on('data', onData);

    const origWrite = stdout.write.bind(stdout);
    rl._writeToOutput = (chunk) => {
      // Allow the prompt itself through once; suppress typed characters.
      if (chunk.includes(query)) return origWrite(query);
      // Suppress echo of the secret.
      return true;
    };

    rl.question(query, (answer) => {
      process.stdin.removeListener('data', onData);
      rl.close();
      origWrite('\n');
      resolve(answer.trim());
    });
  });
}

/**
 * Choose from a numbered list of options.
 * @param {string} title
 * @param {Array<{label: string}>} options
 * @param {number} [defaultIndex=0]
 * @returns {Promise<number>} chosen index
 */
async function choose(title, options, defaultIndex = 0) {
  console.log(`\n${title}`);
  options.forEach((o, i) => {
    const marker = i === defaultIndex ? '›' : ' ';
    console.log(`  ${marker} ${i + 1}) ${o.label}`);
  });
  const answer = await ask(`Select [1-${options.length}] (default ${defaultIndex + 1}): `);
  if (!answer) return defaultIndex;
  const n = parseInt(answer, 10);
  if (Number.isNaN(n) || n < 1 || n > options.length) return defaultIndex;
  return n - 1;
}

/**
 * Resolve the exploration configuration: mode, provider, model, and (if needed)
 * an in-memory API key. Flags take precedence; prompts fill the gaps when
 * running interactively.
 *
 * @param {Object} flags
 * @param {string} [flags.mode] - 'llm' | 'heuristic'
 * @param {string} [flags.llmProvider] - 'openai' | 'anthropic'
 * @param {string} [flags.model] - model id
 * @returns {Promise<{ mode: 'llm'|'heuristic', llmProvider: string|null, model: string|null }>}
 */
async function resolveExplorationConfig(flags = {}) {
  // 1. Determine mode.
  let mode = flags.mode || (flags.llmProvider ? 'llm' : null);

  if (!mode) {
    if (!isInteractive()) {
      // Non-interactive and unspecified → safe default: heuristic (no key needed).
      return { mode: 'heuristic', llmProvider: null, model: null };
    }
    const idx = await choose(
      'How should RunSight explore your app?',
      [
        { label: 'LLM-guided — best understanding (reads each button, predicts where it leads). Needs an API key.' },
        { label: 'Heuristic — free, offline, no API key (rule-based ranking).' }
      ],
      0
    );
    mode = idx === 0 ? 'llm' : 'heuristic';
  }

  if (mode === 'heuristic') {
    return { mode: 'heuristic', llmProvider: null, model: null };
  }

  // 2. LLM mode — pick a model (which determines the provider).
  let provider = flags.llmProvider || null;
  let model = flags.model || null;

  if (!model) {
    if (provider && DEFAULT_MODEL[provider] && !isInteractive()) {
      model = DEFAULT_MODEL[provider];
    } else if (isInteractive()) {
      const all = listAllModels();
      const options = all.map(m => ({
        label: `${m.providerName} · ${m.label}  [${m.tier}]`
      }));
      options.push({ label: 'Custom — enter a model id manually' });
      const idx = await choose('Select a model (cheaper tiers cost less per step):', options, 2);
      if (idx === options.length - 1) {
        const provIdx = await choose('Which provider is the custom model?', [
          { label: 'OpenAI' }, { label: 'Anthropic' }
        ], 0);
        provider = provIdx === 0 ? 'openai' : 'anthropic';
        model = await ask('Enter model id: ');
      } else {
        provider = all[idx].provider;
        model = all[idx].id;
      }
    }
  }

  if (!provider) {
    // Infer provider from a known model id, else default to openai.
    provider = resolveModel('anthropic', model) && model.startsWith('claude') ? 'anthropic' : 'openai';
  }

  // 3. Ensure we have an API key — env var first, masked prompt as fallback.
  await ensureApiKey(provider);

  return { mode: 'llm', llmProvider: provider, model };
}

/**
 * Ensure the provider's API key is available in process.env.
 * Uses an existing env var if present; otherwise prompts (masked) and sets it
 * in memory only. Throws in non-interactive contexts when the key is missing.
 * @param {string} provider
 * @returns {Promise<void>}
 */
async function ensureApiKey(provider) {
  const cfg = PROVIDERS[provider];
  const envVar = cfg ? cfg.envVar : (provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY');

  if (process.env[envVar]) return; // Already provided via environment — preferred.

  if (!isInteractive()) {
    throw new Error(`${envVar} is required for ${provider}. Set it as an environment variable.`);
  }

  console.log(`\n🔑 ${cfg ? cfg.name : provider} API key needed.`);
  console.log('   Your key is held in memory for this run only — never written to disk, logs, or the report.');
  console.log(`   It is sent only to the official ${cfg ? cfg.name : provider} API.`);
  console.log(`   (Tip: set ${envVar} in your environment to skip this prompt.)`);

  const key = await askSecret(`Enter ${envVar} (input hidden): `);
  if (!key) {
    throw new Error(`No API key entered for ${provider}.`);
  }
  // In-memory only. Never persisted.
  process.env[envVar] = key;
}

/**
 * Redact anything resembling an API key from a string, for safe logging.
 * @param {string} text
 * @returns {string}
 */
function redactSecrets(text) {
  if (!text) return text;
  return String(text)
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, 'sk-***REDACTED***')
    .replace(/sk-ant-[A-Za-z0-9_\-]{8,}/g, 'sk-ant-***REDACTED***');
}

module.exports = {
  resolveExplorationConfig,
  ensureApiKey,
  redactSecrets,
  isInteractive,
  ask,
  askSecret,
  choose
};
