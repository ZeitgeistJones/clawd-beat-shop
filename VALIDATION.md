# Validation — 2026-10-06

## Verified

- `npm test`: all Node tests pass. Coverage includes repository URL validation, canonical renamed-repo handling, pinned README revision, UTF-8 text, rate-limited metadata, missing README, canceled loads, Markdown cleanup, wrapped-paragraph README joining, preserving qualifiers, selected-evidence filtering, inferred/overridden musical themes, instrumental/vocal workflows, conservative source defaults, lyrics-instruction construction, and mocked Gemini lyrics endpoint cases (success, malformed JSON, incomplete sections, missing `GEMINI_API_KEY`, quota/429, high-demand retries, oversized excerpt lists, official `generateContent` request shape with optional `GEMINI_MODEL`).
- `npm run build`: static output generated successfully; server-only modules under `server/` and `api/` are not copied into `dist/`.
- Node syntax checks pass for application modules, server modules, and build/dev scripts.
- Local development HTTP checks: HTML, application modules and CSS return 200. `POST /api/generate-lyrics` is served by `npm run dev` and returns a clear 503 when credentials are missing. Unknown paths, `.env.local`, and `server/` modules return 404.
- Endpoint unit tests confirm the Gemini request uses `x-goog-api-key`, `responseMimeType: application/json`, a response schema for `title`/`styles`/`lyrics`, and default model `gemini-3.8-flash` unless `GEMINI_MODEL` is set. Browser code does not contain the API key.
- Browser checks on `http://127.0.0.1:3001/`: hero and mode radios render; fictional demo loads with the FICTIONAL DEMO label; Suno Prompt produces Styles + songwriting brief + Download pack without a key; Generate Lyrics shows the editable Clawd profile, disables the button while generating, exposes Download Song Pack / Open Suno / Copy controls, and surfaces missing-credential errors in the visible status line. Mobile-width viewport (~375px) stacks to a single column without obvious overflow.
- A real Node fetch successfully loaded the public `clawdbotatg/clawd-vesting` repository earlier in this project’s validation history: README characters, recent commits, revision pinning, and partial-source labeling behave as designed. Numeric/security claims start unchecked.

## Not verified

- Live Gemini generation against a real `GEMINI_API_KEY` during this pass (tests use mocked upstream responses). Configure Vercel env vars or `.env.local` before relying on Generate Lyrics in production/local.
- Clipboard write and file-download click behavior in the automation browser (UI controls are present; native clipboard/download success was not confirmed).
- Vercel production deployment of the new function after this change set. Configuration is prepared (`framework: null`, `dist` output, `api/generate-lyrics.js`).
- Suno audio quality, song length or vocal characteristics. No Suno API integration exists.
- Full repository code behavior, deployment status, security, financial claims, or stale documentation. Only public metadata, README text and selected commit messages are used.

`CURSOR.md` includes the remaining browser checklist. Suno Prompt mode needs no credentials. Generate Lyrics needs server-only `GEMINI_API_KEY`.
