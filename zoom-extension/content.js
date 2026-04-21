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

  // Listen for wheel events (with passive: false so we can call preventDefault).
  document.addEventListener("wheel", handleWheel, { passive: false });
  // Listen for mouse move events to handle panning.
  document.addEventListener("mousemove", handleMouseMove, false);

  // -----------------------------------------------------------------
  // YouTube fullscreen scroll-to-more-videos blocker (per-user).
  //
  // YouTube's fullscreen UI reveals a "more videos" grid when the
  // user scrolls the mouse wheel while watching fullscreen.
  //
  // Pattern adapted from hempe/youtubeNoScrollForDetails (the
  // Chrome Web Store extension that handles this). Verified by
  // reading its source:
  //
  //   1. Single always-on capture-phase wheel listener on window.
  //      No fullscreenchange dance — just check
  //      `document.fullscreenElement` inside the handler.
  //   2. Only block when the wheel target is inside
  //      `.html5-video-player` (the YouTube player container).
  //      Wheel events outside that element (e.g. on other OSes
  //      where the browser UI stays visible) pass through.
  //   3. Pass through wheel events inside `.ytp-panel-menu` (the
  //      settings menu — resolution / playback speed / subtitles
  //      need wheel scroll to work).
  //   4. Call BOTH `preventDefault()` and
  //      `stopImmediatePropagation()` — YouTube's own wheel
  //      handler is attached inside the player and will still
  //      fire without the stopImmediate.
  //
  // Plus one targeted CSS rule: hide
  // `.ytp-fullscreen-grid-buttons-container` — the button
  // container YouTube inserts in fullscreen for the "scroll for
  // more videos" affordance.
  //
  // Zoom preserved: wheel events with Shift+Alt held bypass the
  // block so the extension's own zoom still works in fullscreen.
  //
  // Setting: `chrome.storage.sync.blockFullscreenScroll` (default
  // true). Changes apply live via `storage.onChanged`.
  // -----------------------------------------------------------------
  const FULLSCREEN_CSS = `
    .ytp-fullscreen-grid-buttons-container {
      display: none !important;
    }
  `;
  const STYLE_ID = "hush-zoom-fullscreen-scroll-blocker";

  let blockFullscreenScroll = true;

  function isInside(node, selector) {
    return (
      node instanceof Element &&
      (node.matches(selector) || node.closest(selector) !== null)
    );
  }

  window.addEventListener(
    "wheel",
    (e) => {
      if (!blockFullscreenScroll) return;
      if (!document.fullscreenElement) return;
      if (!isInside(e.target, ".html5-video-player")) return;
      // Settings menu (resolution, playback speed) needs wheel.
      if (isInside(e.target, ".ytp-panel-menu")) return;
      // Preserve the Shift+Alt zoom shortcut.
      if (e.shiftKey && e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    { capture: true, passive: false }
  );

  function applyStyle(enabled) {
    const existing = document.getElementById(STYLE_ID);
    if (enabled) {
      if (existing) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = FULLSCREEN_CSS;
      (document.documentElement || document.body || document.head).appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  }

  try {
    chrome.storage.sync.get({ blockFullscreenScroll: true }).then((s) => {
      blockFullscreenScroll = !!s.blockFullscreenScroll;
      applyStyle(blockFullscreenScroll);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.blockFullscreenScroll) {
        blockFullscreenScroll = !!changes.blockFullscreenScroll.newValue;
        applyStyle(blockFullscreenScroll);
      }
    });
  } catch (e) {
    // Extension context gone; keep default on.
    applyStyle(true);
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