import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GEMINI_MODEL,
  generateLyricsFromRequest,
  handleGenerateLyricsRequest,
  isRetryableGeminiFailure,
  parseGeminiSong,
  validateGenerateRequest
} from '../server/generate-lyrics.mjs';

const validBody = {
  repo: {
    fullName: 'clawdbotatg/clawd-vesting',
    url: 'https://github.com/clawdbotatg/clawd-vesting',
    source: 'github',
    description: 'A time-locked vesting experiment.',
    revision: 'abc123',
    topics: ['vesting']
  },
  options: {
    vibe: 'open',
    voice: 'sparse',
    theme: 'auto',
    bpm: 74,
    direction: 'quiet confidence',
    profile: ''
  },
  evidence: [{
    type: 'README claim',
    excerpt: 'A planned feature would let users export unlock schedules.',
    url: 'https://github.com/clawdbotatg/clawd-vesting'
  }]
};

const validSong = {
  title: 'Let the Clock Do Its Work',
  styles: 'Lo-fi hip-hop, 74 BPM, dusty boom-bap drums',
  lyrics: `[Intro]
tea steam rising
[Verse 1]
checking the lock again
[Chorus]
let the clock do its work
[Verse 2]
planned export waits patiently
[Chorus]
let the clock do its work
[Outro]
lights down, loop soft`
};

function geminiOk(song = validSong) {
  return Response.json({
    candidates: [{content: {parts: [{text: JSON.stringify(song)}]}}]
  });
}

test('request validation accepts bounded payloads and rejects bad enums', () => {
  const ok = validateGenerateRequest(validBody);
  assert.equal(ok.repo.fullName, 'clawdbotatg/clawd-vesting');
  assert.equal(ok.options.bpm, 74);
  assert.throws(() => validateGenerateRequest({...validBody, options: {...validBody.options, vibe: 'metal'}}), /vibe/);
  assert.throws(() => validateGenerateRequest({...validBody, evidence: new Array(11).fill(validBody.evidence[0])}), /at most/);
});

test('parseGeminiSong rejects malformed and incomplete lyrics', () => {
  assert.throws(() => parseGeminiSong({candidates: [{content: {parts: [{text: '{bad'}]}}]}), /malformed/);
  assert.throws(() => parseGeminiSong({
    candidates: [{content: {parts: [{text: JSON.stringify({title: 'A', styles: 'B', lyrics: 'no tags'})}]}}]
  }), /missing/);
  const song = parseGeminiSong({
    candidates: [{content: {parts: [{text: JSON.stringify(validSong)}]}}]
  });
  assert.equal(song.title, validSong.title);
});

test('missing GEMINI_API_KEY returns a clear configuration error', async () => {
  await assert.rejects(
    generateLyricsFromRequest(validBody, {env: {}, fetchImpl: async () => geminiOk()}),
    /not configured/
  );
  const response = await handleGenerateLyricsRequest(new Request('http://localhost/api/generate-lyrics', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(validBody)
  }), {env: {}});
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.code, 'missing_credentials');
  assert.ok(!JSON.stringify(payload).toLowerCase().includes('apikey'));
});

test('quota failures surface a clear 429', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({error: {message: 'Quota exceeded for quota metric'}}), {status: 429});
  const response = await handleGenerateLyricsRequest(new Request('http://localhost/api/generate-lyrics', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(validBody)
  }), {env: {GEMINI_API_KEY: 'test-key'}, fetchImpl});
  assert.equal(response.status, 429);
  const payload = await response.json();
  assert.equal(payload.code, 'quota_exceeded');
  assert.match(payload.error, /quota|rate limit/i);
});

