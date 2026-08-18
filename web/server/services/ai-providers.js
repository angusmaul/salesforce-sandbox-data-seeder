/**
 * AI Provider Abstraction
 *
 * Two entry points over the same three adapters:
 *   callModel(providerConfig, systemPrompt, userPrompt) — single-shot; returns
 *     the model's raw text (JSON parsing/repair lives in the caller), or null
 *     on any failure. Ollama calls are constrained to JSON output.
 *   callChat(providerConfig, systemPrompt, messages) — multi-turn; messages is
 *     an array of { role: 'user'|'assistant', content }. Throws on failure so
 *     callers can surface the error to the user. Plain-text output.
 *
 * providerConfig: { provider, model?, baseUrl?, apiKey? }
 *   provider 'anthropic'          — official SDK; apiKey required
 *   provider 'openai-compatible'  — {baseUrl}/v1/chat/completions; apiKey optional
 *                                   (covers OpenAI, Groq, OpenRouter, LM Studio,
 *                                   vLLM, and Ollama's compat endpoint)
 *   provider 'ollama'             — native {baseUrl}/api/chat (format:'json' for
 *                                   single-shot classification calls);
 *                                   model discovery via {baseUrl}/api/tags
 */

const PROVIDERS = ['anthropic', 'openai-compatible', 'ollama'];

const DEFAULT_MODELS = {
  anthropic: 'claude-haiku-4-5-20251001',
  'openai-compatible': 'gpt-4o-mini',
  ollama: 'llama3.1'
};

const DEFAULT_BASE_URLS = {
  'openai-compatible': 'https://api.openai.com',
  ollama: 'http://localhost:11434'
};

const MAX_OUTPUT_TOKENS = 8192;
// Local models on modest hardware can take a while on large prompts
const REQUEST_TIMEOUT_MS = 120000;

function resolveConfig(providerConfig) {
  const provider = providerConfig?.provider || 'anthropic';
  return {
    provider,
    model: providerConfig?.model || DEFAULT_MODELS[provider],
    baseUrl: (providerConfig?.baseUrl || DEFAULT_BASE_URLS[provider] || '').replace(/\/+$/, ''),
    apiKey: providerConfig?.apiKey || null
  };
}

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function responseError(response) {
  let body = '';
  try {
    body = (await response.text()).slice(0, 300);
  } catch (_) { /* ignore */ }
  return new Error(`HTTP ${response.status}${body ? ` - ${body}` : ''}`);
}

async function callAnthropic(cfg, systemPrompt, messages) {
  if (!cfg.apiKey) throw new Error('Anthropic provider requires an API key');
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {})
  });

  const response = await client.messages.create({
    model: cfg.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: systemPrompt,
    messages
  });

  return response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');
}

async function callOpenAICompatible(cfg, systemPrompt, messages) {
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

  const response = await fetchWithTimeout(`${cfg.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [{ role: 'system', content: systemPrompt }, ...messages]
    })
  });

  if (!response.ok) throw await responseError(response);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callOllama(cfg, systemPrompt, messages, { jsonFormat = false } = {}) {
  const response = await fetchWithTimeout(`${cfg.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      // Constrain output to valid JSON — weaker local models need the help.
      // Only for single-shot classification calls; chat needs plain text.
      ...(jsonFormat ? { format: 'json' } : {}),
      options: { num_predict: MAX_OUTPUT_TOKENS },
      messages: [{ role: 'system', content: systemPrompt }, ...messages]
    })
  });

  if (!response.ok) throw await responseError(response);
  const data = await response.json();
  return data.message?.content ?? '';
}

// Provider dispatch that surfaces errors (used by callModel and testProvider)
async function dispatch(cfg, systemPrompt, messages, opts = {}) {
  switch (cfg.provider) {
    case 'anthropic':
      return callAnthropic(cfg, systemPrompt, messages);
    case 'openai-compatible':
      return callOpenAICompatible(cfg, systemPrompt, messages);
    case 'ollama':
      return callOllama(cfg, systemPrompt, messages, opts);
    default:
      throw new Error(`Unknown AI provider: ${cfg.provider}`);
  }
}

/**
 * Call the configured model. Returns raw response text, or null on any failure
 * (callers treat null as "AI unavailable" and fall back to pattern generation).
 */
async function callModel(providerConfig, systemPrompt, userPrompt) {
  const cfg = resolveConfig(providerConfig);
  try {
    const text = await dispatch(cfg, systemPrompt, [{ role: 'user', content: userPrompt }], { jsonFormat: true });
    return text || null;
  } catch (err) {
    console.error(`AI call failed (${cfg.provider}/${cfg.model}):`, err.message);
    return null;
  }
}

/**
 * Multi-turn conversation with the configured model. messages is an array of
 * { role: 'user'|'assistant', content }. Throws on failure (unlike callModel)
 * so callers can show the user what went wrong.
 */
async function callChat(providerConfig, systemPrompt, messages) {
  const cfg = resolveConfig(providerConfig);
  const text = await dispatch(cfg, systemPrompt, messages);
  if (!text) throw new Error('Empty response from model');
  return text;
}

/** List installed Ollama models via /api/tags. Throws on failure. */
async function listOllamaModels(baseUrl) {
  const base = (baseUrl || DEFAULT_BASE_URLS.ollama).replace(/\/+$/, '');
  const response = await fetchWithTimeout(`${base}/api/tags`, { method: 'GET' }, 10000);
  if (!response.ok) throw await responseError(response);
  const data = await response.json();
  return (data.models || []).map(m => m.name);
}

/**
 * Round-trip test for a provider config. Never throws.
 * Returns { ok, error?, models? } — models populated for Ollama when reachable.
 */
async function testProvider(providerConfig) {
  const cfg = resolveConfig(providerConfig);
  let models;
  if (cfg.provider === 'ollama') {
    try {
      models = await listOllamaModels(cfg.baseUrl);
    } catch (err) {
      return { ok: false, error: `Ollama unreachable at ${cfg.baseUrl}: ${err.message}` };
    }
  }
  try {
    const text = await dispatch(
      cfg,
      'You are a connection test. Answer as briefly as possible.',
      [{
        role: 'user',
        content: cfg.provider === 'ollama'
          ? 'Reply with this exact JSON: {"ready": true}'
          : 'Reply with the single word: ready'
      }],
      { jsonFormat: cfg.provider === 'ollama' }
    );
    return { ok: !!text, models, ...(text ? {} : { error: 'Empty response from model' }) };
  } catch (err) {
    return { ok: false, error: err.message, models };
  }
}

module.exports = {
  callModel,
  callChat,
  testProvider,
  listOllamaModels,
  resolveConfig,
  PROVIDERS,
  DEFAULT_MODELS,
  DEFAULT_BASE_URLS
};
