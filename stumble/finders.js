// The four ways one press finds candidate videos. No chrome.* here, so the
// node tests run each one against real YouTube.

import {
  FILTERS,
  searchUrl,
  watchUrl,
  channelVideosUrl,
  suggestUrl,
  initialData,
  extractVideos,
  parseSuggest,
  clientVersion,
  browseBody,
  moreVideosToken,
  BROWSE_URL,
} from "./youtube.js";
import { interests, effectiveRating, titleTerms } from "./profile.js";
import { pickWeighted, pickOne, neighbourSuggestions, HOPS_MIN, HOPS_MAX } from "./stumble.js";
import { WILD_WORDS } from "./wild-words.js";
import { kagiSmallYouTube } from "./webfinders.js";

const WILD_AVOID_TOPICS = 500;
const CHANNEL_PAGES = 5;

async function fetchHtml(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

export const fetchData = async (url) => initialData(await fetchHtml(url));

// A random one of the channel's first CHANNEL_PAGES pages of 30 videos, so
// a liked channel gives more than its newest uploads.
async function channelPage(channelId) {
  const html = await fetchHtml(channelVideosUrl(channelId));
  const version = clientVersion(html);
  let data = initialData(html);
  const page = 1 + Math.floor(Math.random() * CHANNEL_PAGES);
  for (let p = 1; p < page; p++) {
    const token = moreVideosToken(data);
    if (!token) break;
    const res = await fetch(BROWSE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: browseBody(version, token) });
    if (!res.ok) throw new Error(`channel ${channelId} page ${p + 1}: HTTP ${res.status}`);
    data = await res.json();
  }
  return { data, page };
}

export const randomFilter = () => pickOne(Object.values(FILTERS));

// Search with two-word topics when there are any. A single word loses its
// meaning: "rust" suggests "rusty buckets", "wipe" suggests "wipe me down".
function searchTopics(topics) {
  const pairs = topics.filter((t) => t.term.includes(" "));
  return pairs.length > 0 ? pairs : topics;
}

// Each finder returns candidate videos plus the reason shown on the bar and
// in the history. An empty list makes the caller try another pick.
export const finders = {
  async familiar({ profile, factors }) {
    const { channels, topics } = interests(profile, factors);
    if (channels.length > 0 && Math.random() < 0.5) {
      const c = pickWeighted(channels);
      const { data, page } = await channelPage(c.id);
      return { videos: extractVideos(data), reason: `a channel you watch: ${c.name} (page ${page})` };
    }
    const t = pickWeighted(searchTopics(topics));
    return { videos: extractVideos(await fetchData(searchUrl(t.term, randomFilter()))), reason: `your topic "${t.term}"` };
  },

  async related({ profile, stumbles }) {
    const liked = stumbles.filter((e) => ["like", "softLike"].includes(effectiveRating(e)));
    const seed = pickOne(liked.length > 0 ? liked : profile.recent);
    const hops = HOPS_MIN + Math.floor(Math.random() * (HOPS_MAX - HOPS_MIN + 1));
    let current = seed;
    let videos = [];
    for (let i = 0; i < hops; i++) {
      videos = extractVideos(await fetchData(watchUrl(current.videoId)));
      const next = videos.filter((v) => v.type === "video");
      if (next.length === 0) break;
      if (i < hops - 1) current = pickOne(next);
    }
    return { videos, reason: `${hops} related hops from "${seed.title}"` };
  },

  async neighbour({ profile, factors }) {
    const { topics } = interests(profile, factors);
    const t = pickWeighted(searchTopics(topics));
    const res = await fetch(suggestUrl(t.term));
    if (!res.ok) throw new Error(`suggest "${t.term}": HTTP ${res.status}`);
    const known = new Set(topics.flatMap((x) => x.term.split(" ")));
    const candidates = neighbourSuggestions(parseSuggest(await res.text()), t.term, known);
    if (candidates.length === 0) return { videos: [], reason: "" };
    const q = pickOne(candidates);
    return {
      videos: extractVideos(await fetchData(searchUrl(q, randomFilter()))),
      reason: `next to your topic "${t.term}": "${q}"`,
    };
  },

  // One in three wild cards comes from Kagi Small Web's small creators,
  // the rest from a random subject search.
  async wild({ profile, factors, cached }) {
    let found;
    if (Math.random() < 1 / 3) {
      const k = await kagiSmallYouTube(cached);
      const videos = k.channelId ? extractVideos((await channelPage(k.channelId)).data) : k.videos;
      found = { videos, reason: k.reason };
    } else {
      const q = pickOne(WILD_WORDS);
      found = { videos: extractVideos(await fetchData(searchUrl(q, randomFilter()))), reason: `wild card: "${q}"` };
    }
    const { topics } = interests(profile, factors);
    const top = new Set(
      [...topics].sort((a, b) => b.weight - a.weight).slice(0, WILD_AVOID_TOPICS).map((t) => t.term),
    );
    // A wild card that lands on a channel or topic the viewer already has is
    // not wild; drop those.
    const videos = found.videos.filter(
      (v) => !profile.channels[v.channelId] && !titleTerms(v.title).some((t) => top.has(t)),
    );
    return { videos, reason: found.reason };
  },
};
