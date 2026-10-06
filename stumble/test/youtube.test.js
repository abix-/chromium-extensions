import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FILTERS,
  searchUrl,
  watchUrl,
  channelVideosUrl,
  suggestUrl,
  initialData,
  extractVideos,
  parseSuggest,
  durationSec,
  clientVersion,
  browseBody,
  moreVideosToken,
  BROWSE_URL,
} from "../youtube.js";

// These hit the real public YouTube pages the extension reads, so a YouTube
// layout change fails here instead of silently in the browser.
const get = async (url) => {
  const res = await fetch(url, { headers: { "accept-language": "en-US" } });
  assert.equal(res.status, 200, url);
  return res.text();
};

const assertWellFormed = (videos) => {
  for (const v of videos) {
    assert.match(v.videoId, /^[A-Za-z0-9_-]{11}$/);
    assert.ok(["video", "short", "live"].includes(v.type));
  }
};

for (const [name, filter] of Object.entries(FILTERS)) {
  test(`live search with filter ${name} gives videos with title, channel and length`, async () => {
    const videos = extractVideos(initialData(await get(searchUrl("rust solo wipe day", filter))));
    const full = videos.filter((v) => v.type === "video" && v.title && v.channelId.startsWith("UC") && v.durationSec > 0);
    console.log(`search ${name}: ${videos.length} videos, ${full.length} complete`);
    assert.ok(full.length >= 5);
    assertWellFormed(videos);
  });
}

test("live watch page gives related videos with title, channel and length", async () => {
  const videos = extractVideos(initialData(await get(watchUrl("dQw4w9WgXcQ"))));
  const full = videos.filter((v) => v.type === "video" && v.title && v.channelId.startsWith("UC") && v.durationSec > 0);
  console.log(`related: ${videos.length} videos, ${full.length} complete`);
  assert.ok(full.length >= 5);
  assertWellFormed(videos);
});

test("live channel videos page gives that channel's videos", async () => {
  // Practical Engineering
  const videos = extractVideos(initialData(await get(channelVideosUrl("UCMOqf8ab-42UUQIdVoKwjlQ"))));
  const full = videos.filter((v) => v.type === "video" && v.title && v.durationSec > 0);
  console.log(`channel: ${videos.length} videos, ${full.length} complete`);
  assert.ok(full.length >= 5);
  assertWellFormed(videos);
});

test("live channel load more gives the next 30 videos, twice", async () => {
  const html = await get(channelVideosUrl("UCMOqf8ab-42UUQIdVoKwjlQ"));
  const version = clientVersion(html);
  let data = initialData(html);
  const seen = new Set(extractVideos(data).map((v) => v.videoId));
  for (let page = 2; page <= 3; page++) {
    const res = await fetch(BROWSE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: browseBody(version, moreVideosToken(data)) });
    assert.equal(res.status, 200);
    data = await res.json();
    const ids = extractVideos(data).map((v) => v.videoId);
    console.log(`channel page ${page}: ${ids.length} videos, ${ids.filter((id) => seen.has(id)).length} repeated`);
    assert.ok(ids.length >= 20);
    assert.ok(ids.every((id) => !seen.has(id)), "a later page repeats earlier videos");
    ids.forEach((id) => seen.add(id));
  }
});

test("live search suggestions parse to a list of queries", async () => {
  const suggestions = parseSuggest(await get(suggestUrl("ancient engineering")));
  console.log(`suggest: ${suggestions.length} suggestions`);
  assert.ok(suggestions.length >= 3);
});

test("durationSec reads YouTube length text", () => {
  assert.equal(durationSec("1:33:54"), 5634);
  assert.equal(durationSec("4:05"), 245);
  assert.equal(durationSec("LIVE"), 0);
  assert.equal(durationSec(""), 0);
});

test("initialData throws when the page has no ytInitialData", () => {
  assert.throws(() => initialData("<html></html>"), /ytInitialData not found/);
});