test('successful mocked Gemini response returns validated song fields', async () => {
  let calledUrl = '';
  let calledHeaders = null;
  let calledBody = null;
  const fetchImpl = async (url, init) => {
    calledUrl = url;
    calledHeaders = init.headers;
    calledBody = JSON.parse(init.body);
    return geminiOk();
  };
  const result = await generateLyricsFromRequest(validBody, {
    env: {GEMINI_API_KEY: 'test-key', GEMINI_MODEL: DEFAULT_GEMINI_MODEL},
    fetchImpl
  });
  assert.equal(result.title, 'clawd-vesting');
  assert.equal(result.styles, validSong.styles);
  assert.ok(result.lyrics.includes('[Outro]'));
  assert.ok(calledUrl.includes(`/models/${DEFAULT_GEMINI_MODEL}:generateContent`));
  assert.equal(calledHeaders['x-goog-api-key'], 'test-key');
  assert.equal(calledBody.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(calledBody.generationConfig.responseJsonSchema.required, ['title', 'styles', 'lyrics']);
  assert.equal(calledBody.generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.ok(calledBody.generationConfig.maxOutputTokens >= 4096);
  assert.ok(calledBody.contents[0].parts[0].text.includes('untrusted data'));
  assert.ok(calledBody.contents[0].parts[0].text.includes('planned feature'));
});

test('Gemini 400 schema errors retry without responseJsonSchema', async () => {
  let calls = 0;
  const fetchImpl = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    if (calls === 1) {
      assert.ok(body.generationConfig.responseJsonSchema);
      return new Response(JSON.stringify({error: {message: 'Invalid JSON payload received. Unknown name response_schema', status: 'INVALID_ARGUMENT'}}), {status: 400});
    }
    assert.equal(body.generationConfig.responseJsonSchema, undefined);
    return geminiOk();
  };
  const result = await generateLyricsFromRequest(validBody, {
    env: {GEMINI_API_KEY: 'test-key'},
    fetchImpl
  });
  assert.equal(calls, 2);
  assert.equal(result.title, 'clawd-vesting');
});

test('high-demand Gemini failures retry and then succeed', async () => {
  assert.equal(
    isRetryableGeminiFailure(503, 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.'),
    true
  );
  assert.equal(isRetryableGeminiFailure(429, 'Quota exceeded for quota metric'), false);

  let calls = 0;
  let sleeps = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 3) {
      return new Response(JSON.stringify({
        error: {
          message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.',
          status: 'UNAVAILABLE'
        }
      }), {status: 503});
    }
    return geminiOk();
  };
  const result = await generateLyricsFromRequest(validBody, {
    env: {GEMINI_API_KEY: 'test-key'},
    fetchImpl,
    sleep: async () => { sleeps += 1; }
  });
  assert.equal(calls, 3);
  assert.equal(sleeps, 2);
  assert.equal(result.title, 'clawd-vesting');
});

test('exhausted high-demand retries surface a busy error', async () => {
  const response = await handleGenerateLyricsRequest(new Request('http://localhost/api/generate-lyrics', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(validBody)
  }), {
    env: {GEMINI_API_KEY: 'test-key'},
    fetchImpl: async () => new Response(JSON.stringify({
      error: {message: 'This model is currently experiencing high demand. Please try again later.', status: 'UNAVAILABLE'}
    }), {status: 503}),
    sleep: async () => {}
  });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.code, 'upstream_busy');
  assert.match(payload.error, /busy/i);
});

test('Gemini HTTP failures include a safe upstream detail', async () => {
  const response = await handleGenerateLyricsRequest(new Request('http://localhost/api/generate-lyrics', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(validBody)
  }), {
    env: {GEMINI_API_KEY: 'test-key'},
    fetchImpl: async () => new Response(JSON.stringify({error: {message: 'Model gemini-3.8-flash is not found', status: 'NOT_FOUND'}}), {status: 404})
  });
  assert.equal(response.status, 502);
  const payload = await response.json();
  assert.match(payload.error, /not found/i);
});

test('malformed Gemini success payload becomes a 502', async () => {
  const fetchImpl = async () => Response.json({
    candidates: [{content: {parts: [{text: JSON.stringify({title: 'Only title'})}]}}]
  });
  const response = await handleGenerateLyricsRequest(new Request('http://localhost/api/generate-lyrics', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(validBody)
  }), {env: {GEMINI_API_KEY: 'test-key'}, fetchImpl});
  assert.equal(response.status, 502);
  const payload = await response.json();
  assert.equal(payload.code, 'bad_model_output');
});
