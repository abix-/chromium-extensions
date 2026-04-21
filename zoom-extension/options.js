// Single setting today: block YouTube's fullscreen
// scroll-to-more-videos behavior. Default on — that's the
// behavior users installing this extension typically want.
const DEFAULTS = {
  blockFullscreenScroll: true
};

const statusEl = document.getElementById("status");
const checkbox = document.getElementById("block-fullscreen-scroll");

function flashStatus(text) {
  statusEl.textContent = text;
  clearTimeout(flashStatus.timer);
  flashStatus.timer = setTimeout(() => {
    statusEl.textContent = "";
  }, 1500);
}

chrome.storage.sync.get(DEFAULTS).then((settings) => {
  checkbox.checked = !!settings.blockFullscreenScroll;
});

checkbox.addEventListener("change", () => {
  chrome.storage.sync.set({
    blockFullscreenScroll: checkbox.checked
  }).then(() => {
    flashStatus(checkbox.checked ? "Saved: blocking ON" : "Saved: blocking OFF");
  });
});
