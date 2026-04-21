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
  // YouTube hover-preview blocker (per-user setting).
  //
  // YouTube's "Inline Playback" feature auto-plays a muted video
  // preview when the cursor lingers over a thumbnail. The feature
  // is hover-triggered, not wheel-triggered — what users
  // experience as "scrolling shows previews" is actually the
  // cursor passing over new thumbnails as the page scrolls.
  //
  // The reliable fix (same one established uBlock Origin filter
  // lists use) is CSS: set `display: none !important` on the
  // preview custom element so YouTube can insert it but it never
  // renders and never starts the video. No event interception, no
  // race with YouTube's own wheel handlers.
  //
  // Canonical filter per the adblock community:
  //   youtube.com###preview > ytd-video-preview.style-scope
  //     .ytd-rich-grid-renderer
  // We broaden the selector set to catch preview elements on the
  // watch-page sidebar, search results, subscriptions grid, and
  // newer `yt-*-view-model` designs.
  //
  // Controlled by `chrome.storage.sync.blockHoverPreview` (default
  // true). Changes apply live via `storage.onChanged` by
  // inserting/removing the <style> element.
  // -----------------------------------------------------------------
  const HOVER_PREVIEW_CSS = `
    ytd-video-preview,
    ytd-thumbnail-overlay-loading-preview-renderer,
    #preview > ytd-video-preview,
    .ytd-video-preview,
    .ytd-thumbnail-overlay-loading-preview-renderer,
    yt-video-preview-view-model,
    yt-inline-video-player,
    .ytmPlayerFullBleedContainer [data-purpose="inline-preview"] {
      display: none !important;
    }
  `;
  const STYLE_ID = "hush-zoom-hover-preview-blocker";

  function applyPreviewBlocker(enabled) {
    const existing = document.getElementById(STYLE_ID);
    if (enabled) {
      if (existing) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = HOVER_PREVIEW_CSS;
      // documentElement is available at document_end; fallback to
      // body just in case.
      (document.documentElement || document.body || document.head).appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  }

  try {
    chrome.storage.sync.get({ blockHoverPreview: true }).then((s) => {
      applyPreviewBlocker(!!s.blockHoverPreview);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.blockHoverPreview) {
        applyPreviewBlocker(!!changes.blockHoverPreview.newValue);
      }
    });
  } catch (e) {
    // Extension context gone; apply the default so users still
    // benefit if the storage fetch fails.
    applyPreviewBlocker(true);
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