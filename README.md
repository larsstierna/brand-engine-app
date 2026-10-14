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