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
  // YouTube scroll-to-preview blocker (per-user setting).
  //
  // YouTube attaches a wheel handler to thumbnail custom elements
  // (ytd-rich-item-renderer, ytd-video-renderer, etc.) that hijacks
  // mousewheel scrubbing to preview different frames of the video
  // on hover. Users who just want to scroll the page find this
  // disruptive.
  //
  // The fix: a capture-phase wheel listener fires BEFORE YouTube's
  // bubble-phase one. When the event target is inside a thumbnail
  // and the user isn't holding Shift+Alt (our zoom modifier), we
  // stopImmediatePropagation. That suppresses YouTube's handler
  // while leaving the browser default (page scroll) intact —
  // stopPropagation does not cancel the default action.
  //
  // Controlled by chrome.storage.sync.blockPreviewScroll (default:
  // true). Changes apply live via storage.onChanged.
  // -----------------------------------------------------------------
  const THUMBNAIL_SELECTOR = [
    "ytd-thumbnail",
    "ytd-rich-item-renderer",
    "ytd-rich-grid-media",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-panel-video-renderer",
    "yt-lockup-view-model",
    "yt-collection-thumbnail-view-model",
    "ytm-shorts-lockup-view-model-v2"
  ].join(",");

  let blockPreviewScroll = true;
  try {
    chrome.storage.sync.get({ blockPreviewScroll: true }).then((s) => {
      blockPreviewScroll = !!s.blockPreviewScroll;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.blockPreviewScroll) {
        blockPreviewScroll = !!changes.blockPreviewScroll.newValue;
      }
    });
  } catch (e) { /* extension context gone; leave default */ }

  document.addEventListener("wheel", (e) => {
    if (!blockPreviewScroll) return;
    // Leave the event alone when the user is trying to zoom —
    // the zoom handler above relies on seeing the wheel event.
    if (e.shiftKey && e.altKey) return;
    if (!e.target || typeof e.target.closest !== "function") return;
    if (e.target.closest(THUMBNAIL_SELECTOR)) {
      // Stops YouTube's bubble-phase handler from running. The
      // default browser scroll still fires because we don't
      // preventDefault.
      e.stopImmediatePropagation();
    }
  }, { capture: true });
 
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