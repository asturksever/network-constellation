// Talking to the Anthropic API from the page, with the user's own key.
//
// Raw fetch rather than the SDK, deliberately. This project has no bundler and
// no dependencies, and scripts/bundle.mjs flattens modules by stripping import
// lines — it cannot handle a default import, which is how the SDK is consumed.
// The day a third-party package genuinely needs to be imported from src/,
// replace the stripper with esbuild rather than teaching it new tricks.
//
// Nothing here runs unless the user has pasted a key. What gets sent is spelled
// out where it is assembled: employer names in enrich.js, question text in
// askllm.js. Never a person's name, headline, slug or email.

/** A bulk extractor over thousands of short strings. Cheap and quick. */
export const MODEL_EMPLOYERS = 'claude-haiku-4-5';
/** One small call per question, where reading the question right matters. */
export const MODEL_QUESTION = 'claude-opus-5';

export const MODELS = [
  { id: 'claude-opus-5', label: 'Opus 5', inPer: 5.00, outPer: 25.00 },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', inPer: 2.00, outPer: 10.00 },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', inPer: 1.00, outPer: 5.00 }
];

const PRICE = Object.fromEntries(MODELS.map(m => [m.id, m]));
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MAX_ATTEMPTS = 5;

export class LlmError extends Error {
  constructor(message, { status = 0, code = 'error', retryable = false } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Dollars for one response's usage. */
export function costOf(model, usage) {
  const p = PRICE[model] || PRICE[MODEL_EMPLOYERS];
  const i = usage?.input_tokens || 0;
  const o = usage?.output_tokens || 0;
  return (i / 1e6) * p.inPer + (o / 1e6) * p.outPer;
}

/**
 * One structured-output call. Resolves { data, usage, model }.
 *
 * `schema` is a JSON Schema the response is constrained to. Keep it to the
 * subset the API accepts: object types with additionalProperties false, every
 * key required, and nullability expressed as anyOf with a null branch.
 */
export async function callClaude({
  apiKey, model, system, user, schema, maxTokens = 4096, effort, signal
}) {
  if (!apiKey) throw new LlmError('No API key.', { code: 'no_key' });

  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema } }
  };
  // Effort is not accepted on Haiku 4.5, so it is only sent where it is valid.
  if (effort && model !== 'claude-haiku-4-5') body.output_config.effort = effort;

  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    // What the SDKs set for dangerouslyAllowBrowser. Without it the API
    // refuses calls made straight from a page.
    'anthropic-dangerous-direct-browser-access': 'true'
  };

  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: signal || AbortSignal.timeout(90_000)
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new LlmError('Cancelled.', { code: 'cancelled' });
      // fetch only rejects like this when the request never completed: no
      // network, or the browser was refused outright. Say which, because an
      // empty result looks identical to the user otherwise.
      throw new LlmError(
        'Could not reach api.anthropic.com from this page. Check your connection, ' +
        'and note the feature depends on Anthropic allowing calls straight from a browser.',
        { code: 'unreachable' });
    }

    if (res.ok) {
      const json = await res.json();

      if (json.stop_reason === 'refusal') {
        throw new LlmError(
          'Claude declined this request' +
          (json.stop_details?.category ? ` (${json.stop_details.category})` : '') + '.',
          { code: 'refusal' });
      }
      if (json.stop_reason === 'max_tokens') {
        throw new LlmError('The answer was cut off.', { code: 'truncated' });
      }

      const text = (json.content || []).find(b => b.type === 'text')?.text;
      if (!text) throw new LlmError('Empty response.', { code: 'empty' });

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new LlmError('Response was not the JSON the schema asked for.', { code: 'bad_json' });
      }
      return { data, usage: json.usage || {}, model: json.model || model };
    }

    // --- not ok ---
    const detail = await res.json().catch(() => null);
    const message = detail?.error?.message || `HTTP ${res.status}`;

    if (res.status === 401 || res.status === 403) {
      throw new LlmError('That API key was rejected.', { status: res.status, code: 'auth' });
    }
    if (res.status === 400) {
      throw new LlmError(message, { status: 400, code: 'bad_request' });
    }
    if (res.status === 413) {
      throw new LlmError('Request too large.', { status: 413, code: 'too_large' });
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = new LlmError(message, { status: res.status, code: res.status === 429 ? 'rate_limited' : 'server', retryable: true });
      const after = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : Math.min(30_000, 2 ** attempt * 1000));
      continue;
    }
    throw new LlmError(message, { status: res.status, code: 'error' });
  }

  throw lastError || new LlmError('Gave up after several attempts.', { code: 'exhausted' });
}

/**
 * A stand-in used by the browser checks, so the whole flow can be exercised
 * without a key and without spending anything. Never reached in normal use.
 */
export function mock() {
  return typeof window !== 'undefined' ? window.__NC_LLM_MOCK : null;
}
