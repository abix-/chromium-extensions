// How one press of the button chooses what to look for. Pure: no chrome.* here.

export const MODES = ["familiar", "related", "neighbour", "wild"];

// surprise 0 = only what the viewer already likes, 1 = only discovery.
export function modeWeights(surprise) {
  return [
    { mode: "familiar", weight: 1 - surprise },
    { mode: "related", weight: surprise * 0.4 },
    { mode: "neighbour", weight: surprise * 0.3 },
    { mode: "wild", weight: surprise * 0.3 },
  ];
}

// The web has no related videos; "liked" is Kagi Small Web readers' likes.
export function webModeWeights(surprise) {
  return [
    { mode: "familiar", weight: 1 - surprise },
    { mode: "liked", weight: surprise * 0.4 },
    { mode: "wild", weight: surprise * 0.6 },
  ];
}

// The mix, one row per source:
//   on     whether the source is used at all
//   share  its slider; a press picks among the sources that are on, in
//          proportion to their sliders
//   forms  what it may give, filtering inside that source only
export const SOURCES = ["youtube", "web"];

export const DEFAULT_OPTIONS = {
  surprise: 0.5,
  sources: {
    youtube: { on: true, share: 0.5, forms: { video: true, short: false, live: false } },
    web: { on: true, share: 0.5, forms: { page: true, comic: true, code: true } },
  },
};

// Fills in anything missing, and carries over the choices saved by the
// version that kept one flat list of checkboxes and a YouTube/Websites slider.
export function mergeOptions(saved) {
  const sources = {};
  for (const name of SOURCES) {
    const d = DEFAULT_OPTIONS.sources[name];
    const s = saved?.sources?.[name];
    sources[name] = { on: s?.on ?? d.on, share: s?.share ?? d.share, forms: { ...d.forms, ...s?.forms } };
  }
  if (!saved?.sources && saved?.types) {
    const t = saved.types;
    for (const f of ["video", "short", "live"]) if (t[f] !== undefined) sources.youtube.forms[f] = t[f];
    for (const f of ["page", "comic", "code"]) if (t[f] !== undefined) sources.web.forms[f] = t[f];
    sources.youtube.on = Object.values(sources.youtube.forms).some(Boolean);
    sources.web.on = Object.values(sources.web.forms).some(Boolean);
    if (saved.webShare !== undefined) {
      sources.web.share = saved.webShare;
      sources.youtube.share = 1 - saved.webShare;
    }
  }
  return {
    surprise: saved?.surprise ?? DEFAULT_OPTIONS.surprise,
    sources,
  };
}

// Each source's share of presses, among the sources that are on.
export function sourceShares(options) {
  const on = SOURCES.filter((s) => options.sources[s].on && options.sources[s].share > 0);
  const total = on.reduce((sum, s) => sum + options.sources[s].share, 0);
  return Object.fromEntries(SOURCES.map((s) => [s, on.includes(s) ? options.sources[s].share / total : 0]));
}

// The source for this press, or null when nothing is on.
export function pickSource(options, random = Math.random) {
  const items = SOURCES.filter((s) => options.sources[s].on && options.sources[s].share > 0).map((s) => ({
    source: s,
    weight: options.sources[s].share,
  }));
  return items.length === 0 ? null : pickWeighted(items, random).source;
}

// What a source may give, from its own form checkboxes only.
export const accepts = {
  youtube: (o) => (v) => Boolean(o.sources.youtube.forms[v.type]),
  web: (o) => (p) => Boolean(o.sources.web.forms[p.type]),
};

// Sites rated down this far are left out of web stumbles.
const BLOCKED_SITE_FACTOR = 0.5;

export function freshPages(pages, { accept, stumbled, sites }) {
  return pages.filter((p) => accept(p) && !stumbled.has(p.url) && (sites[p.site] ?? 1) > BLOCKED_SITE_FACTOR);
}

export function pickWeighted(items, random = Math.random) {
  const total = items.reduce((s, t) => s + t.weight, 0);
  let r = random() * total;
  for (const t of items) {
    r -= t.weight;
    if (r < 0) return t;
  }
  return items[items.length - 1];
}

export function pickOne(list, random = Math.random) {
  return list[Math.floor(random() * list.length)];
}

// Related hops: how many times to follow a related video before stopping.
export const HOPS_MIN = 2;
export const HOPS_MAX = 5;

// A suggestion counts as a neighbour only when it adds words the viewer has
// no topic for; "rust solo" -> "rust solo base" is the same topic.
export function neighbourSuggestions(suggestions, seed, knownTerms) {
  const seedWords = new Set(seed.split(" "));
  return suggestions.filter((s) => {
    const extra = s.toLowerCase().split(/\s+/).filter((w) => w.length >= 3 && !seedWords.has(w));
    return extra.length > 0 && extra.some((w) => !knownTerms.has(w));
  });
}

// Drops videos the viewer cannot or should not get: a form the source does
// not accept, already watched on YouTube, already stumbled onto.
export function freshVideos(videos, { accept, watched, stumbled }) {
  return videos.filter(
    (v) => accept(v) && !v.watched && !watched.has(v.videoId) && !stumbled.has(v.videoId),
  );
}
