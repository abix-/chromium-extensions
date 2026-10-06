const MODE_NAMES = {
  familiar: "Familiar",
  related: "Related hop",
  neighbour: "Neighbour topic",
  liked: "Liked by others",
  wild: "Wild card",
};
const SOFT_NAMES = { softLike: "watched most of it", softSkip: "left right away" };

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

// Ratings go through the service worker, the only writer of stumbles.
function rateButton(entry, rating, label) {
  const on = entry.rating === rating;
  const b = el("button", { textContent: label, className: on ? `on ${rating}` : "" });
  b.addEventListener("click", () =>
    chrome.runtime.sendMessage({ type: "rate", id: entry.id, rating: on ? null : rating }),
  );
  return b;
}

function row(entry) {
  const watched = entry.durationSec > 0 ? `${mmss(entry.watchedSec)} of ${mmss(entry.durationSec)}` : mmss(entry.watchedSec);
  const soft = !entry.rating && entry.soft ? ` (counted as: ${SOFT_NAMES[entry.soft]})` : "";
  return el(
    "div",
    { className: "entry" },
    // Web pages have no thumbnail; a box with the site name takes its place.
    el(
      "a",
      { href: entry.url, target: "_blank" },
      entry.thumb ? el("img", { src: entry.thumb, alt: "" }) : el("div", { className: "site", textContent: entry.site }),
    ),
    el(
      "div",
      {},
      el("a", { href: entry.url, target: "_blank", className: "title", textContent: entry.title }),
      el("div", { textContent: entry.channelName }),
      el("div", { className: "muted", textContent: `${MODE_NAMES[entry.mode]}: ${entry.reason}` }),
      el("div", { className: "muted", textContent: `${new Date(entry.at).toLocaleString()}, watched ${watched}${soft}` }),
      el("div", { className: "rate" }, rateButton(entry, "like", "Like"), rateButton(entry, "skip", "Not for me")),
    ),
  );
}

async function render() {
  const { stumbles = [] } = await chrome.storage.local.get("stumbles");
  document.getElementById("count").textContent = `${stumbles.length} stumbles`;
  document.getElementById("list").replaceChildren(...[...stumbles].reverse().map(row));
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.stumbles) void render();
});
void render();
