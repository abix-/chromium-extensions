# zoom-extension

Small Chrome MV3 extension that improves YouTube-only mouse
behavior in two ways.

## What it does

**1. Zoom & pan the video.**  Hold **Shift+Alt** and scroll the
mouse wheel to zoom in / out; move the mouse (still holding
Shift+Alt) to pan. Current zoom percentage flashes in a badge
top-right.

**2. Block "scroll for more videos" in fullscreen.**  YouTube's
new fullscreen UI reveals a "more videos" grid when you scroll
the mouse wheel (or press Page Up / Page Down) while watching
fullscreen. This extension intercepts wheel + PgUp/PgDn events
while the browser is in fullscreen so that gesture no longer
scrolls the recommendation grid into view. The Shift+Alt zoom
shortcut (above) is preserved — wheel events with both modifiers
held pass through untouched.

Technique (matches what the established userscripts use):
listen for `fullscreenchange` → on enter, attach capture-phase
`wheel` + `keydown` listeners on `window` that call
`preventDefault()` → on exit, detach and restore the saved
scroll position. Also CSS-hides `.ytp-fullerscreen-edu-button`
(the "scroll for more videos" hint button) and
`.ytp-fullscreen-grid` as a belt-and-braces guard.

Toggle the blocker in the extension's options page
(`chrome://extensions/` → this extension → **Details** →
**Extension options**). Default: **on**.

## Install (developer mode)

1. `chrome://extensions/` → **Developer mode** (top right) →
   **Load unpacked**.
2. Point at this directory (`chromium-extensions/zoom-extension`).

No build step — pure JS. Reload the extension after editing
`content.js`.

## Files

- [`manifest.json`](manifest.json) — MV3 manifest. Requests
  `storage` permission for the options toggle.
- [`content.js`](content.js) — the zoom/pan handlers + the
  capture-phase wheel listener that blocks YouTube's
  scroll-to-preview handler.
- [`options.html`](options.html) + [`options.js`](options.js) —
  single-checkbox options page persisted via
  `chrome.storage.sync`.

## License

GPL-3.0-or-later (inherits from the repo root). See
[../LICENSE](../LICENSE).
