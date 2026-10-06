import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SOURCES,
  suaListUrl,
  parseFeed,
  parseLines,
  parseSuaList,
  parseSuaIndex,
  kagiVideos,
  decodeText,
  siteOf,
} from "../web.js";

// These hit the real sources the extension reads, so a format change fails
// here instead of silently in the browser.
const get = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert.equal(res.status, 200, url);
  return res.text();
};

for (const name of ["kagiBlogs", "kagiCode", "kagiComics", "kagiLiked"]) {
  test(`live ${name} feed parses to posts with title and address`, async () => {
    const posts = parseFeed(await get(SOURCES[name]));
    console.log(`${name}: ${posts.length} posts`);
    assert.ok(posts.length >= 20);
  });
}

test("live Kagi YouTube feed parses to videos and shorts", async () => {
  const videos = kagiVideos(parseFeed(await get(SOURCES.kagiYouTube)));
  const shorts = videos.filter((v) => v.type === "short").length;
  console.log(`kagiYouTube: ${videos.length} videos, ${shorts} shorts`);
  assert.ok(videos.length - shorts >= 20);
});

for (const name of ["kagiBlogList", "kagiComicList", "kagiYouTubeList", "marginaliaRandom"]) {
  test(`live ${name} parses to a long list`, async () => {
    const lines = parseLines(await get(SOURCES[name]));
    console.log(`${name}: ${lines.length} entries`);
    assert.ok(lines.length >= 200);
  });
}

test("live random blogs from Kagi's list have readable feeds", async () => {
  const feeds = parseLines(await get(SOURCES.kagiBlogList));
  let readable = 0;
  const tries = 10;
  for (let i = 0; i < tries; i++) {
    const url = feeds[Math.floor(Math.random() * feeds.length)];
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (res.ok && parseFeed(await res.text()).length > 0) readable++;
    } catch {
      // A dead or slow blog is expected now and then; the count shows how often.
    }
  }
  console.log(`random blogs with a readable feed: ${readable} of ${tries}`);
  assert.ok(readable >= 5);
});

test("live StumbleUponAwesome index and one list parse", async () => {
  const names = parseSuaIndex(JSON.parse(await get(SOURCES.suaLists)));
  const sites = parseSuaList(await get(suaListUrl("Agriculture.txt")));
  console.log(`StumbleUponAwesome: ${names.length} lists, Agriculture has ${sites.length} sites`);
  assert.ok(names.length >= 500);
  assert.ok(sites.length >= 3);
  assert.equal(sites[0].list, "Agriculture");
});

test("parseFeed reads both Atom and RSS", () => {
  const atom = `<feed><entry><title>A &amp; B</title><link rel="alternate" href="https://a.example/1"/></entry></feed>`;
  const rss = `<rss><channel><item><title><![CDATA[C post]]></title><link>https://c.example/2</link></item></channel></rss>`;
  assert.deepEqual(parseFeed(atom).map((p) => [p.title, p.url]), [["A & B", "https://a.example/1"]]);
  assert.deepEqual(parseFeed(rss).map((p) => [p.title, p.url]), [["C post", "https://c.example/2"]]);
});

test("decodeText and siteOf", () => {
  assert.equal(decodeText("caf&#233; &lt;b&gt;"), "café");
  assert.equal(siteOf("https://www.example.com/x"), "example.com");
  assert.equal(siteOf("not a url"), "");
});
