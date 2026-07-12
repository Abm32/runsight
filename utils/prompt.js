'use strict';

const readline = require('readline');
const { PROVIDERS, listAllModels, DEFAULT_MODEL } = require('../config/models');

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
 * Interactive flow (primary UX): a single unified list — every LLM model
 * (grouped by provider, cheap tiers first) plus one "Heuristic" entry at the
 * bottom. Whatever is picked, we only ask for an API key afterward, and only
 * if an LLM model was chosen and no key is already available in the
 * environment.
 *
 * @param {Object} flags
 * @param {string} [flags.mode] - 'llm' | 'heuristic'
 * @param {string} [flags.llmProvider] - 'openai' | 'anthropic'
 * @param {string} [flags.model] - model id
 * @returns {Promise<{ mode: 'llm'|'heuristic', llmProvider: string|null, model: string|null }>}
 */
async function resolveExplorationConfig(flags = {}) {
  let mode = flags.mode || (flags.llmProvider ? 'llm' : null);
  let provider = flags.llmProvider || null;
  let model = flags.model || null;

  // Fully specified via flags — nothing to resolve except the API key.
  if (mode === 'heuristic') return { mode: 'heuristic', llmProvider: null, model: null };
  if (mode === 'llm' && model) {
    if (!provider) provider = model.startsWith('claude') ? 'anthropic' : 'openai';
    await ensureApiKey(provider);
    return { mode: 'llm', llmProvider: provider, model };
  }

  // Nothing specified — non-interactive contexts get a safe, silent default:
  // use an available API key automatically (best UX for CI/agents), else
  // fall back to the free heuristic mode without prompting.
  if (!isInteractive()) {
    if (process.env.OPENAI_API_KEY) return { mode: 'llm', llmProvider: 'openai', model: DEFAULT_MODEL.openai };
    if (process.env.ANTHROPIC_API_KEY) return { mode: 'llm', llmProvider: 'anthropic', model: DEFAULT_MODEL.anthropic };
    return { mode: 'heuristic', llmProvider: null, model: null };
  }

  // Interactive — ask which model to use, choosing the mode implicitly.
  // If a provider was pinned via flags (--llm-provider without --model),
  // narrow the list to that provider's models.
  const all = provider ? listAllModels().filter(m => m.provider === provider) : listAllModels();
  const options = all.map(m => ({
    label: `${m.providerName} · ${m.label}  [${m.tier}]${hasKeyFor(m.provider) ? ' (key detected)' : ''}`
  }));
  options.push({ label: 'Custom — enter a model id manually' });
  options.push({ label: 'Heuristic — free, offline, no API key (rule-based ranking)' });

  // Default to the first "cheap" tier model if present, otherwise the first entry.
  const defaultIdx = Math.max(0, all.findIndex(m => m.tier === 'cheap'));
  const idx = await choose('Choose a model to explore and demo your app with:', options, defaultIdx);

  if (idx === options.length - 1) {
    // Heuristic — no key needed.
    return { mode: 'heuristic', llmProvider: null, model: null };
  }

  if (idx === options.length - 2) {
    // Custom model id.
    const provIdx = await choose('Which provider is the custom model?', [
      { label: 'OpenAI' }, { label: 'Anthropic' }
    ], 0);
    provider = provIdx === 0 ? 'openai' : 'anthropic';
    model = await ask('Enter model id: ');
  } else {
    provider = all[idx].provider;
    model = all[idx].id;
  }

  // Ask for the API key only now that an LLM model has actually been chosen.
  await ensureApiKey(provider);
  return { mode: 'llm', llmProvider: provider, model };
}

/** Whether an API key for the given provider is already available in the environment. */
function hasKeyFor(provider) {
  const cfg = PROVIDERS[provider];
  const envVar = cfg ? cfg.envVar : (provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY');
  return Boolean(process.env[envVar]);
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
