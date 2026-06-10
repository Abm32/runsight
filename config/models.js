'use strict';

/**
 * Configurable catalog of LLM models offered during interactive setup.
 *
 * Model IDs change over time as providers release and retire models.
 * To add, remove, or update a model, edit the arrays below — no other
 * code change is required. Always confirm current IDs against provider docs:
 *   - OpenAI:    https://platform.openai.com/docs/models
 *   - Anthropic: https://docs.anthropic.com/en/docs/about-claude/models
 *
 * Every model listed here MUST support vision (image input), because the
 * exploration agent sends page screenshots to the model.
 *
 * `tier` is informational only (shown to the user to help pick on cost):
 *   - 'best'  — highest understanding, highest cost
 *   - 'cheap' — lower cost, good enough for most demos
 */

/** @typedef {{ id: string, label: string, tier: 'best'|'cheap', envVar: string }} ModelOption */

/** @type {Object<string, { name: string, envVar: string, models: ModelOption[] }>} */
const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-4o',        label: 'GPT-4o — best vision understanding',          tier: 'best',  envVar: 'OPENAI_API_KEY' },
      { id: 'gpt-4.1',       label: 'GPT-4.1 — strong, newer',                     tier: 'best',  envVar: 'OPENAI_API_KEY' },
      { id: 'gpt-4o-mini',   label: 'GPT-4o mini — cheap, fast (good default)',    tier: 'cheap', envVar: 'OPENAI_API_KEY' },
      { id: 'gpt-4.1-mini',  label: 'GPT-4.1 mini — cheap, newer',                 tier: 'cheap', envVar: 'OPENAI_API_KEY' }
    ]
  },
  anthropic: {
    name: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 — balanced vision', tier: 'best',  envVar: 'ANTHROPIC_API_KEY' },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku — cheap, fast',    tier: 'cheap', envVar: 'ANTHROPIC_API_KEY' }
    ]
  }
};

/**
 * Flatten all provider models into a single selectable list.
 * @returns {Array<ModelOption & { provider: string, providerName: string }>}
 */
function listAllModels() {
  const out = [];
  for (const [provider, cfg] of Object.entries(PROVIDERS)) {
    for (const m of cfg.models) {
      out.push({ ...m, provider, providerName: cfg.name });
    }
  }
  return out;
}

/**
 * Resolve a provider + model id into a full model option.
 * Accepts unknown model ids (custom) as long as the provider is known.
 * @param {string} provider
 * @param {string} modelId
 * @returns {(ModelOption & { provider: string, providerName: string })|null}
 */
function resolveModel(provider, modelId) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return null;
  const known = cfg.models.find(m => m.id === modelId);
  if (known) return { ...known, provider, providerName: cfg.name };
  // Custom/unknown model id for a known provider — allow it.
  return {
    id: modelId,
    label: `${modelId} (custom)`,
    tier: 'best',
    envVar: cfg.envVar,
    provider,
    providerName: cfg.name
  };
}

/** Default model used when a provider is chosen but no model specified. */
const DEFAULT_MODEL = { openai: 'gpt-4o-mini', anthropic: 'claude-3-5-haiku-20241022' };

module.exports = { PROVIDERS, listAllModels, resolveModel, DEFAULT_MODEL };
