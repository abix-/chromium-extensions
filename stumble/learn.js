// Learn: reads the viewer's whole YouTube watch history and subscriptions and
// builds the profile, then reads their Prime Video watch history. Runs in the
// options page, not the service worker, because a full history can take
// minutes and an open page is never put to sleep.

import { extractVideos, extractChannels, continuationToken } from "./youtube.js";
import { buildProfile } from "./profile.js";
import { PRIME_HISTORY_PAGE, primeHistoryPath, parsePrimePage, buildPrimeHistory } from "./prime.js";

const TAG = "[Stumble learn]";

// Injected into a YouTube tab (MAIN world) so the request carries the
// viewer's login. Logged-in innertube calls need the SAPISIDHASH header the
// YouTube page itself sends; same scheme as yt-dlp and ytmusicapi.
// Must be self-contained: Chrome serializes only this function.
async function innertubeInPage(endpoint, body) {
  try {
    const cfg = window.ytcfg;
    const cookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith("SAPISID=") || c.startsWith("__Secure-3PAPISID="));
    if (!cookie) return { error: "not signed in to YouTube in this Chrome" };
    const sapisid = cookie.slice(cookie.indexOf("=") + 1);
    const ts = Math.floor(Date.now() / 1000);
    const origin = location.origin;
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${ts} ${sapisid} ${origin}`));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const res = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        authorization: `SAPISIDHASH ${ts}_${hash}`,
        "x-origin": origin,
        "x-goog-authuser": String(cfg.get("SESSION_INDEX") ?? 0),
      },
      body: JSON.stringify({ context: cfg.get("INNERTUBE_CONTEXT"), ...body }),
    });
    if (!res.ok) return { error: `${endpoint}: HTTP ${res.status}`, status: res.status };
    return { data: await res.json() };
  } catch (e) {
    return { error: `${endpoint}: ${e.message}` };
  }
}

// Injected into an amazon.com tab (MAIN world) so the request carries the
// viewer's Amazon login. Must be self-contained: Chrome serializes only this
// function.
async function primePageInPage(path) {
  try {
    const res = await fetch(path, { credentials: "same-origin", headers: { "x-requested-with": "XMLHttpRequest" } });
    if (!res.ok) return { error: `Prime Video history: HTTP ${res.status}`, status: res.status };
    const text = await res.text();
    try {
      return { data: JSON.parse(text) };
    } catch {
      // Signed out, Amazon answers with its sign-in page instead of data.
      return { error: "Prime Video history did not answer with data; sign in to amazon.com in this Chrome" };
    }
  } catch (e) {
    return { error: `Prime Video history: ${e.message}` };
  }
}

export async function openBackgroundTab(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  await new Promise((resolve) => {
    const onUpdated = (id, info) => {
      if (id !== tab.id || info.status !== "complete") return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
  return tab.id;
}

// 429 "too many requests" and 503 "service unavailable" are a site slowing
// a long run of requests down, not a failure: wait longer each time and ask
// for the same page again.
const BUSY = new Set([429, 503]);
export const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 32000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// call() returns { data } or { error, status }, like the in-page functions.
export async function withRetry(call, onWait, wait = sleep) {
  for (let attempt = 0; ; attempt++) {
    const result = await call();
    if (!result.error) return result.data;
    if (!BUSY.has(result.status) || attempt >= RETRY_DELAYS_MS.length) throw new Error(result.error);
    onWait(RETRY_DELAYS_MS[attempt], result.status);
    await wait(RETRY_DELAYS_MS[attempt]);
  }
}

async function inTab(tabId, func, args) {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
  return result;
}

const busyMessage = (site, onProgress) => (ms, status) =>
  onProgress(`${site} is busy (HTTP ${status}), trying the same page again in ${ms / 1000} seconds`);

// Pages through one browse feed (history, subscriptions) to its end.
async function readFeed(tabId, browseId, extract, onProgress, label) {
  const innertube = (body) => withRetry(() => inTab(tabId, innertubeInPage, ["browse", body]), busyMessage("YouTube", onProgress));
  const items = [];
  let data = await innertube({ browseId });
  for (let page = 1; ; page++) {
    const got = extract(data);
    items.push(...got);
    onProgress(`Reading ${label}: page ${page}, ${items.length}`);
    const token = continuationToken(data);
    if (!token || got.length === 0) break;
    data = await innertube({ continuation: token });
  }
  return items;
}

async function learnYouTube(onProgress) {
  const tabId = await openBackgroundTab("https://www.youtube.com/");
  try {
    const history = await readFeed(tabId, "FEhistory", extractVideos, onProgress, "YouTube watch history (videos)");
    const subscriptions = await readFeed(tabId, "FEchannels", extractChannels, onProgress, "YouTube subscriptions (channels)");
    const profile = buildProfile(history, subscriptions);
    await chrome.storage.local.set({ profile, watched: history.map((v) => v.videoId) });
    console.log(`${TAG} ${history.length} history videos, ${subscriptions.length} subscriptions`);
    return profile;
  } finally {
    await chrome.tabs.remove(tabId);
  }
}

// Follows nextToken to the end of the Prime Video watch history, which is
// how the history page itself loads older days while scrolling.
async function learnPrime(onProgress) {
  const tabId = await openBackgroundTab(PRIME_HISTORY_PAGE);
  try {
    const titles = [];
    const seenTokens = new Set();
    let token = null;
    for (let page = 1; ; page++) {
      const data = await withRetry(
        () => inTab(tabId, primePageInPage, [primeHistoryPath(token)]),
        busyMessage("Prime Video", onProgress),
      );
      const parsed = parsePrimePage(data);
      titles.push(...parsed.titles);
      onProgress(`Reading Prime Video history: page ${page}, ${titles.length} titles`);
      // A repeated token would loop forever; it means the end as surely as none.
      if (!parsed.nextToken || seenTokens.has(parsed.nextToken)) break;
      seenTokens.add(parsed.nextToken);
      token = parsed.nextToken;
    }
    const prime = { learnedAt: Date.now(), titles: buildPrimeHistory(titles) };
    await chrome.storage.local.set({ prime });
    console.log(`${TAG} ${titles.length} Prime Video history entries, ${prime.titles.length} titles`);
    return prime;
  } finally {
    await chrome.tabs.remove(tabId);
  }
}

// YouTube, then Prime Video, each on its own: one failing (YouTube still
// refusing after every retry, signed out of Amazon) never stops the other
// or throws away what it learned.
export async function learn(onProgress) {
  const errors = {};
  for (const [name, step] of [["YouTube", learnYouTube], ["Prime Video", learnPrime]]) {
    try {
      await step(onProgress);
    } catch (e) {
      console.error(TAG, name, e);
      errors[name] = e.message;
    }
  }
  return errors;
}
