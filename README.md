# Brand Engine App

This repository is the public static frontend only. It does not contain author profiles, drafts, sources, metrics, or provider
credentials. Those remain in the private `brand-engine` repository.

The app accesses a private repository only after a user connects it in **Settings** with a fine-grained GitHub token. The
token is stored in that browser and is not part of this repository. Use the in-app **Token setup guide** to create a
repository-scoped token with Contents and Actions read/write access.

## GitHub Pages

Publish the `main` branch from `/(root)` in **Settings → Pages**. This site hosts only the frontend; engine work still runs
in GitHub Actions in the private data repository.

Never copy `authors/`, `memory/`, `sources/`, `weeks/`, or any secret into this repository.

## This week UI

The entry page puts current post status and a short goal-mix barometer first,
followed by the current action, one fresh-post button, the decision ribbon and
a visual workspace menu. The fresh-post button begins at strategy and retains
confirmation, saved predecessors and queued/busy guards. Advanced step restarts
and progress history live under Runs for the selected week. Detailed charts,
goal focus and post inspection live on Brand progress, not on the entry page.
Shared light/dark tokens and self-hosted fonts live in `styles.css`; no CDN,
framework or build step is required.

The barometer shows recorded twelve-week coverage against target shares, not
audience growth or brand quality. One next-focus sentence replaces the old four
metrics and per-goal bars; Brand progress owns the full analysis. Missing data
shows no score or needle. Ready owns posting assets and the posting form, not
restart controls or a second history list. The shared timeline owns package
history; Runs owns all advanced restarts. Distinct review warnings are retained
in one review-notes area, including on posted records.

`automation.js` supplies one explanation of configured cutoffs and no-answer
defaults. Home shows the current consequence; decision pages use a compact
disclosure so the primary action stays visible on phones. The full week explains
strategy/story/opinion/review defaults, manual posting, results and monthly review.
Times use the author's timezone. Schedule checks are roughly every two hours and
GitHub can delay them: a cutoff is not an exact task start. Manual packages pause
deadline choices, not the engine steps that follow an explicit choice. Recorded
send failures or inbox-check failures can pause email-dependent choices; matching
late-send records can extend a reply window by 24 hours. The UI does not change
these engine rules or claim that SMTP acceptance proves inbox receipt.

The dashboard reads only the loaded post memory and goal ledger. History,
archived rows, future weeks, and posts before `calibration_start` are excluded;
only ready, posted and measured posts count. Goal actuals and mix fit use the
last twelve weeks; post count, median saves and rating use the fresh-start
record through the viewed week. Saves compare day-7 results only, never mixing
them with day-2 results. Missing values stay missing, including empty
ledgers. Target shares come from the ledger. The calculation is explained in
the dashboard's native disclosure.

The status surface has moving material and lighting; the shared automation
component owns deadline information. Ribbon, meter needle and status entry are one coordinated
transform/opacity sequence under 300 ms. Goal focus links bars, weekly dots and
post rows without recalculating totals; each weekly post dot opens its recorded
details. Keyboard focus updates without entrance effects. Successful saves show
a temporary check without changing the button label or dimensions. Active
effects cancel immediately when reduced motion is enabled.

Pointer navigation uses the browser's View Transitions API when available:
the old workspace exits in 192 ms while the new one enters in 240 ms, using
transform and opacity only. Other browsers get the visible content-entrance
fallback. The sidebar stays in place. Keyboard navigation and reduced motion
update immediately. Rapid navigation skips older transitions; background polls
do not replay page entrances.

Native disclosures, opened editors and added form rows have pointer-triggered
feedback through `bindPageMotion`; view events and observers are cleaned up on
navigation. Goal focus, save confirmation and the bounded status canvas remain
active on their respective pages. The recorded preview includes navigation
through Brand, Inputs, Runs and Posts as well as the status and chart interactions.

Run `node app/operations.test.mjs` from the repository root and
`npm run --prefix app test:ui` for mocked browser regressions. The browser suite
captures the populated and empty dashboard at 1440 px and 390 px in both themes,
tests 320 px long content, and verifies reduced motion and canvas cleanup.
For the recorded interaction preview test, install Playwright's optional encoder
once with `npx playwright install ffmpeg` from `app/`. It is test tooling, not an
application dependency. The recording is `app/test-results/week-motion-preview.webm`.
Screenshots are written to `app/test-results/` and are not publication assets.