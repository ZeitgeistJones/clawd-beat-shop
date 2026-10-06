# Instructions to paste into Cursor

I have added Clawd Beat Lab, a standalone GitHub-to-Suno prompt generator. Help me run and validate this project. Keep it separate from my Workshop dashboard unless I explicitly request integration.

Read README.md and VALIDATION.md first. This is a dependency-free static project with native JavaScript modules, HTML and CSS. Use Node 22+; no npm install is required. Run npm test and npm run build, then start npm run dev and open the app in a real browser.

Verify the following in the browser:

1. A real public Clawd repository loads its description, recent commit titles and README. Confirm the source links and default-branch revision. Missing sources must show a partial-context message, and a rate-limited or missing repo must not reuse the previous repository.
2. The repo browser, fictional demo and pasted-README fallback work. A repo link must point to the repository home, not a file or branch. The demo must remain labeled as fictional.
3. Checked source excerpts, including planned/prototype qualifiers, appear in the exported source packet. Unchecked details must not appear there. Source text must be rendered safely as text, not HTML.
4. Beat palettes, BPM, vocals and story-angle overrides change the generated pack. Instrumentals instruct the user to enable Suno Instrumental; vocal packs explain the writing-model step.
5. Copy works on localhost or HTTPS, with text selection as a fallback. The downloaded UTF-8 text contains the complete pack. Changing settings or source selection invalidates old output.
6. Check mobile widths around 375px and desktop widths around 1440px, keyboard controls, focus visibility, output scrolling and reduced-motion behavior. Fix any overflow or inaccessible controls.

Keep Vercel framework null/Other, build command npm run build, output dist. Do not add a root-level server.mjs or npm start script. Do not add API keys to browser code. There is no Suno API integration or automatic lyrics model in this version; do not claim that it generates music or audits repository code.

When reporting results, separate verified browser/live checks from mocked tests. If I later request automatic lyrics in the app, design a server-side endpoint with protected credentials and cost/rate controls before adding an AI provider.
