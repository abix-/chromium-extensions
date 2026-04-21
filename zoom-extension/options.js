// Single setting today: block YouTube's scroll-to-preview feature
// on thumbnail elements. Default on — that's the behavior users
// installing this extension typically want.
const DEFAULTS = {
  blockPreviewScroll: true
};

const statusEl = document.getElementById("status");
const checkbox = document.getElementById("block-preview-scroll");

function flashStatus(text) {
  statusEl.textContent = text;
  clearTimeout(flashStatus.timer);
  flashStatus.timer = setTimeout(() => {
    statusEl.textContent = "";
  }, 1500);
}

chrome.storage.sync.get(DEFAULTS).then((settings) => {
  checkbox.checked = !!settings.blockPreviewScroll;
});

checkbox.addEventListener("change", () => {
  chrome.storage.sync.set({
    blockPreviewScroll: checkbox.checked
  }).then(() => {
    flashStatus(checkbox.checked ? "Saved: blocking ON" : "Saved: blocking OFF");
  });
});
