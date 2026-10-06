# Validation — 2026-10-06

## Verified

- `npm test`: all 11 Node tests pass. These cover repository URL validation, canonical renamed-repo handling, pinned README revision, UTF-8 text, rate-limited metadata, missing README, canceled loads, Markdown cleanup, preserving qualifiers, selected-evidence filtering, inferred/overridden musical themes, instrumental/vocal workflows, and conservative source defaults.
- `npm run build`: static output generated successfully.
- Node syntax checks pass for all application modules and build/dev scripts.
- Local development HTTP checks: HTML, all application modules and CSS return 200 with suitable content types. Unknown paths and hidden-file requests return 404. The check server was stopped afterward.
- A real Node fetch successfully loaded the public `clawdbotatg/clawd-vesting` repository: 1,368 README characters, four recent commits, no source-load warnings, revision `6b63278b4a35379f1516ec2e6683496ea05f0d14`.
- Prompt extraction against that live snapshot revealed a README duration of 10 minutes and a commit title mentioning a 30-day deployment. This tool does not adjudicate the discrepancy. Numeric details and strong security claims now start unchecked; the brief says to omit contradictory details and avoid precise claims without user confirmation.

## Not verified

- Real browser rendering, mobile overflow, clipboard/download behavior, keyboard interaction, native browser GitHub fetch/CORS, and screen-reader behavior. A browser executable was unavailable, and the attempted browser download failed; Node HTTP checks do not establish browser behavior.
- Vercel/GitHub Pages deployment. The included static configuration is prepared, but this project has not been published.
- Lyrics or audio generation. No prompt was submitted to a writing model or Suno, and no song quality/length guarantee is made.
- Full repository code behavior, deployment status, security, financial claims, or stale documentation. Only public metadata, README text and selected commit messages are used.

`CURSOR.md` includes the remaining browser checklist. No API credentials are required for this version.
