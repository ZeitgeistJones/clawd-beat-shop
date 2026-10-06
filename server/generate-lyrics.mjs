import {buildLyricsInstruction, cleanText, DEFAULT_CLAWD_PROFILE, THEMES, VIBES, VOICES} from '../src/prompts.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const MAX_BODY_BYTES = 48_000;
export const MAX_EXCERPTS = 10;
export const MAX_EXCERPT_LENGTH = 440;
export const MAX_OUTPUT_CHARS = 12_000;
export const GEMINI_TIMEOUT_MS = 28_000;
export const MAX_OUTPUT_TOKENS = 4096;

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
  const value = cleanText(model || DEFAULT_GEMINI_MODEL);
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
    profile: requireString(optionsInput.profile || DEFAULT_CLAWD_PROFILE, 'options.profile', {max: 1600})
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

export function parseGeminiSong(payload) {
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
  return validateSongResult(parsed);
}

export function validateSongResult(value) {
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
  const styles = read('styles', 1200);
  const lyrics = read('lyrics', 8000);
  // Require the main sections once. A second [Chorus] is preferred in the prompt but not mandatory —
  // sparse lo-fi takes often omit the repeat and were failing the whole request.
  for (const tag of ['[Intro]', '[Verse 1]', '[Chorus]', '[Verse 2]', '[Outro]']) {
    if (!lyrics.includes(tag)) {
      throw new LyricsRequestError(`Generated lyrics are missing ${tag}.`, 502, 'bad_model_output');
    }
  }
  return {title, styles, lyrics};
}

function mapGeminiHttpError(status, bodyText) {
  const lower = String(bodyText || '').toLowerCase();
  if (status === 429 || lower.includes('quota') || lower.includes('rate limit') || lower.includes('resource_exhausted')) {
    return new LyricsRequestError(
      'Gemini quota or rate limit was reached. Wait a bit, then try again.',
      429,
      'quota_exceeded'
    );
  }
  if (status === 401 || status === 403) {
    return new LyricsRequestError('Gemini rejected the server credentials.', 502, 'upstream_auth');
  }
  return new LyricsRequestError('Gemini request failed. Try again shortly.', 502, 'upstream_error');
}

export async function callGemini({instruction, apiKey, model, fetchImpl = globalThis.fetch.bind(globalThis), signal}) {
  if (!apiKey) throw new LyricsRequestError('Lyrics generation is not configured. Set GEMINI_API_KEY on the server.', 503, 'missing_credentials');
  const selectedModel = sanitizeModel(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent`;
  const timeout = AbortSignal.timeout(GEMINI_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{role: 'user', parts: [{text: instruction}]}],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA
        }
      }),
      signal: combined
    });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new LyricsRequestError('Gemini timed out. Try again with fewer excerpts.', 504, 'timeout');
    }
    throw new LyricsRequestError('Could not reach Gemini.', 502, 'upstream_error');
  }

  const bodyText = await response.text();
  if (!response.ok) throw mapGeminiHttpError(response.status, bodyText);

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new LyricsRequestError('Gemini returned a non-JSON response.', 502, 'bad_model_output');
  }
  return parseGeminiSong(payload);
}

export async function generateLyricsFromRequest(body, {
  env = process.env,
  fetchImpl = globalThis.fetch.bind(globalThis),
  signal
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
    fetchImpl,
    signal
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
