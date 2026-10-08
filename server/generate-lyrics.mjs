import {buildLyricsInstruction, cleanText, requiredLyricTags, THEMES, VIBES, VOICES} from '../src/prompts.js';

// New Gemini API keys cannot use 2.5 Flash — Google requires gemini-3.8-flash.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const MAX_BODY_BYTES = 48_000;
export const MAX_EXCERPTS = 6;
// Match README excerpt selection in prompts.js (isUsefulExcerpt allows up to 440).
export const MAX_EXCERPT_LENGTH = 440;
export const MAX_OUTPUT_CHARS = 8_000;
// Stay under Vercel Hobby maxDuration (60s) with a little buffer for response handling.
export const GEMINI_TIMEOUT_MS = 55_000;
// 3.8 thinking tokens count against this budget — too low truncates lyrics; keep moderate with thinkingLevel low.
export const MAX_OUTPUT_TOKENS = 3072;
// Temporary capacity / rate-limit spikes usually clear quickly — one short retry only (don't burn the timeout).
export const GEMINI_MAX_ATTEMPTS = 2;
export const GEMINI_RETRY_DELAYS_MS = [1200];

const VIBE_KEYS = new Set(Object.keys(VIBES));
const VOICE_KEYS = new Set(Object.keys(VOICES));
const THEME_KEYS = new Set(['auto', ...Object.keys(THEMES)]);
const SOURCE_KEYS = new Set(['github', 'manual', 'demo']);

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: {type: 'string', description: 'Original song title'},
    styles: {type: 'string', description: 'Suno Styles prompt'},
    lyrics: {type: 'string', description: 'Complete lyrics with required section tags'}
  },
  required: ['title', 'styles', 'lyrics']
};

export class LyricsRequestError extends Error {
  constructor(message, status = 400, code = 'bad_request') {
    super(message);
    this.name = 'LyricsRequestError';
    this.status = status;
    this.code = code;
  }
}

function asPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LyricsRequestError(`${label} must be an object.`);
  }
  return value;
}

function requireString(value, label, {max, min = 1, optional = false} = {}) {
  if (value == null || value === '') {
    if (optional) return '';
    throw new LyricsRequestError(`${label} is required.`);
  }
  if (typeof value !== 'string') throw new LyricsRequestError(`${label} must be text.`);
  const text = cleanText(value);
  if (!optional && text.length < min) throw new LyricsRequestError(`${label} is too short.`);
  if (text.length > max) throw new LyricsRequestError(`${label} is too long (max ${max} characters).`);
  return text;
}

function sanitizeModel(model) {
  let value = cleanText(model || DEFAULT_GEMINI_MODEL);
  // New API keys reject retired 2.5 Flash IDs — map them to the current required default.
  if (/^gemini-2\.5-flash(?:-preview.*)?$/i.test(value)) {
    console.error('generate-lyrics remapping retired model to', DEFAULT_GEMINI_MODEL, value);
    value = DEFAULT_GEMINI_MODEL;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value)) {
    throw new LyricsRequestError('GEMINI_MODEL is invalid.', 500, 'config_error');
  }
  return value;
}

