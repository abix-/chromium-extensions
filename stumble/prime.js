// Reads Prime Video watch history. Pure: no chrome.* and no fetch.
//
// The history page loads older days through getWatchHistorySettingsPage,
// passing the previous page's nextToken. Amazon's own client sends
// "x-requested-with: XMLHttpRequest"; without it the same address returns
// the whole HTML page instead of data.

export const PRIME_HISTORY_PAGE = "https://www.amazon.com/gp/video/settings/watch-history";
export const PRIME_ORIGIN = "https://www.amazon.com";

export const primeHistoryPath = (nextToken) =>
  `/gp/video/api/getWatchHistorySettingsPage?widgetArgs=${encodeURIComponent(JSON.stringify(nextToken ? { nextToken } : {}))}`;

// One page: days, each with the titles watched that day. A season stands
// for the episodes of it watched that day; its children are the episodes.
export function parsePrimePage(json) {
  const content = json?.widgets?.find((w) => w.widgetType === "watch-history")?.content?.content;
  if (!content) throw new Error("no watch-history widget in Prime Video response");
  const titles = [];
  for (const day of content.titles ?? []) {
    for (const t of day.titles ?? []) {
      titles.push({
        gti: t.gti,
        title: t.title?.text ?? "",
        type: t.titleType,
        url: t.title?.href ? new URL(t.title.href, PRIME_ORIGIN).href : "",
        image: t.imageSrc ?? "",
        time: t.time,
      });
    }
  }
  return { titles, nextToken: content.nextToken ?? null };
}

// Every title once, with how many days it was watched and when last.
export function buildPrimeHistory(titles) {
  const byId = new Map();
  for (const t of titles) {
    const seen = byId.get(t.gti);
    if (seen) {
      seen.days++;
      seen.lastWatched = Math.max(seen.lastWatched, t.time);
      seen.firstWatched = Math.min(seen.firstWatched, t.time);
    } else {
      byId.set(t.gti, { gti: t.gti, title: t.title, type: t.type, url: t.url, image: t.image, days: 1, lastWatched: t.time, firstWatched: t.time });
    }
  }
  return [...byId.values()];
}
