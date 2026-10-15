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

The weekly decision, package controls and progress records keep their original
actions. The front page adds an animated decision ribbon, a bounded status canvas,
and a read-only brand dashboard. Shared light/dark tokens and self-hosted fonts
live in `styles.css`; no CDN, framework or build step is required.

The dashboard reads only the loaded post memory and goal ledger. History,
archived rows, future weeks, and posts before `calibration_start` are excluded;
only ready, posted and measured posts count. Goal actuals and mix fit use the
last twelve weeks; post count, median saves and rating use the fresh-start
record through the viewed week. Saves compare day-7 results only, never mixing
them with day-2 results. Missing values stay missing, including empty
ledgers. Target shares come from the ledger. The calculation is explained in
the dashboard's native disclosure.

The status surface has moving material and lighting, with a deadline plaque only
for a configured decision deadline. Ribbon and status entry are one coordinated
transform/opacity sequence under 300 ms. Goal focus links bars, weekly dots and
post rows without recalculating totals; each weekly post dot opens its recorded
details. Keyboard focus updates without entrance effects. Successful saves show
a temporary check without changing the button label or dimensions. Active
effects cancel immediately when reduced motion is enabled.

Run `node app/operations.test.mjs` from the repository root and
`npm run --prefix app test:ui` for mocked browser regressions. The browser suite
captures the populated and empty dashboard at 1440 px and 390 px in both themes,
tests 320 px long content, and verifies reduced motion and canvas cleanup.
For the recorded interaction preview test, install Playwright's optional encoder
once with `npx playwright install ffmpeg` from `app/`. It is test tooling, not an
application dependency. The recording is `app/test-results/week-motion-preview.webm`.
Screenshots are written to `app/test-results/` and are not publication assets.