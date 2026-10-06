// The ways one press finds candidate web pages. No chrome.* here: storage
// comes in through the cache, so the node tests run each one for real.

import { SOURCES, suaListUrl, parseFeed, parseLines, parseSuaList, parseSuaIndex, kagiVideos, siteOf } from "./web.js";
import { interests, titleTerms } from "./profile.js";
import { pickOne } from "./stumble.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const FETCH_TIMEOUT_MS = 15000;
const TOPIC_TERMS = 500;

export async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

export const HOUR_MS = HOUR;
export const DAY_MS = DAY;

// Big lists (41k blogs, 579 topic lists) are fetched once a day, live feeds
// once an hour. `store` is chrome.storage in the extension, a Map in tests.
// `load` fetches the items when the stored copy is missing or too old.
export function createCache(store) {
  const memo = new Map();
  return async function cached(key, load, maxAgeMs) {
    const fresh = (r) => r && Date.now() - r.at < maxAgeMs;
    let record = memo.get(key);
    if (!fresh(record)) record = await store.get(key);
    if (!fresh(record)) {
      record = { at: Date.now(), items: await load() };
      await store.set(key, record);
    }
    memo.set(key, record);
    return record.items;
  };
}

// A loader for a plain address that needs no login.
export const fromUrl = (url, parse) => async () => parse(await fetchText(url));

const feed = (cached, name) => cached(name, fromUrl(SOURCES[name], parseFeed), HOUR);
const list = (cached, name) => cached(name, fromUrl(SOURCES[name], parseLines), DAY);
const suaIndex = (cached) => cached("suaLists", fromUrl(SOURCES.suaLists, (t) => parseSuaIndex(JSON.parse(t))), DAY);
const suaList = (cached, name) => cached(`sua:${name}`, fromUrl(suaListUrl(name), parseSuaList), DAY);

const isCode = (url) => siteOf(url) === "github.com";
const page = (p, type) => ({ url: p.url, title: p.title, site: siteOf(p.url), author: p.author ?? "", type });
const suaPage = (s) => page(s, isCode(s.url) ? "code" : "page");
const suaTopic = (name) => name.replace(/\.txt$/, "");

// Wild web sources, each tagged with the kind of page it gives so the
// "Show me" checkboxes can rule it out before any fetch.
const WILD = [
  {
    types: ["page"],
    async find(cached) {
      const url = pickOne(await list(cached, "kagiBlogList"));
      const pages = parseFeed(await fetchText(url)).map((p) => page(p, "page"));
      return { pages, reason: `a random blog from Kagi Small Web: ${siteOf(url)}` };
    },
  },
  {
    types: ["comic"],
    async find(cached) {
      const url = pickOne(await list(cached, "kagiComicList"));
      const pages = parseFeed(await fetchText(url)).map((p) => page(p, "comic"));
      return { pages, reason: `a random webcomic from Kagi Small Web: ${siteOf(url)}` };
    },
  },
  {
    types: ["code"],
    async find(cached) {
      return { pages: (await feed(cached, "kagiCode")).map((p) => page(p, "code")), reason: "a new GitHub project from Kagi Small Web" };
    },
  },
  {
    types: ["page", "code"],
    async find(cached) {
      const name = pickOne(await suaIndex(cached));
      return { pages: (await suaList(cached, name)).map(suaPage), reason: `random list "${suaTopic(name)}" from StumbleUponAwesome` };
    },
  },
  {
    types: ["page"],
    async find(cached) {
      const domain = pickOne(await list(cached, "marginaliaRandom"));
      return {
        pages: [{ url: `https://${domain}/`, title: domain, site: domain, author: "", type: "page" }],
        reason: "a random small website from Marginalia",
      };
    },
  },
];

function topTerms(profile, factors) {
  return [...interests(profile, factors).topics].sort((a, b) => b.weight - a.weight).slice(0, TOPIC_TERMS).map((t) => t.term);
}

export const webFinders = {
  // Pages whose StumbleUponAwesome list name or Kagi post title shares a
  // word with one of the viewer's topics.
  async familiar({ profile, factors, cached }) {
    const terms = topTerms(profile, factors);
    const termOf = new Map();
    for (const t of terms) for (const w of t.split(" ")) if (!termOf.has(w)) termOf.set(w, t);

    if (Math.random() < 0.5) {
      const matches = (await suaIndex(cached))
        .map((name) => ({ name, term: suaTopic(name).toLowerCase().split(/[^a-z0-9]+/).map((w) => termOf.get(w)).find(Boolean) }))
        .filter((m) => m.term);
      if (matches.length > 0) {
        const m = pickOne(matches);
        return { pages: (await suaList(cached, m.name)).map(suaPage), reason: `list "${suaTopic(m.name)}" matches your topic "${m.term}"` };
      }
    }

    const termSet = new Set(terms);
    const pages = [];
    for (const [name, type] of [["kagiBlogs", "page"], ["kagiComics", "comic"], ["kagiCode", "code"]]) {
      for (const p of await feed(cached, name)) {
        const term = titleTerms(p.title).find((t) => termSet.has(t));
        if (term) pages.push({ ...page(p, type), reason: `Kagi Small Web post matches your topic "${term}"` });
      }
    }
    return { pages, reason: "" };
  },

  // The closest thing to StumbleUpon's crowd: posts Kagi Small Web readers liked.
  async liked({ cached }) {
    return { pages: (await feed(cached, "kagiLiked")).map((p) => page(p, "page")), reason: "liked by Kagi Small Web readers" };
  },

  async wild({ cached, options }) {
    const allowed = WILD.filter((s) => s.types.some((t) => options.sources.web.forms[t]));
    if (allowed.length === 0) return { pages: [], reason: "" };
    return pickOne(allowed).find(cached);
  },
};

// Kagi's small YouTube creators (under 100k subscribers) for YouTube wild
// cards: either a recent video from the live feed, or a random channel.
export async function kagiSmallYouTube(cached) {
  if (Math.random() < 0.5) {
    return { videos: kagiVideos(await feed(cached, "kagiYouTube")), reason: "a small YouTube creator from Kagi Small Web", channelId: null };
  }
  const line = pickOne(await list(cached, "kagiYouTubeList"));
  const channelId = line.match(/channel_id=(UC[A-Za-z0-9_-]{22})/)?.[1] ?? null;
  return { videos: [], reason: "a small YouTube creator from Kagi Small Web", channelId };
}