export function validateGenerateRequest(body) {
  const input = asPlainObject(body, 'Request body');
  const repoInput = asPlainObject(input.repo, 'repo');
  const optionsInput = asPlainObject(input.options || {}, 'options');
  const evidenceInput = Array.isArray(input.evidence) ? input.evidence : null;
  if (!evidenceInput) throw new LyricsRequestError('evidence must be an array.');
  if (evidenceInput.length > MAX_EXCERPTS) {
    throw new LyricsRequestError(`Select at most ${MAX_EXCERPTS} source excerpts.`);
  }

  const fullName = requireString(repoInput.fullName, 'repo.fullName', {max: 160});
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9_.-]{1,100}$/.test(fullName) ||
      fullName.endsWith('/.') || fullName.endsWith('/..')) {
    throw new LyricsRequestError('repo.fullName must look like owner/repo.');
  }
  const [owner, name] = fullName.split('/');
  const url = requireString(repoInput.url || `https://github.com/${fullName}`, 'repo.url', {max: 220});
  if (!/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/.test(url) && url !== 'https://github.com') {
    throw new LyricsRequestError('repo.url must be an HTTPS github.com repository home URL.');
  }
  const source = requireString(repoInput.source || 'github', 'repo.source', {max: 20});
  if (!SOURCE_KEYS.has(source)) throw new LyricsRequestError('repo.source is not recognized.');

  const repo = {
    owner,
    name,
    fullName,
    url: url.replace(/\/$/, ''),
    source,
    description: requireString(repoInput.description || '', 'repo.description', {max: 500, optional: true}),
    language: requireString(repoInput.language || '', 'repo.language', {max: 80, optional: true}),
    revision: requireString(repoInput.revision || '', 'repo.revision', {max: 80, optional: true}) || null,
    topics: Array.isArray(repoInput.topics)
      ? repoInput.topics.slice(0, 12).map((topic, i) => requireString(topic, `repo.topics[${i}]`, {max: 50}))
      : []
  };

  const vibe = requireString(optionsInput.vibe || 'open', 'options.vibe', {max: 40});
  const voice = requireString(optionsInput.voice || 'sparse', 'options.voice', {max: 40});
  const theme = requireString(optionsInput.theme || 'auto', 'options.theme', {max: 40});
  if (!VIBE_KEYS.has(vibe)) throw new LyricsRequestError('options.vibe is invalid.');
  if (!VOICE_KEYS.has(voice)) throw new LyricsRequestError('options.voice is invalid.');
  if (!THEME_KEYS.has(theme)) throw new LyricsRequestError('options.theme is invalid.');
  const bpm = Number(optionsInput.bpm);
  if (!Number.isFinite(bpm) || bpm < 60 || bpm > 95) {
    throw new LyricsRequestError('options.bpm must be between 60 and 95.');
  }

  const options = {
    vibe,
    voice,
    theme,
    bpm: Math.round(bpm),
    direction: requireString(optionsInput.direction || '', 'options.direction', {max: 1200, optional: true}),
    profile: requireString(optionsInput.profile || '', 'options.profile', {max: 1600, optional: true})
  };

  const evidence = evidenceInput.map((item, index) => {
    const row = asPlainObject(item, `evidence[${index}]`);
    const excerpt = requireString(row.excerpt ?? row.text, `evidence[${index}].excerpt`, {max: MAX_EXCERPT_LENGTH});
    const type = requireString(row.type ?? row.kind, `evidence[${index}].type`, {max: 80});
    const itemUrl = requireString(row.url || '', `evidence[${index}].url`, {max: 260, optional: true});
    if (itemUrl && !/^https:\/\/github\.com\//.test(itemUrl) && itemUrl !== 'https://github.com') {
      throw new LyricsRequestError(`evidence[${index}].url must be an HTTPS github.com URL.`);
    }
    return {kind: type, text: excerpt, url: itemUrl || repo.url};
  });

  return {repo, options, evidence};
}

export function parseGeminiSong(payload, {vibe} = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new LyricsRequestError('Gemini returned an empty response.', 502, 'bad_model_output');
  }
  const candidate = payload.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts) || !parts.length) {
    const blocked = payload.promptFeedback?.blockReason || candidate?.finishReason;
    throw new LyricsRequestError(
      blocked ? `Gemini did not return lyrics (${blocked}).` : 'Gemini returned no usable content.',
      502,
      'bad_model_output'
    );
  }
  const text = parts.map(part => part?.text || '').join('').trim();
  if (!text) throw new LyricsRequestError('Gemini returned empty text.', 502, 'bad_model_output');
  if (text.length > MAX_OUTPUT_CHARS) {
    throw new LyricsRequestError('Gemini response exceeded the size limit.', 502, 'bad_model_output');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LyricsRequestError('Gemini returned malformed JSON.', 502, 'bad_model_output');
  }
  return validateSongResult(parsed, {vibe});
}

export function validateSongResult(value, {vibe} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LyricsRequestError('Song result must be an object.', 502, 'bad_model_output');
  }
  const read = (field, max) => {
    try {
      return requireString(value[field], field, {max});
    } catch (error) {
      throw new LyricsRequestError(error.message, 502, 'bad_model_output');
    }
  };
  const title = read('title', 160);
  const styles = read('styles', 1600);
  const lyrics = read('lyrics', 8000);
  // Lo-fi and vaporwave use different section maps; require the tags for the active palette.
  for (const tag of requiredLyricTags(vibe)) {
    if (!lyrics.includes(tag)) {
      throw new LyricsRequestError(`Generated lyrics are missing ${tag}.`, 502, 'bad_model_output');
    }
  }
  return {title, styles, lyrics};
}

function geminiErrorDetail(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    const message = cleanText(parsed?.error?.message || parsed?.error?.status || '').slice(0, 220);
    // Never echo anything that looks like a credential.
    if (!message || /api[_-]?key|bearer\s|sk-/i.test(message)) return '';
    return message;
  } catch {
    return '';
  }
}

