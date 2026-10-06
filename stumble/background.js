import { watchUrl, thumbUrl } from "./youtube.js";
import { siteOf } from "./web.js";
import { applyRating, effectiveRating, emptyFactors } from "./profile.js";
import {
  mergeOptions,
  modeWeights,
  webModeWeights,
  pickSource,
  pickWeighted,
  pickOne,
  freshVideos,
  freshPages,
  accepts,
} from "./stumble.js";
import { finders } from "./finders.js";
import { webFinders, createCache } from "./webfinders.js";

const TAG = "[Stumble bg]";
const TRIES = 6;
const SOFT_LIKE_SHARE = 0.5;
const SOFT_LIKE_SEC = 600;
const SOFT_SKIP_SEC = 15;
// A web page has no length, so time spent on it decides alone.
const WEB_SOFT_LIKE_SEC = 120;
const WEB_SOFT_SKIP_SEC = 10;

const cached = createCache({
  get: async (key) => (await chrome.storage.local.get(`cache:${key}`))[`cache:${key}`],
  set: (key, record) => chrome.storage.local.set({ [`cache:${key}`]: record }),
});

// This worker is the only writer of `stumbles` and `factors`. Every change
// runs through this queue so two quick messages cannot overwrite each other.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch((e) => console.error(TAG, e));
  return run;
}

chrome.runtime.onInstalled.addListener(() => {
  // Keys from the first version, which used a typed topic list.
  void chrome.storage.local.remove(["topics", "seen", "last"]);
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "history", title: "Stumble history", contexts: ["action"] });
    chrome.contextMenus.create({ id: "options", title: "Learn and options", contexts: ["action"] });
  });
});

chrome.action.onClicked.addListener(() => void serial(stumble));

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "history") void chrome.tabs.create({ url: chrome.runtime.getURL("history.html") });
  if (info.menuItemId === "options") void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const handlers = { current, rate, watch, next: () => stumble() };
  const handler = handlers[msg.type];
  if (!handler) return false;
  serial(() => handler(msg)).then(reply, (e) => reply({ error: e.message }));
  return true;
});

async function load() {
  const s = await chrome.storage.local.get(["profile", "factors", "options", "stumbles", "watched"]);
  return {
    profile: s.profile,
    factors: { ...emptyFactors(), ...s.factors },
    options: mergeOptions(s.options),
    stumbles: s.stumbles ?? [],
    watched: new Set(s.watched ?? []),
    cached,
  };
}

const newEntry = (fields) => ({
  id: crypto.randomUUID(),
  at: Date.now(),
  watchedSec: 0,
  rating: null,
  soft: null,
  settled: false,
  ...fields,
});

// `source` decides which form checkboxes apply; `mode` is how it was found.
function videoEntry(ctx, stumbled, found, source, mode) {
  const fresh = freshVideos(found.videos, { accept: accepts[source](ctx.options), watched: ctx.watched, stumbled });
  console.log(`${TAG} ${mode}: ${found.videos.length} videos found, ${fresh.length} fresh`);
  if (fresh.length === 0) return null;
  const v = pickOne(fresh);
  return newEntry({
    kind: "youtube",
    url: watchUrl(v.videoId),
    videoId: v.videoId,
    title: v.title,
    channelId: v.channelId,
    channelName: v.channelName,
    durationSec: v.durationSec,
    thumb: thumbUrl(v.videoId),
    type: v.type,
    mode,
    reason: found.reason,
  });
}

function pageEntry(ctx, stumbled, found, source, mode) {
  const fresh = freshPages(found.pages, {
    accept: accepts[source](ctx.options),
    stumbled,
    sites: ctx.factors.sites,
  });
  console.log(`${TAG} ${mode}: ${found.pages.length} pages found, ${fresh.length} fresh`);
  if (fresh.length === 0) return null;
  const p = pickOne(fresh);
  return newEntry({
    kind: "web",
    url: p.url,
    title: p.title,
    site: p.site,
    channelId: "",
    channelName: p.author || p.site,
    durationSec: 0,
    thumb: "",
    type: p.type,
    mode,
    reason: p.reason || found.reason,
  });
}

async function findYouTube(ctx, stumbled) {
  const { mode } = pickWeighted(modeWeights(ctx.options.surprise));
  return videoEntry(ctx, stumbled, await finders[mode](ctx), "youtube", mode);
}

async function findWeb(ctx, stumbled) {
  const { mode } = pickWeighted(webModeWeights(ctx.options.surprise));
  return pageEntry(ctx, stumbled, await webFinders[mode](ctx), "web", mode);
}

