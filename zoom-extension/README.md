# zoom-extension

Small Chrome MV3 extension that improves YouTube-only mouse
behavior in two ways.

## What it does

**1. Zoom & pan the video.**  Hold **Shift+Alt** and scroll the
mouse wheel to zoom in / out; move the mouse (still holding
Shift+Alt) to pan. Current zoom percentage flashes in a badge
top-right.

**2. Block YouTube's hover-preview on thumbnails.**  YouTube's
"Inline Playback" feature auto-plays a muted video preview when
the cursor lingers over a thumbnail. When you scroll the page,
every thumbnail that passes under the cursor fires its own
preview — noisy and disruptive. This extension CSS-hides the
preview element (`ytd-video-preview` and friends) so thumbnails
stay static and scrolling is quiet.

Uses the same approach established uBlock Origin filters use:
`display: none !important` on the preview custom element. No
event interception, no race with YouTube's handlers.

Toggle the preview-blocking in the extension's options page
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
