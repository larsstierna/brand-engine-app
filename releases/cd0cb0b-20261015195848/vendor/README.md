# Vendored browser assets

Geist, Source Serif 4 and the Lucide subset are used by the UI. Anime.js,
AutoAnimate and the complete Lucide bundle remain staged, not loaded.
The app still has no build step or new runtime npm dependencies. Existing
`js-yaml.mjs` and `js-yaml.LICENSE` were left unchanged.

| Library / npm package | Version | Local file | License notice |
| --- | --- | --- | --- |
| Anime.js / `animejs` | 4.5.0 | `anime.esm.min.js` | MIT, `anime.LICENSE` |
| AutoAnimate / `@formkit/auto-animate` | 0.10.0 | `auto-animate.mjs` | MIT, `auto-animate.LICENSE` |
| Lucide / `lucide` | 1.57.0 | `lucide.min.js` | ISC and bundled Feather MIT notices, `lucide.LICENSE` |
| Lucide subset / `lucide` | 1.57.0 | `../js/icons.js` | ISC and bundled Feather MIT notices, `lucide.LICENSE` |
| Geist / `geist` | 1.7.2 | `fonts/geist-variable.woff2` | SIL OFL 1.1, `fonts/geist.LICENSE` |
| Source Serif 4 / `@fontsource/source-serif-4` | 5.3.1 | `fonts/source-serif-4-*.woff2` | SIL OFL 1.1, `fonts/source-serif-4.LICENSE` |

## File selection

- Anime.js is the standalone ESM bundle from `dist/bundles/anime.esm.min.js`.
- AutoAnimate is the standalone `index.mjs` distribution.
- `lucide.min.js` is the official `dist/umd/lucide.min.js` browser bundle, kept
  for reference but not loaded. The UI uses `js/icons.js`: ten selected official
  icon node definitions, with adjacent same-type paths combined without changing
  coordinates. It produces escaped SVG markup. Templates use `raw(icon(...))`.
- Geist is the variable upright font, copied from
  `dist/fonts/geist-sans/Geist-Variable.woff2` without modifying the font bytes.
- Source Serif 4 includes Latin and Latin Extended subsets, normal weights
  400/600/700 and italic weight 400. When integrating, use separate `@font-face`
  declarations and the upstream Fontsource unicode ranges for these subsets.
  The active `@font-face` declarations live in `styles.css`. Extra weights,
  italic and extended-subset files remain available for future integration.

UI motion uses browser-native Web Animations through `js/motion.js`, limited to
transform and opacity under 300 ms. The status orb uses a bounded 2D canvas
with a CSS fallback; no extra package is needed. It stops when offscreen or on a
hidden tab and draws a still frame for reduced motion. Neither Anime.js nor
AutoAnimate is currently imported, so no library adds automatic layout motion.

## Provenance and integrity

Downloaded on 2026-10-15 with `npm pack <package>@<version> --ignore-scripts`
outside the project. Each archive's SHA-512 was checked against the npm registry's
`dist.integrity` value before extraction. Browser assets and license notices
were copied byte-for-byte from those archives.

| Package archive | Verified SHA-512 integrity |
| --- | --- |
| [animejs-4.5.0.tgz](https://registry.npmjs.org/animejs/-/animejs-4.5.0.tgz) | `sha512-NQimYX+lz8WaXonGS9zVVoviCIAjONeJayxacUditaivYLqyXgGjFKjuyl0aUUhFKm5MriX9ty1TGovNzoJQWA==` |
| [auto-animate-0.10.0.tgz](https://registry.npmjs.org/@formkit/auto-animate/-/auto-animate-0.10.0.tgz) | `sha512-KGomRttjUfORuPUaR/ZGQw+6xfMrTM+sxnILv7JAd9AmabU9rg9i6gF/iC0Ih+QpKCubJpCA/1DX9UHKE8cX+A==` |
| [lucide-1.57.0.tgz](https://registry.npmjs.org/lucide/-/lucide-1.57.0.tgz) | `sha512-M2BHuzBxnD+5AiJzEXwWxswwz0MXoQPQcehoIJAgi0Lqe0i4/kksKaHx2R+UWRAbQhjTvucCDG6sBg/TqIwa8Q==` |
| [geist-1.7.2.tgz](https://registry.npmjs.org/geist/-/geist-1.7.2.tgz) | `sha512-Gu5lDFa3pLRyoBlBPf0QIFHVdWAnpco7fS1bJm41jyLPFoguBgiubseUN2oLXMgqZ7uxAxDoXcHMhCY/fOTTgg==` |
| [source-serif-4-5.3.1.tgz](https://registry.npmjs.org/@fontsource/source-serif-4/-/source-serif-4-5.3.1.tgz) | `sha512-cWcTCXjYYrgF9A67fThVir1VSc0lPEYmwQ6jA4pPt01s2MSCi/maINUcZoCzaqnU8fyUReDO97eGcBUkHgOeug==` |

To update, review the exact release, download with lifecycle scripts disabled,
verify integrity, replace only the needed distributions and license files, and
update this inventory. Check JavaScript syntax, test fonts in a browser, run
`node app/operations.test.mjs` and `npm run --prefix app test:ui`, and review the
diff before committing. Publishing remains a separate, explicit operation via
`publish-frontend.ps1`, which copies this directory recursively.