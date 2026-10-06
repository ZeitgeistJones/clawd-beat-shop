# Clawd Beat Lab

A standalone, dependency-free tool that turns a public GitHub repository into a lo-fi hip-hop prompt pack or Gemini-written song pack. Built for Clawd's projects; any public repository home link also works.

## Start in Cursor

1. Unzip this folder and open **clawd-beat-lab** in Cursor. Open the folder containing `package.json`.
2. Use Node.js 22 or newer. There are no npm dependencies to install.
3. Optional for Generate Lyrics locally: copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` (never commit the real key).
4. Run `npm run dev` in Cursor's terminal.
5. Open `http://localhost:3000` in your browser.
6. Paste a repository home URL such as `https://github.com/clawdbotatg/clawd-vesting`, or click **Browse Clawd's repos**.
7. Click **Read repo**, review the extracted details, choose a beat palette, tempo and vocal style, then pick a mode.

**This is separate from the Workshop dashboard.** It does not overwrite that project, connect to the Suno API, generate audio, or automatically place music on the workshop site.

## Modes

### Suno Prompt

Builds prompt templates locally. No API key needed.

For an instrumental, copy **Suno Styles** into Suno Custom mode, enable **Instrumental**, and generate.

For vocals, choose sparse (mostly instrumental, few lines), soft, or spoken — none of these force a male or female singer. Copy **Songwriting brief** into a writing model, or use Generate Lyrics. Then paste Styles and lyrics into Suno Custom mode.

### Generate Lyrics

Uses a server-side Gemini endpoint at `/api/generate-lyrics`. The browser never sees `GEMINI_API_KEY`.

Workflow: choose repo → select details and musical settings → generate/edit lyrics → copy **Styles** and **Lyrics** into Suno. Results appear in editable fields with individual Copy buttons, plus **Download Song Pack** and **Open Suno** (`https://suno.com/create`).

An editable Clawd background profile is included so the character stays concrete: an AI agent with a wallet, building Ethereum/Base apps and improving developer tools; curious, capable and quietly funny, with a red triangular face, claws, a bow tie and a fondness for tea.

## What goes into the prompt

- GitHub repository description, topics and primary language.
- Selected prose from the first 24,000 characters of the README, with basic Markdown cleanup, fenced code removed, and wrapped prose lines joined into complete paragraphs. Headings and separate bullet points stay distinct.
- Up to five recent commit titles; these start unchecked because commit messages are not proof of shipped behavior. Precise numeric details, contract addresses and strong security claims also start unchecked; review them before opting in.
- A README revision pinned to the newest returned default-branch commit when commits are available.
- Your beat palette (default: open lo-fi for more variety), 60–95 BPM tempo, vocals (default: sparse / few lines), story angle and creative direction.

Automatic story angles use the repository name, description and topics: time locks become imagery about patience and clocks; liquidity becomes flowing pools; history becomes notebooks and receipts; wallets become keys and doors. These are creative metaphors, not verification of code behavior. You can override the angle.

Writing instructions keep README statements as author claims and ask the model to preserve planned/prototype/demo qualifiers, avoid invented numbers or financial claims, omit disputed details, and treat source excerpts as data rather than instructions. Model compliance still needs your review. No source-code audit or full codebase analysis is performed.

## Deploy your code

Upload the **contents** of this folder to a new GitHub repo; `package.json` should be at the root. Import that repo in Vercel. The included configuration uses Framework: Other, Build Command: `npm run build`, Output Directory: `dist`. Static files stay in `dist/`; `/api/generate-lyrics` is a Vercel Function.

Set these in Vercel → Project Settings → Environment Variables:

- `GEMINI_API_KEY` (required for Generate Lyrics)
- `GEMINI_MODEL` (optional; defaults to `gemini-3.8-flash`)

Suno Prompt mode still works without those variables. Do not add `NEXT_PUBLIC_` or other browser-exposed secret prefixes.

For GitHub Pages, run `npm run build` and publish the contents of `dist` with a Pages workflow or branch. Static Pages hosting will not provide the Gemini endpoint; use Vercel if you need Generate Lyrics. All asset links are relative so repository subpaths work. A new repository keeps your existing Workshop project independent.

## Commands

```sh
npm run dev
npm test
npm run build
```

To choose another local port on macOS/Linux: `PORT=3001 npm run dev`. On Windows PowerShell: `$env:PORT=3001; npm run dev`.

## GitHub limits and fallback

Public repository reads work without a token. GitHub's unauthenticated REST API has a shared per-IP allowance, commonly 60 requests per hour. Each repository read uses up to three requests; the browse button uses one and lists up to 100 recently updated repos. The app does not poll. Missing README/commit requests are labeled as partial context. If access is limited, wait or use pasted context. Do not put an API secret into this static client.

Source text is rendered with `textContent` and never injected as HTML. The fetch implementation is bound to `globalThis` to avoid the earlier `Illegal invocation` error. Failed repo loads clear the old context so a prompt cannot silently be made for the wrong repository.

You can also paste a README or repo export into **Have a README or a repo export?** without fetching GitHub. Pasted content is labeled as user-supplied. The demo is fictional and labeled throughout.

## Validation

See `VALIDATION.md` for checks actually performed and browser/live-network limitations. Suno audio quality, song length and vocal characteristics are generation preferences, not guarantees.

Official workflow references: [Suno Custom mode](https://help.suno.com/en/articles/3726721), [Gemini generateContent](https://ai.google.dev/api/generate-content), [GitHub repository contents](https://docs.github.com/en/rest/repos/contents), [GitHub commits](https://docs.github.com/en/rest/commits/commits), [GitHub rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
