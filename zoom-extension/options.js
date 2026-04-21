// Single setting today: block YouTube's inline-playback
// hover-preview on thumbnail elements. Default on — that's the
// behavior users installing this extension typically want.
const DEFAULTS = {
  blockHoverPreview: true
};

const statusEl = document.getElementById("status");
const checkbox = document.getElementById("block-hover-preview");

function flashStatus(text) {
  statusEl.textContent = text;
  clearTimeout(flashStatus.timer);
  flashStatus.timer = setTimeout(() => {
    statusEl.textContent = "";
  }, 1500);
}

chrome.storage.sync.get(DEFAULTS).then((settings) => {
  checkbox.checked = !!settings.blockHoverPreview;
});

checkbox.addEventListener("change", () => {
  chrome.storage.sync.set({
    blockHoverPreview: checkbox.checked
  }).then(() => {
    flashStatus(checkbox.checked ? "Saved: blocking ON" : "Saved: blocking OFF");
  });
});
