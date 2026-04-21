# zoom-extension

YouTube Zoom & Pan. Chrome MV3 content script that adds keyboard
shortcuts + mouse-wheel integration for zooming and panning
YouTube videos.

## Install (developer mode)

1. `chrome://extensions/` → **Developer mode** (top right) →
   **Load unpacked**.
2. Point at this directory (`chromium-extensions/zoom-extension`).

No build step — pure JS. Reload the extension after editing
`content.js`.

## What it does

Registered for `*://*.youtube.com/*`. Adds handlers to zoom and
pan the video element. See [content.js](content.js) for the full
shortcut list.

## License

GPL-3.0-or-later (inherits from the repo root). See
[../LICENSE](../LICENSE).
