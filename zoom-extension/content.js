(() => {
  // Create a badge to display the current zoom percentage.
  const badge = document.createElement("div");
  Object.assign(badge.style, {
    position: "fixed",
    top: "10px",
    right: "10px",
    background: "rgba(0, 0, 0, 0.7)",
    color: "white",
    padding: "5px 10px",
    borderRadius: "4px",
    fontSize: "14px",
    zIndex: "9999",
    display: "none"
  });
  document.body.appendChild(badge);

  // Initialize zoom parameters.
  let scale = 1;
  const minScale = 0.5;
  const maxScale = 10.0;
  const scaleStep = 0.1;
  // Store the current panning transform origin percentages.
  let currentOriginX = 50;
  let currentOriginY = 50;

  // Utility: Show the badge with current zoom percentage.
  function showBadge() {
    badge.textContent = `Zoom: ${(scale * 100).toFixed(0)}%`;
    badge.style.display = "block";
    clearTimeout(badge.hideTimeout);
    badge.hideTimeout = setTimeout(() => {
      badge.style.display = "none";
    }, 1500);
  }

  // Utility: Apply zoom to the video element with a given transform origin.
  // The fourth parameter (showBadgeFlag) determines whether to show the badge (default: true).
  function applyZoom(video, originXPercent = 50, originYPercent = 50, showBadgeFlag = true) {
    video.style.transformOrigin = `${originXPercent}% ${originYPercent}%`;
    video.style.transform = `scale(${scale})`;
    if (showBadgeFlag) {
      showBadge();
    }
  }

  // Get the first video element on the page.
  function getVideoElement() {
    return document.querySelector("video");
  }

  // Mouse wheel handler: When Shift+Alt are held down, adjust zoom.
  function handleWheel(e) {
    // Only run if both Shift and Alt are pressed.
    if (!(e.shiftKey && e.altKey)) return;
    e.preventDefault();
    const video = getVideoElement();
    if (!video) return;

    // Determine mouse position relative to the video element.
    const rect = video.getBoundingClientRect();
    const mouseXPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseYPercent = ((e.clientY - rect.top) / rect.height) * 100;

    // Adjust scale based on wheel direction.
    if (e.deltaY < 0) {
      scale = Math.min(scale + scaleStep, maxScale);
    } else {
      scale = Math.max(scale - scaleStep, minScale);
    }
    // Update stored origin values based on mouse position.
    currentOriginX = mouseXPercent;
    currentOriginY = mouseYPercent;
    applyZoom(video, currentOriginX, currentOriginY);
  }

  // Mouse move handler: When Shift+Alt are held down, pan to the mouse position.
  function handleMouseMove(e) {
    if (!(e.shiftKey && e.altKey)) return;
    const video = getVideoElement();
    if (!video) return;

    // Calculate the mouse position relative to the video element.
    const rect = video.getBoundingClientRect();
    const mouseXPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const mouseYPercent = ((e.clientY - rect.top) / rect.height) * 100;

    // Update stored origin values.
    currentOriginX = mouseXPercent;
    currentOriginY = mouseYPercent;
    // Update the transform origin (panning) without showing the badge.
    applyZoom(video, currentOriginX, currentOriginY, false);
  }

  // Listen for mouse move events to handle panning.
  document.addEventListener("mousemove", handleMouseMove, false);

  // -----------------------------------------------------------------
  // YouTube fullscreen grid remover + wheel blocker (per-user).
  //
  // YouTube's fullscreen UI inserts a "more videos" grid
  // (`.ytp-fullscreen-grid` and children) when the user scrolls.
  // Two-layer defense:
  //
  //   1. DOM removal via MutationObserver. Every time YouTube
  //      inserts a grid element, we delete it immediately. No
  //      chance for it to render, no event handlers hanging off
  //      it, no re-triggering on subsequent wheels.
  //   2. Capture-phase wheel blocker on window. Prevents YouTube
  //      from even reacting to the wheel event in the first
  //      place, because if YouTube's handler runs it may insert
  //      the grid between our MutationObserver ticks.
  //
  // Zoom handled inline in the same capture handler — we do the
  // zoom math here and call stopImmediatePropagation so YouTube
  // never sees the event, ensuring Shift+Alt+wheel doesn't also
  // trigger the grid.
  //
  // Pattern refs:
  //   https://github.com/hempe/youtubeNoScrollForDetails
  // (plus the user-observed `.ytp-fullscreen-grid-stills-container`
  //  element that confirms the grid hierarchy.)
  //
  // Setting: `chrome.storage.sync.blockFullscreenScroll` (default
  // true). Changes apply live via `storage.onChanged`.
  // -----------------------------------------------------------------
  const GRID_SELECTOR = [
    ".ytp-fullscreen-grid",
    ".ytp-fullscreen-grid-stills-container",
    ".ytp-fullscreen-grid-buttons-container"
  ].join(",");

  let blockFullscreenScroll = true;

  function isInside(node, selector) {
    return (
      node instanceof Element &&
      (node.matches(selector) || node.closest(selector) !== null)
    );
  }

  function removeGridElements() {
    if (!blockFullscreenScroll) return;
    const nodes = document.querySelectorAll(GRID_SELECTOR);
    for (const n of nodes) {
      n.remove();
    }
  }

  // Unified capture-phase wheel handler. Runs BEFORE any of
  // YouTube's handlers can react. Does three jobs:
  //   a) If the Shift+Alt zoom combo is held, do the zoom math
  //      inline and eat the event so YouTube doesn't also fire.
  //   b) If we're fullscreen over the player (and not inside the
  //      settings menu), eat the event so the grid never tries
  //      to reveal.
  //   c) Otherwise pass through (normal page scroll, etc).
  window.addEventListener(
    "wheel",
    (e) => {
      const isZoomCombo = e.shiftKey && e.altKey;

      if (isZoomCombo) {
        // Zoom inline so we don't need the separate document-
        // level handler (that one couldn't see the event in
        // fullscreen once we're calling stopImmediatePropagation
        // here).
        try { handleWheel(e); } catch (_) {}
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      if (!blockFullscreenScroll) return;
      if (!document.fullscreenElement) return;
      if (!isInside(e.target, ".html5-video-player")) return;
      // Settings menu (resolution, playback speed) needs wheel.
      if (isInside(e.target, ".ytp-panel-menu")) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      // Also sweep the DOM now — if YouTube's handler ran earlier
      // this page load, the grid may already be in the DOM even
      // though it's not visible. Cheap sanity.
      removeGridElements();
    },
    { capture: true, passive: false }
  );

  // MutationObserver: kill any grid element the moment YouTube
  // inserts it. Observes the whole document because YouTube may
  // mount the grid as a descendant of the player OR as a sibling
  // of the player's container, depending on layout version.
  let gridObserver = null;
  function startGridObserver() {
    if (gridObserver) return;
    gridObserver = new MutationObserver(removeGridElements);
    gridObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    // Initial sweep in case the grid was inserted before the
    // observer was attached (content_scripts run at document_end).
    removeGridElements();
  }
  function stopGridObserver() {
    if (!gridObserver) return;
    gridObserver.disconnect();
    gridObserver = null;
  }

  function applyBlocker(enabled) {
    blockFullscreenScroll = !!enabled;
    if (blockFullscreenScroll) {
      startGridObserver();
    } else {
      stopGridObserver();
    }
  }

  try {
    chrome.storage.sync.get({ blockFullscreenScroll: true }).then((s) => {
      applyBlocker(!!s.blockFullscreenScroll);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.blockFullscreenScroll) {
        applyBlocker(!!changes.blockFullscreenScroll.newValue);
      }
    });
  } catch (e) {
    // Extension context gone; default behavior stays on.
    applyBlocker(true);
  }
 
  // Reapply zoom when full-screen mode changes.
  document.addEventListener("fullscreenchange", () => {
    const video = getVideoElement();
    if (video) applyZoom(video, currentOriginX, currentOriginY);
  });

  // In case YouTube (or a similar site) loads a new video (AJAX navigation),
  // poll for the video element and reapply the zoom using the stored panning values.
  setInterval(() => {
    const video = getVideoElement();
    if (
      video &&
      (video.style.transform !== `scale(${scale})` ||
       video.style.transformOrigin !== `${currentOriginX}% ${currentOriginY}%`)
    ) {
      applyZoom(video, currentOriginX, currentOriginY, false); // Pass false to avoid showing the badge
    }    
  }, 1000);
})();