export function isHardGeminiQuotaFailure(bodyText) {
  const lower = `${bodyText || ''}`.toLowerCase();
  // Daily/plan caps and billing — retries will not help.
  return /quota exceeded|exceeded your current quota|billing|free.?tier.*limit|limit:\s*0\b/i.test(lower);
}

export function isRetryableGeminiFailure(status, bodyText) {
  const lower = `${bodyText || ''}`.toLowerCase();
  if (isHardGeminiQuotaFailure(bodyText)) return false;
  if (status === 503 || status === 502 || status === 429) return true;
  return /high demand|spikes in demand|overloaded|unavailable|try again later|temporarily|rate limit|resource.?exhausted/i.test(lower);
}

function mapGeminiHttpError(status, bodyText) {
  const detail = geminiErrorDetail(bodyText);
  const lower = `${bodyText || ''} ${detail}`.toLowerCase();
  if (/high demand|spikes in demand|overloaded/i.test(lower) || status === 503) {
    return new LyricsRequestError(
      'Gemini is busy right now. Wait a moment and try again.',
      503,
      'upstream_busy'
    );
  }
  if (isHardGeminiQuotaFailure(bodyText)) {
    return new LyricsRequestError(
      'Gemini quota is used up for now. Check usage in Google AI Studio, then try again later.',
      429,
      'quota_exceeded'
    );
  }
  if (status === 429 || lower.includes('rate limit') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return new LyricsRequestError(
      'Gemini rate limit was hit. Wait a minute, then try again.',
      429,
      'rate_limited'
    );
  }
  if (status === 401 || status === 403) {
    return new LyricsRequestError('Gemini rejected the server credentials. Check GEMINI_API_KEY in Vercel.', 502, 'upstream_auth');
  }
  if (/no longer available|update your code to use/i.test(lower)) {
    return new LyricsRequestError(
      'This Gemini model is retired for new keys. The app default is gemini-3.8-flash — clear GEMINI_MODEL in Vercel or set it to gemini-3.8-flash.',
      502,
      'upstream_error'
    );
  }
  if (status === 404 || lower.includes('not found') || lower.includes('is not found')) {
    return new LyricsRequestError(
      detail || 'Gemini model was not found. Check GEMINI_MODEL or leave it unset for the default.',
      502,
      'upstream_error'
    );
  }
  if (status === 400 || lower.includes('invalid argument') || lower.includes('invalid_argument')) {
    return new LyricsRequestError(
      detail ? `Gemini rejected the request: ${detail}` : 'Gemini rejected the request format. Try again shortly.',
      502,
      'upstream_error'
    );
  }
  return new LyricsRequestError(
    detail ? `Gemini request failed: ${detail}` : 'Gemini request failed. Try again shortly.',
    502,
    'upstream_error'
  );
}

async function delay(ms, signal, sleep = (wait) => new Promise(resolve => setTimeout(resolve, wait))) {
  if (!ms) return;
  if (signal?.aborted) {
    throw new LyricsRequestError('Gemini timed out. Try again with fewer excerpts.', 504, 'timeout');
  }
  let onAbort;
  try {
    await Promise.race([
      sleep(ms),
      new Promise((_, reject) => {
        if (!signal) return;
        onAbort = () => reject(new LyricsRequestError('Gemini timed out. Try again with fewer excerpts.', 504, 'timeout'));
        signal.addEventListener('abort', onAbort, {once: true});
      })
    ]);
  } finally {
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
}

export function thinkingConfigForModel(model) {
  const name = String(model || '').toLowerCase();
  // Legacy 2.5 / lite: budget 0 turns thinking off when those models are still usable.
  if (name.includes('2.5') || name.includes('flash-lite')) {
    return {thinkingBudget: 0};
  }
  // 3.8/3.7 reject "minimal" — low is the latency floor Google documents for drafts/chat.
  if (name.includes('3.8') || name.includes('3.7')) {
    return {thinkingLevel: 'low'};
  }
  // Other Gemini 3.x models: minimal is the closest to off.
  return {thinkingLevel: 'minimal'};
}

function buildGeminiBody(instruction, model, {structured = true} = {}) {
  const generationConfig = {
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    thinkingConfig: thinkingConfigForModel(model)
  };
  if (structured) {
    // Prefer responseJsonSchema (JSON Schema) over the older OpenAPI responseSchema subset.
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseJsonSchema = RESPONSE_SCHEMA;
  } else {
    generationConfig.responseMimeType = 'application/json';
  }
  return {
    contents: [{role: 'user', parts: [{text: instruction}]}],
    generationConfig
  };
}

async function postGemini(url, apiKey, body, {fetchImpl, signal}) {
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new LyricsRequestError('Gemini timed out. Try again with fewer excerpts.', 504, 'timeout');
    }
    throw new LyricsRequestError('Could not reach Gemini.', 502, 'upstream_error');
  }
}

