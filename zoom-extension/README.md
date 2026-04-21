# zoom-extension

Small Chrome MV3 extension that improves YouTube-only mouse
behavior in two ways.

## What it does

**1. Zoom & pan the video.**  Hold **Shift+Alt** and scroll the
mouse wheel to zoom in / out; move the mouse (still holding
Shift+Alt) to pan. Current zoom percentage flashes in a badge
top-right.

**2. Block YouTube's scroll-to-preview on thumbnails.**  YouTube
hijacks the mouse wheel when you hover over a thumbnail — instead
of scrolling the page it scrubs a video preview. This extension
intercepts that behavior so the wheel scrolls the page like
normal, while preserving the zoom shortcut above.

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
