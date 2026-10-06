# Instructions to paste into Cursor

I have added Clawd Beat Lab, a standalone GitHub-to-Suno prompt and lyrics tool. Help me run and validate this project. Keep it separate from my Workshop dashboard unless I explicitly request integration.

Read README.md and VALIDATION.md first. This project keeps a dependency-free static frontend with native JavaScript modules, HTML and CSS, plus one server-side Vercel function for Gemini lyrics. Use Node 22+; no npm install is required. Run npm test and npm run build, then start npm run dev and open the app in a real browser.

For local Generate Lyrics, copy `.env.example` to `.env.local` and set `GEMINI_API_KEY`. Never put the key in browser code or `NEXT_PUBLIC_` variables.

Verify the following in the browser:

1. A real public Clawd repository loads its description, recent commit titles and README. Confirm the source links and default-branch revision. Missing sources must show a partial-context message, and a rate-limited or missing repo must not reuse the previous repository.
2. The repo browser, fictional demo and pasted-README fallback work. A repo link must point to the repository home, not a file or branch. The demo must remain labeled as fictional.
3. Checked source excerpts, including planned/prototype qualifiers, appear in the exported source packet. Unchecked details must not appear there. Source text must be rendered safely as text, not HTML. Wrapped README prose should appear as complete paragraphs, not fragmented lines.
4. Beat palettes, BPM, vocals and story-angle overrides change the generated pack. Instrumentals instruct the user to enable Suno Instrumental; vocal packs explain the writing-model step in Suno Prompt mode.
5. Mode switch: **Suno Prompt** still works without an API key. **Generate Lyrics** calls `/api/generate-lyrics`, shows editable title/styles/lyrics with Copy buttons, Download Song Pack, and Open Suno. Duplicate clicks while generating must be blocked. Missing credentials and quota errors should be clear.
6. Copy works on localhost or HTTPS, with text selection as a fallback. Downloaded UTF-8 text contains the complete pack. Changing settings or source selection invalidates old output.
7. Check mobile widths around 375px and desktop widths around 1440px, keyboard controls, focus visibility, output scrolling and reduced-motion behavior. Fix any overflow or inaccessible controls.

Keep Vercel framework null/Other, build command npm run build, output dist. Do not add a root-level server.mjs or npm start script. Keep `scripts/dev-server.mjs` as the local server and make sure it can serve `/api/generate-lyrics` using `.env.local`. There is no Suno API integration; do not claim that it generates audio or audits repository code.

When reporting results, separate verified browser/live checks from mocked tests.