export async function callGemini({
  instruction,
  apiKey,
  model,
  vibe,
  fetchImpl = globalThis.fetch.bind(globalThis),
  signal,
  sleep
}) {
  if (!apiKey) throw new LyricsRequestError('Lyrics generation is not configured. Set GEMINI_API_KEY on the server.', 503, 'missing_credentials');
  const selectedModel = sanitizeModel(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent`;
  const timeout = AbortSignal.timeout(GEMINI_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let lastStatus = 0;
  let lastBody = '';

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    let response = await postGemini(url, apiKey, buildGeminiBody(instruction, selectedModel, {structured: true}), {fetchImpl, signal: combined});
    let bodyText = await response.text();

    // If the structured-schema request is rejected, retry once with JSON mime type only.
    if (!response.ok && (response.status === 400 || /invalid.?argument|unknown name|response.?schema|json.?schema/i.test(bodyText))) {
      console.error('generate-lyrics schema request rejected; retrying without responseJsonSchema', response.status);
      response = await postGemini(url, apiKey, buildGeminiBody(instruction, selectedModel, {structured: false}), {fetchImpl, signal: combined});
      bodyText = await response.text();
    }

    if (response.ok) {
      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        throw new LyricsRequestError('Gemini returned a non-JSON response.', 502, 'bad_model_output');
      }
      return parseGeminiSong(payload, {vibe});
    }

    lastStatus = response.status;
    lastBody = bodyText;
    const canRetry = attempt < GEMINI_MAX_ATTEMPTS && isRetryableGeminiFailure(response.status, bodyText);
    if (!canRetry) break;

    const waitMs = GEMINI_RETRY_DELAYS_MS[attempt - 1] ?? GEMINI_RETRY_DELAYS_MS.at(-1);
    console.error('generate-lyrics Gemini busy; retrying', response.status, `attempt ${attempt + 1}/${GEMINI_MAX_ATTEMPTS}`);
    await delay(waitMs, combined, sleep);
  }

  console.error('generate-lyrics Gemini HTTP error', lastStatus);
  throw mapGeminiHttpError(lastStatus, lastBody);
}

export async function generateLyricsFromRequest(body, {
  env = process.env,
  fetchImpl = globalThis.fetch.bind(globalThis),
  signal,
  sleep
} = {}) {
  const {repo, options, evidence} = validateGenerateRequest(body);
  const instruction = buildLyricsInstruction(repo, options, evidence);
  if (instruction.length > 40_000) {
    throw new LyricsRequestError('Request context is too large. Select fewer excerpts.', 413, 'payload_too_large');
  }
  const song = await callGemini({
    instruction,
    apiKey: typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY.trim() : '',
    model: (typeof env.GEMINI_MODEL === 'string' && env.GEMINI_MODEL.trim()) || DEFAULT_GEMINI_MODEL,
    vibe: options.vibe,
    fetchImpl,
    signal,
    sleep
  });
  return {
    ...song,
    // Song title is always the repository name, not a model-invented phrase.
    title: repo.name,
    repository: repo.fullName,
    source: repo.source,
    revision: repo.revision
  };
}

export function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function handleGenerateLyricsRequest(request, options = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': options.allowOrigin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store'
      }
    });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, {error: 'Use POST.', code: 'method_not_allowed'});
  }

  const lengthHeader = Number(request.headers.get('content-length') || 0);
  if (lengthHeader > MAX_BODY_BYTES) {
    return jsonResponse(413, {error: 'Request body is too large.', code: 'payload_too_large'});
  }

  let raw;
  try {
    raw = await request.text();
  } catch {
    return jsonResponse(400, {error: 'Could not read the request body.', code: 'bad_request'});
  }
  if (raw.length > MAX_BODY_BYTES) {
    return jsonResponse(413, {error: 'Request body is too large.', code: 'payload_too_large'});
  }

  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return jsonResponse(400, {error: 'Request body must be JSON.', code: 'bad_request'});
  }

  try {
    const result = await generateLyricsFromRequest(body, options);
    return jsonResponse(200, result);
  } catch (error) {
    if (error instanceof LyricsRequestError) {
      return jsonResponse(error.status, {error: error.message, code: error.code});
    }
    console.error('generate-lyrics failed', error?.name || 'Error');
    return jsonResponse(500, {error: 'Unexpected server error.', code: 'server_error'});
  }
}
