# zoom-extension

Small Chrome / Brave MV3 extension that fixes two YouTube-only
annoyances.

## What it does

**1. Zoom & pan the video.**  Hold **Shift+Alt** and scroll the
mouse wheel to zoom in / out; move the mouse (still holding
Shift+Alt) to pan. Current zoom percentage flashes in a badge
top-right of the page.

**2. Block the "more videos" grid in fullscreen.**  YouTube's
fullscreen UI reveals a grid of recommended videos whenever you
scroll the mouse wheel (even a small nudge). The grid obscures
the video and auto-dismisses unpredictably. This extension kills
the grid entirely so fullscreen stays fullscreen.

## How the fullscreen grid block works

Two layers. The CSS layer does the visible work; the wheel layer
prevents YouTube from running its scroll-handler side effects.

**Layer 1. Manifest-injected CSS at `document_start`.**
[`content.css`](content.css) is applied before any YouTube
script runs. Exact-class selectors match the four grid elements:

```css
.ytp-fullscreen-grid
.ytp-fullscreen-grid-main-content
.ytp-fullscreen-grid-stills-container
.ytp-fullscreen-grid-buttons-container
```

Each gets `display: none !important`. YouTube may still insert
the elements into the DOM (we don't fight that) but they never
render, and the "scroll for more videos" button bar never
appears. Exact selectors only. Wildcard `[class*="..."]`
patterns accidentally match the player shell in current YouTube
layouts and cause a black fullscreen.

**Layer 2. Capture-phase wheel listener.**  A `wheel` listener
is registered on `window` in capture phase (before any of
YouTube's own handlers). When the user is fullscreen over the
`.html5-video-player` element (and not inside the
`.ytp-panel-menu` settings menu, which legitimately uses the
wheel), the handler calls `preventDefault()` +
`stopImmediatePropagation()`. YouTube's own wheel handler never
fires, so no scroll-triggered side effects happen at all.

**Zoom preserved.**  When `Shift+Alt` is held, the zoom math runs
inline in the same capture-phase handler and the event is still
preventDefault'd + stopImmediatePropagation'd. YouTube sees
nothing; you get zoom; grid stays hidden.

## Per-user toggle

The block is opt-out via the options page. `chrome://extensions/`
→ this extension → **Details** → **Extension options**. Default:
**on**.

The toggle lives in `chrome.storage.sync` so it syncs across
your Chrome profile. Implementation: CSS is gated on
`html:not(.hush-zoom-show-fullscreen-grid)`, so the default (no
class) hides the grid. When the user turns the block off,
[`content.js`](content.js) adds
`hush-zoom-show-fullscreen-grid` to `<html>` and the `:not()`
selector stops matching.

## Install (developer mode)

1. `chrome://extensions/` → **Developer mode** (top right) →
   **Load unpacked**.
2. Point at this directory (`chromium-extensions/zoom-extension`).

No build step. Pure JS + CSS. Reload the extension after
editing any file; hard-refresh any open YouTube tab (Ctrl+Shift+R)
since CSS from content-scripts can be cached.

## Files

- [`manifest.json`](manifest.json). MV3 manifest. Requests
  `storage` permission. Injects `content.css` at `document_start`
  and `content.js` at `document_end`.
- [`content.css`](content.css). The four grid selectors. Gated
  on the `html.hush-zoom-show-fullscreen-grid` class so the
  toggle works.
- [`content.js`](content.js). Zoom/pan handlers, capture-phase
  wheel blocker, storage listener that toggles the gating class.
- [`options.html`](options.html) + [`options.js`](options.js).
  single-checkbox options page.

## License

GPL-3.0-or-later (inherits from the repo root). See
[../LICENSE](../LICENSE).
