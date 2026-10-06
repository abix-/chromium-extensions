// The rating bar. On YouTube it is a declared content script and shows only
// on videos Stumble opened; on any other site the service worker injects it
// into the stumble tab. Reports how long the viewer actually watched (video
// play time) or read (time the page was visible).
(() => {
  // Injected again when the page reloads inside the same document; once is enough.
  if (window.__stumbleBar) return;
  window.__stumbleBar = true;
  const TAG = "[Stumble page]";
  const REPORT_EVERY_MS = 15000;
  const isYouTube = location.hostname === "www.youtube.com";
  let entry = null;
  let bar = null;
  let watchedSec = 0;
  let lastTime = null;

  const send = (msg) =>
    chrome.runtime.sendMessage(msg).catch((e) => console.error(TAG, msg.type, e.message));

  function report(final) {
    if (entry) void send({ type: "watch", id: entry.id, watchedSec, final });
  }

  // Counts real playing time: a jump forward or back is a seek, not watching.
  function onTimeUpdate(e) {
    const t = e.target.currentTime;
    if (lastTime !== null && t > lastTime && t - lastTime < 2) watchedSec += t - lastTime;
    lastTime = t;
  }

  function button(label, onClick) {
    const b = document.createElement("button");
    b.textContent = label;
    // all:initial keeps the page's own styles from reshaping the bar.
    b.style.cssText =
      "all:initial;margin-left:8px;padding:6px 12px;border-radius:16px;border:1px solid #888;background:#222;color:#fff;cursor:pointer;font:14px system-ui";
    b.addEventListener("click", onClick);
    return b;
  }

  function render() {
    bar?.remove();
    bar = null;
    // Once rated, the bar gets out of the way; ratings can still be changed
    // from the history page. Watch time keeps counting either way.
    if (!entry || entry.rating) return;
    bar = document.createElement("div");
    bar.style.cssText =
      "all:initial;position:fixed;left:16px;bottom:16px;z-index:99999;display:flex;align-items:center;max-width:70vw;" +
      "padding:8px 12px;border-radius:24px;background:rgba(15,15,15,.92);color:#fff;font:14px system-ui;box-shadow:0 2px 12px rgba(0,0,0,.5)";
    const why = document.createElement("span");
    why.textContent = `Stumble: ${entry.reason}`;
    why.style.cssText = "all:initial;color:#fff;font:14px system-ui;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    const like = button("Like", async () => {
      // If the like did not save, keep the bar so it can be pressed again.
      entry = (await send({ type: "rate", id: entry.id, rating: "like" })) ?? entry;
      render();
    });
    const skip = button("Not for me", async () => {
      await send({ type: "rate", id: entry.id, rating: "skip" });
      report(true);
      await send({ type: "next" });
    });
    const next = button("Next", async () => {
      report(true);
      await send({ type: "next" });
    });
    bar.append(why, like, skip, next);
    document.body.append(bar);
  }

  async function onPage() {
    report(true);
    entry = null;
    watchedSec = 0;
    lastTime = null;
    if (isYouTube) {
      const videoId = location.pathname === "/watch" ? new URLSearchParams(location.search).get("v") : null;
      if (videoId) entry = await send({ type: "current", videoId });
    } else {
      entry = await send({ type: "current", url: location.href });
    }
    render();
  }

  if (isYouTube) {
    document.addEventListener("timeupdate", (e) => {
      if (entry && e.target instanceof HTMLVideoElement) onTimeUpdate(e);
    }, true);
    // YouTube changes pages without reloading; this event fires after each.
    document.addEventListener("yt-navigate-finish", () => void onPage());
  } else {
    setInterval(() => {
      if (entry && document.visibilityState === "visible") watchedSec++;
    }, 1000);
  }
  window.addEventListener("pagehide", () => report(true));
  setInterval(() => report(false), REPORT_EVERY_MS);
  void onPage();
})();
