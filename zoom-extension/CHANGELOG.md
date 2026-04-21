# Changelog

Per-change rollout notes for the `zoom-extension`. Entries are
newest-first. File seeded 2026-04-21; earlier state predates it
and lives in git history + the iteration trail inside
`content.js` comments.

## [Unreleased]

### Changed

- **Video re-zoom on AJAX navigation now uses a `loadedmetadata`
  listener** instead of a 1 Hz `setInterval`. Previous behavior
  polled `document.querySelector("video")` every second forever
  on every YouTube tab; new behavior fires exactly when a fresh
  video track becomes ready. Identity-zoom (scale=1, default
  origin) takes a fast-path that returns immediately. See
  `content.js:198-224`.
- **content.css gains a rename-gate comment.** `.ytp-fullscreen-grid*`
  class names are YouTube-internal and rename annually. The
  comment block at the top of `content.css` now explicitly points
  at `README.md:29-32` as the other place to update in lockstep,
  so a rename isn't a silent drift.

## Policy

- One entry per user-visible or maintainer-visible change. Code
  golf doesn't earn a line.
- Close every entry to a file:line pointer so future-you can
  verify what shipped.
