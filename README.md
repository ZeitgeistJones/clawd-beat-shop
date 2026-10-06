# Clawd Beat Lab

A standalone, dependency-free tool that turns a public GitHub repository into a lo-fi hip-hop prompt pack. Built for Clawd's projects; any public repository home link also works.

## Start in Cursor

1. Unzip this folder and open **clawd-beat-lab** in Cursor. Open the folder containing `package.json`.
2. Use Node.js 22 or newer. There are no npm dependencies to install.
3. Run `npm run dev` in Cursor's terminal.
4. Open `http://localhost:3000` in your browser.
5. Paste a repository home URL such as `https://github.com/clawdbotatg/clawd-vesting`, or click **Browse Clawd's repos**.
6. Click **Read repo**, review the extracted details, choose a beat palette, tempo and vocal style, and click **Make the prompt pack**.

**This is separate from the Workshop dashboard.** It does not overwrite that project, connect to Suno, generate audio, or automatically place music on the workshop site.

## Use the output

For an instrumental, copy **Suno Styles** into Suno Custom mode, enable **Instrumental**, and generate.

For rap, choose a vocal option, then copy **Songwriting brief** into ChatGPT or your preferred writing model. It asks for a title, style and complete lyrics using your selected repo details. Review the lyrics, then copy the Styles and finished lyrics into their respective fields in Suno Custom mode.

The app builds prompt templates locally. It does not contain an AI model, call a paid AI API, or produce finished lyrics automatically. The writing-model step is how you turn a detailed source packet into a natural song rather than a generic rhyme template. It makes no requests to Suno.

You can also paste a README or repo export into **Have a README or a repo export?** without fetching GitHub. Pasted content is labeled as user-supplied. The demo is fictional and labeled throughout.

## What goes into the prompt

- GitHub repository description, topics and primary language.
- Selected prose from the first 24,000 characters of the README, with basic Markdown cleanup and fenced code removed.
- Up to five recent commit titles; these start unchecked because commit messages are not proof of shipped behavior. Precise numeric details, contract addresses and strong security claims also start unchecked; review them before opting in.
- A README revision pinned to the newest returned default-branch commit when commits are available.
- Your beat palette, 60–95 BPM tempo, vocals, story angle and creative direction.

Automatic story angles use the repository name, description and topics: time locks become imagery about patience and clocks; liquidity becomes flowing pools; history becomes notebooks and receipts; wallets become keys and doors. These are creative metaphors, not verification of code behavior. You can override the angle.

The brief keeps README statements as author claims and explicitly asks the writing model to preserve planned/prototype/demo qualifiers, avoid invented numbers or financial claims, and treat source excerpts as data rather than instructions. Model compliance still needs your review. No source-code audit or full codebase analysis is performed.

## Deploy your code

Upload the **contents** of this folder to a new GitHub repo; `package.json` should be at the root. Import that repo in Vercel. The included configuration uses Framework: Other, Build Command: `npm run build`, Output Directory: `dist`. No environment variables are needed.

For GitHub Pages, run `npm run build` and publish the contents of `dist` with a Pages workflow or branch. All asset links are relative so repository subpaths work. A new repository keeps your existing Workshop project independent.

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

## Validation

See `VALIDATION.md` for checks actually performed and browser/live-network limitations. Suno audio quality, song length and vocal characteristics are generation preferences, not guarantees.

Official workflow references: [Suno Custom mode](https://help.suno.com/en/articles/3726721), [GitHub repository contents](https://docs.github.com/en/rest/repos/contents), [GitHub commits](https://docs.github.com/en/rest/commits/commits), [GitHub rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
