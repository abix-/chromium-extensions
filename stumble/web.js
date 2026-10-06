// Reads the web sources: Kagi Small Web, StumbleUponAwesome, Marginalia's
// random domain list, and any blog's RSS or Atom feed. Pure: no chrome.* and
// no fetch, so the node tests run the exact code the extension runs. The
// service worker has no DOMParser, so feeds are read with patterns.

const KAGI_FEED = "https://kagi.com/api/v1/smallweb/feed/";
const KAGI_RAW = "https://raw.githubusercontent.com/kagisearch/smallweb/main/";
const SUA_REPO = "basharovV/StumbleUponAwesome";
const SUA_PATH = "extension/data/urls/awesome";

export const SOURCES = {
  kagiBlogs: KAGI_FEED,
  kagiYouTube: `${KAGI_FEED}?yt`,
  kagiCode: `${KAGI_FEED}?gh`,
  kagiComics: `${KAGI_FEED}?comic`,
  kagiLiked: "https://kagi.com/smallweb/liked",
  kagiBlogList: `${KAGI_RAW}smallweb.txt`,
  kagiComicList: `${KAGI_RAW}smallcomic.txt`,
  kagiYouTubeList: `${KAGI_RAW}smallyt.txt`,
  suaLists: `https://api.github.com/repos/${SUA_REPO}/contents/${SUA_PATH}`,
  marginaliaRandom: "https://raw.githubusercontent.com/MarginaliaSearch/PublicData/master/sets/random-domains.txt",
};

export const suaListUrl = (name) =>
  `https://raw.githubusercontent.com/${SUA_REPO}/master/${SUA_PATH}/${encodeURIComponent(name)}`;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#34": '"' };

export function decodeText(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITIES[e])
    .replace(/<[^>]+>/g, "")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeText(m[1]) : "";
}

// Atom <entry> uses <link href>, preferring rel="alternate"; RSS <item>
// uses <link>url</link>. Returns posts with a title and an http(s) address.
export function parseFeed(xml) {
  const posts = [];
  for (const [block] of xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)) {
    const links = [...block.matchAll(/<link\s[^>]*>/gi)].map((m) => m[0]);
    const link = links.find((l) => /rel=["']alternate["']/i.test(l)) ?? links.find((l) => !/rel=/i.test(l)) ?? links[0];
    const href = link?.match(/href=["']([^"']+)["']/i)?.[1];
    posts.push({ title: tag(block, "title"), url: href ? decodeText(href) : "", author: tag(block, "name") });
  }
  for (const [block] of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    posts.push({ title: tag(block, "title"), url: tag(block, "link"), author: tag(block, "dc:creator") || tag(block, "author") });
  }
  return posts.filter((p) => /^https?:\/\//.test(p.url) && p.title);
}

// Kagi's list files: one address per line, optional "# comment" after it.
export function parseLines(text) {
  return text
    .split("\n")
    .map((l) => l.split("#")[0].trim())
    .filter((l) => /^https?:\/\//.test(l) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(l));
}

// StumbleUponAwesome list files: "url,title,source list url,list name" per line.
export function parseSuaList(text) {
  return text
    .split("\n")
    .map((line) => line.trim().split(","))
    .filter((parts) => parts.length >= 4 && /^https?:\/\//.test(parts[0]))
    .map((parts) => ({ url: parts[0], title: parts.slice(1, -2).join(",").trim(), list: parts.at(-1).trim() }));
}

// The GitHub contents listing of the 579 list files; the file name is the topic.
export function parseSuaIndex(json) {
  return json.filter((f) => f.type === "file" && f.name.endsWith(".txt")).map((f) => f.name);
}

export function siteOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const YT_ID = /(?:\/shorts\/|[?&]v=)([A-Za-z0-9_-]{11})/;

// Kagi's ?yt feed entries as Stumble videos. The feed has no length, so
// durationSec stays 0 and only "watched 10 minutes" can count as a soft like.
export function kagiVideos(posts) {
  return posts
    .map((p) => {
      const id = p.url.match(YT_ID)?.[1];
      if (!id) return null;
      return {
        videoId: id,
        title: p.title,
        channelId: "",
        channelName: p.author,
        durationSec: 0,
        type: p.url.includes("/shorts/") ? "short" : "video",
        watched: false,
      };
    })
    .filter(Boolean);
}
