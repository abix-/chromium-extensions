import { learn } from "./learn.js";
import { interests, emptyFactors } from "./profile.js";
import { mergeOptions, sourceShares } from "./stumble.js";

const TOP = 25;
const $ = (id) => document.getElementById(id);
const rows = () => document.querySelectorAll("tr[data-source]");

// This page is the only writer of `options`.
async function loadOptions() {
  const { options } = await chrome.storage.local.get("options");
  return mergeOptions(options);
}

function renderShares(options) {
  const shares = sourceShares(options);
  const none = Object.values(shares).every((s) => s === 0);
  for (const row of rows()) {
    row.querySelector("[data-pct]").textContent = none ? "nothing on" : `${Math.round(shares[row.dataset.source] * 100)}% of presses`;
  }
}

async function renderOptions() {
  const options = await loadOptions();
  $("surprise").value = Math.round(options.surprise * 100);
  $("surpriseValue").textContent = `${$("surprise").value}% surprise`;
  for (const row of rows()) {
    const s = options.sources[row.dataset.source];
    row.querySelector("[data-on]").checked = s.on;
    row.querySelector("[data-share]").value = Math.round(s.share * 100);
    for (const box of row.querySelectorAll("[data-form]")) box.checked = Boolean(s.forms[box.dataset.form]);
  }
  renderShares(options);
}

// A dragged slider fires many changes at once; one at a time, so two
// overlapping saves cannot overwrite each other.
let saving = Promise.resolve();
function saveOptions(change) {
  saving = saving
    .then(async () => {
      const options = await loadOptions();
      change(options);
      await chrome.storage.local.set({ options });
      return options;
    })
    .catch((e) => console.error("[Stumble options]", e));
  return saving;
}

// Every control in a source's row writes to that source only.
async function saveRow(row, change) {
  const options = await saveOptions((o) => change(o.sources[row.dataset.source]));
  if (options) renderShares(options);
}

for (const row of rows()) {
  // Each value is read when the event fires, not when its save runs.
  row.querySelector("[data-on]").addEventListener("change", (e) => {
    const on = e.target.checked;
    void saveRow(row, (s) => (s.on = on));
  });
  row.querySelector("[data-share]").addEventListener("input", (e) => {
    const share = Number(e.target.value) / 100;
    void saveRow(row, (s) => (s.share = share));
  });
  for (const box of row.querySelectorAll("[data-form]")) {
    box.addEventListener("change", () => {
      const checked = box.checked;
      void saveRow(row, (s) => (s.forms[box.dataset.form] = checked));
    });
  }
}

$("surprise").addEventListener("input", () => {
  const value = Number($("surprise").value);
  $("surpriseValue").textContent = `${value}% surprise`;
  void saveOptions((o) => (o.surprise = value / 100));
});

function fillList(list, rows) {
  list.replaceChildren(
    ...rows.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );
}

function renderPrime(prime) {
  if (!prime) return;
  if (prime.titles.length === 0) {
    $("primeSummary").textContent = "Prime Video: watch history is empty.";
    return;
  }
  const count = (type) => prime.titles.filter((t) => t.type === type).length;
  const oldest = Math.min(...prime.titles.map((t) => t.firstWatched));
  $("primeSummary").textContent =
    `Prime Video: ${prime.titles.length} titles (${count("movie")} movies, ${count("season")} TV seasons), ` +
    `watched since ${new Date(oldest).toLocaleDateString()}. Read ${new Date(prime.learnedAt).toLocaleString()}.`;
}

async function renderLearned() {
  const { profile, factors, prime } = await chrome.storage.local.get(["profile", "factors", "prime"]);
  renderPrime(prime);
  if (!profile) return;
  const when = new Date(profile.learnedAt).toLocaleString();
  $("summary").textContent =
    `Learned ${when} from ${profile.historyCount} watched videos and ${profile.subscriptionCount} subscriptions: ` +
    `${Object.keys(profile.channels).length} channels, ${Object.keys(profile.topics).length} topics.`;
  const { channels, topics } = interests(profile, factors ?? emptyFactors());
  const top = (xs) => [...xs].sort((a, b) => b.weight - a.weight).slice(0, TOP);
  fillList($("channels"), top(channels).map((c) => c.name));
  fillList($("topics"), top(topics).map((t) => t.term));
}

$("learn").addEventListener("click", async () => {
  $("learn").disabled = true;
  try {
    const errors = await learn((text) => ($("learnStatus").textContent = text));
    const failed = Object.entries(errors).map(([name, message]) => `${name} failed: ${message}`);
    $("learnStatus").textContent = failed.length > 0 ? `Done, but ${failed.join(". ")}` : "Done.";
    await renderLearned();
  } catch (e) {
    console.error("[Stumble options]", e);
    $("learnStatus").textContent = `Learn failed: ${e.message}`;
  } finally {
    $("learn").disabled = false;
  }
});

void renderOptions();
void renderLearned();
