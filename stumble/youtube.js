// Reads YouTube pages and innertube responses. Pure: no chrome.* and no fetch,
// so the node tests run the exact code the extension runs.

// YouTube search "sp" filters, all restricted to type Video. Rotating them
// gives each search several different result pages instead of one fixed 20.
export const FILTERS = {
  relevance: "EgIQAQ==",
  thisMonth: "EgQIBBAB",
  thisYear: "EgQIBRAB",
  mostViewed: "CAMSAhAB",
  newest: "CAISAhAB",
};

export function searchUrl(query, filter) {
  const url = new URL("https://www.youtube.com/results");
  url.searchParams.set("search_query", query);
  url.searchParams.set("sp", filter);
  return url.href;
}

export const watchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;
export const channelVideosUrl = (channelId) => `https://www.youtube.com/channel/${channelId}/videos`;
export const thumbUrl = (videoId) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
export const suggestUrl = (query) =>
  `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`;

// Every YouTube HTML page embeds its data as `var ytInitialData = {...};`.
export function initialData(html) {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error("ytInitialData not found in page");
  return JSON.parse(m[1]);
}

export function durationSec(text) {
  if (!text || !/^\d+(:\d{2})+$/.test(text)) return 0;
  return text.split(":").reduce((s, p) => s * 60 + Number(p), 0);
}

function walk(node, visit) {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, visit);
  } else if (node && typeof node === "object") {
    if (visit(node) === false) return;
    for (const k in node) walk(node[k], visit);
  }
}

function firstChannelEndpoint(node) {
  let found = null;
  walk(node, (n) => {
    if (found) return false;
    const id = n.browseEndpoint?.browseId;
    if (typeof id === "string" && id.startsWith("UC")) found = n.browseEndpoint;
  });
  return found;
}

function fromVideoRenderer(v) {
  const owner = v.ownerText?.runs?.[0] ?? v.longBylineText?.runs?.[0] ?? v.shortBylineText?.runs?.[0];
  const url = v.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url ?? "";
  const lengthText = v.lengthText?.simpleText ?? "";
  const short = url.startsWith("/shorts/") || Boolean(v.navigationEndpoint?.reelWatchEndpoint);
  return {
    videoId: v.videoId,
    title: v.title?.runs?.map((r) => r.text).join("") ?? v.title?.simpleText ?? "",
    channelId: owner?.navigationEndpoint?.browseEndpoint?.browseId ?? "",
    channelName: owner?.text ?? "",
    durationSec: durationSec(lengthText),
    type: short ? "short" : lengthText ? "video" : "live",
    watched: (v.thumbnailOverlays ?? []).some((o) => o.thumbnailOverlayResumePlaybackRenderer),
  };
}

function fromLockup(l) {
  const meta = l.metadata?.lockupMetadataViewModel;
  let lengthText = "";
  let live = false;
  let watched = false;
  walk(l.contentImage, (n) => {
    const text = n.thumbnailBadgeViewModel?.text;
    if (typeof text === "string") {
      if (/^\d+(:\d{2})+$/.test(text)) lengthText = text;
      else if (/live/i.test(text)) live = true;
    }
    if (n.thumbnailOverlayProgressBarViewModel) watched = true;
  });
  const channel = firstChannelEndpoint(meta);
  return {
    videoId: l.contentId,
    title: meta?.title?.content ?? "",
    channelId: channel?.browseId ?? "",
    channelName: meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content ?? "",
    durationSec: durationSec(lengthText),
    type: live || !lengthText ? "live" : "video",
    watched,
  };
}

function fromShort(s) {
  const videoId =
    s.videoId ?? s.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ?? s.navigationEndpoint?.reelWatchEndpoint?.videoId;
  if (!videoId) return null;
  return {
    videoId,
    title: s.headline?.simpleText ?? s.overlayMetadata?.primaryText?.content ?? "",
    channelId: "",
    channelName: "",
    durationSec: 0,
    type: "short",
    watched: false,
  };
}

// Collects every video in a page or innertube response, whatever renderer
// YouTube used for it. Search uses videoRenderer, watch-page related videos,
// channel pages and history use lockupViewModel, shorts use their own.
export function extractVideos(data) {
  const out = [];
  const seen = new Set();
  const add = (v) => {
    if (!v || !/^[A-Za-z0-9_-]{11}$/.test(v.videoId) || seen.has(v.videoId)) return;
    seen.add(v.videoId);
    out.push(v);
  };
  walk(data, (n) => {
    if (n.videoRenderer?.videoId) add(fromVideoRenderer(n.videoRenderer));
    else if (n.lockupViewModel?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") add(fromLockup(n.lockupViewModel));
    else if (n.reelItemRenderer) add(fromShort(n.reelItemRenderer));
    else if (n.shortsLockupViewModel) add(fromShort(n.shortsLockupViewModel));
    else return true;
    return false;
  });
  return out;
}

// Subscriptions page: one channelRenderer per subscribed channel.
export function extractChannels(data) {
  const out = [];
  walk(data, (n) => {
    const c = n.channelRenderer;
    if (!c?.channelId) return true;
    out.push({ channelId: c.channelId, channelName: c.title?.simpleText ?? "" });
    return false;
  });
  return out;
}

export const BROWSE_URL = "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false";

// The web client version the page was served with; innertube calls must
// name a current one.
export function clientVersion(html) {
  const m = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
  if (!m) throw new Error("INNERTUBE_CLIENT_VERSION not found in page");
  return m[1];
}

export function browseBody(version, continuation) {
  return JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: version, hl: "en" } }, continuation });
}

// The "load more" token of a video grid. A channel page also carries tokens
// for its Latest/Popular/Oldest sort buttons; the grid's comes first.
export function moreVideosToken(data) {
  let token = null;
  walk(data, (n) => {
    if (token) return false;
    const t = n.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
    if (typeof t === "string") token = t;
  });
  return token;
}

export function continuationToken(data) {
  let token = null;
  walk(data, (n) => {
    const t = n.continuationCommand?.token ?? n.nextContinuationData?.continuation;
    if (typeof t === "string") token = t;
  });
  return token;
}

// The suggest endpoint answers with JSONP: window.google.ac.h([query, [[text, ...], ...], {...}])
export function parseSuggest(body) {
  const start = body.indexOf("(");
  const end = body.lastIndexOf(")");
  if (start < 0 || end < start) throw new Error("suggest response not JSONP");
  const [, rows] = JSON.parse(body.slice(start + 1, end));
  return rows.map((r) => r[0]).filter((s) => typeof s === "string");
}
