# Project instructions

Read README.md, CURSOR.md and VALIDATION.md. This is a separate dependency-free static frontend with native JavaScript modules, HTML and CSS, plus one server-side lyrics endpoint. Node.js 22+; commands: npm run dev, npm test, npm run build.

Preserve evidence selection, pinned README revision, partial-source warnings, unverified pasted-context labels, fictional demo labels, and clearing stale data on failed loads. Commit titles are not proof of implementation or deployment. Style imagery is an artistic metaphor; README excerpts are author claims. Do not invent financial or usage metrics.

Render repository text with textContent; never inject it into HTML. Restrict repository URLs to HTTPS github.com home paths. Bind native fetch. Never expose `GEMINI_API_KEY` through browser code, public-prefixed variables, responses, or logs. Read it only from server env (`process.env.GEMINI_API_KEY`), with optional server-only `GEMINI_MODEL`.

Use relative asset paths and Vercel Other/null with output dist. Keep the `/api/generate-lyrics` function and `server/` helpers; do not migrate frameworks. Keep dev-server.mjs under scripts; do not add a root server.mjs or start script. Check functional changes with relevant tests/build. Verify browser rendering when available and report unverified checks honestly.