async function stumble() {
  try {
    await chrome.action.setBadgeText({ text: "..." });
    const ctx = await load();
    if (!ctx.profile) {
      await chrome.action.setBadgeText({ text: "" });
      await chrome.runtime.openOptionsPage();
      return null;
    }

    const last = ctx.stumbles[ctx.stumbles.length - 1];
    if (last) settleSoft(ctx, last);

    // Video IDs for YouTube, addresses for the web.
    const stumbled = new Set(ctx.stumbles.flatMap((e) => [e.videoId, e.url]).filter(Boolean));
    let entry = null;
    if (pickSource(ctx.options) === null) throw new Error("nothing is switched on in the mix; tick a source in the options");
    for (let i = 0; i < TRIES && !entry; i++) {
      const source = pickSource(ctx.options);
      // One failed search (a channel without a videos page, a busy YouTube,
      // a dead blog) is one wasted try, not a failed press.
      try {
        entry = source === "youtube" ? await findYouTube(ctx, stumbled) : await findWeb(ctx, stumbled);
      } catch (e) {
        console.error(`${TAG} ${source} failed:`, e.message);
      }
    }
    if (!entry) throw new Error(`nothing fresh after ${TRIES} tries`);

    ctx.stumbles.push(entry);
    await chrome.storage.local.set({ stumbles: ctx.stumbles, factors: ctx.factors });
    await openInStumbleTab(entry.url);
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "Stumble" });
    return entry;
  } catch (e) {
    console.error(TAG, e);
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setTitle({ title: `Stumble failed: ${e.message}` });
    return { error: e.message };
  }
}

// One tab that keeps changing, like StumbleUpon. If the viewer closed it,
// a new one takes its place.
async function openInStumbleTab(url) {
  const { tabId } = await chrome.storage.session.get("tabId");
  if (tabId !== undefined) {
    try {
      const tab = await chrome.tabs.update(tabId, { url, active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return;
    } catch {
      // The stumble tab was closed; fall through and open a new one.
    }
  }
  const tab = await chrome.tabs.create({ url });
  await chrome.storage.session.set({ tabId: tab.id });
}

// How long the viewer watched counts as a soft rating, once, when they move
// on. An explicit Like or Not for me always wins over it.
function settleSoft(ctx, entry) {
  if (entry.settled) return;
  entry.settled = true;
  if (entry.rating) return;
  const watched = entry.watchedSec;
  let soft = null;
  if (entry.kind === "web") {
    if (watched >= WEB_SOFT_LIKE_SEC) soft = "softLike";
    else if (watched < WEB_SOFT_SKIP_SEC) soft = "softSkip";
  } else if (watched >= SOFT_LIKE_SEC || (entry.durationSec > 0 && watched >= entry.durationSec * SOFT_LIKE_SHARE)) {
    soft = "softLike";
  } else if (watched < SOFT_SKIP_SEC) {
    soft = "softSkip";
  }
  if (!soft) return;
  const old = effectiveRating(entry);
  entry.soft = soft;
  if (ctx.profile) applyRating(ctx.factors, ctx.profile, entry, old, effectiveRating(entry));
}

// The stumble a page belongs to: YouTube by video ID, the web by host,
// since a blog address often redirects (http to https, a trailing slash).
const sameHost = (entry, url) => siteOf(entry.url) === siteOf(url);

async function current({ videoId, url }) {
  const { stumbles } = await load();
  if (videoId) return stumbles.findLast((e) => e.videoId === videoId) ?? null;
  const last = stumbles[stumbles.length - 1];
  return last?.kind === "web" && sameHost(last, url) ? last : null;
}

// Web pages get the bar injected, only in the stumble tab and only on the
// stumbled site, so Stumble never runs on any other page the viewer visits.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete") return;
  const { tabId: stumbleTab } = await chrome.storage.session.get("tabId");
  if (tabId !== stumbleTab) return;
  const { stumbles = [] } = await chrome.storage.local.get("stumbles");
  const last = stumbles[stumbles.length - 1];
  if (last?.kind !== "web" || !sameHost(last, tab.url ?? "")) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (e) {
    console.error(`${TAG} bar not added to ${last.site}:`, e.message);
  }
});

async function rate({ id, rating }) {
  const ctx = await load();
  const entry = ctx.stumbles.find((e) => e.id === id);
  if (!entry) throw new Error(`no stumble ${id}`);
  const old = effectiveRating(entry);
  entry.rating = rating;
  if (ctx.profile) applyRating(ctx.factors, ctx.profile, entry, old, effectiveRating(entry));
  await chrome.storage.local.set({ stumbles: ctx.stumbles, factors: ctx.factors });
  return entry;
}

async function watch({ id, watchedSec, final }) {
  const ctx = await load();
  const entry = ctx.stumbles.find((e) => e.id === id);
  if (!entry) return null;
  entry.watchedSec = Math.max(entry.watchedSec, Math.round(watchedSec));
  if (final) settleSoft(ctx, entry);
  await chrome.storage.local.set({ stumbles: ctx.stumbles, factors: ctx.factors });
  return entry;
}
