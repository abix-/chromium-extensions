import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pickWeighted,
  modeWeights,
  neighbourSuggestions,
  freshVideos,
  freshPages,
  pickSource,
  mergeOptions,
  sourceShares,
  accepts,
  DEFAULT_OPTIONS,
} from "../stumble.js";
import { WILD_WORDS } from "../wild-words.js";

// Options with only the given sources on, each at the given slider value.
const mix = (shares, forms = {}) =>
  mergeOptions({
    sources: Object.fromEntries(
      ["youtube", "web"].map((s) => [s, { on: s in shares, share: shares[s] ?? 0.5, forms: forms[s] }]),
    ),
  });

const countPicks = (options) => {
  const counts = {};
  const steps = 1000;
  for (let i = 0; i < steps; i++) {
    const s = pickSource(options, () => i / steps);
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
};

test("presses follow the sliders of the sources that are on", () => {
  assert.deepEqual(countPicks(mix({ youtube: 0.6, web: 0.2 })), { youtube: 750, web: 250 });
});

test("only Websites on means only Websites", () => {
  assert.deepEqual(countPicks(mix({ web: 0.3 })), { web: 1000 });
});

test("nothing on picks nothing, with no hidden fallback", () => {
  assert.equal(pickSource(mix({}), () => 0.5), null);
  assert.equal(pickSource(mix({ youtube: 0 }), () => 0.5), null, "a source on with its slider at 0 gives nothing");
});

test("the share shown for each source matches the picks", () => {
  const o = mix({ youtube: 0.75, web: 0.25 });
  assert.deepEqual(sourceShares(o), { youtube: 0.75, web: 0.25 });
});

test("a source's form boxes filter only that source", () => {
  const o = mix({ youtube: 0.5, web: 0.5 }, { youtube: { video: false, short: true }, web: { code: false } });
  assert.equal(accepts.youtube(o)({ type: "video" }), false);
  assert.equal(accepts.youtube(o)({ type: "short" }), true);
  assert.equal(accepts.web(o)({ type: "code" }), false);
  assert.equal(accepts.web(o)({ type: "page" }), true, "YouTube's boxes do not reach Websites");
});

test("choices saved by the old flat checkboxes carry over", () => {
  const o = mergeOptions({ surprise: 0.3, webShare: 0.8, types: { video: false, short: false, live: false, page: true } });
  assert.equal(o.surprise, 0.3);
  assert.equal(o.sources.youtube.on, false, "no YouTube form ticked means YouTube was off");
  assert.equal(o.sources.web.on, true);
  assert.equal(o.sources.web.share, 0.8);
  assert.ok(Math.abs(o.sources.youtube.share - 0.2) < 1e-9);
});

test("freshPages drops forms the source does not accept, pages already stumbled onto and sites rated down", () => {
  const p = (url, site, type = "page") => ({ url, site, type });
  const pages = [p("https://a.example/1", "a.example"), p("https://b.example/1", "b.example", "code"),
    p("https://c.example/1", "c.example"), p("https://d.example/1", "d.example")];
  const got = freshPages(pages, {
    accept: accepts.web(mix({ web: 0.5 }, { web: { code: false } })),
    stumbled: new Set(["https://c.example/1"]),
    sites: { "d.example": 0.4 },
  });
  assert.deepEqual(got.map((x) => x.site), ["a.example"]);
});

test("there are at least 1000 different wild card subjects, all plain ASCII", () => {
  console.log(`wild card subjects: ${WILD_WORDS.length}, different: ${new Set(WILD_WORDS).size}`);
  assert.ok(new Set(WILD_WORDS).size >= 1000);
  for (const w of WILD_WORDS) assert.match(w, /^[a-z0-9' ]+$/);
});

test("pickWeighted picks each item in proportion to its weight", () => {
  const items = [{ name: "a", weight: 3 }, { name: "b", weight: 1 }];
  const counts = { a: 0, b: 0 };
  const steps = 1000;
  for (let i = 0; i < steps; i++) counts[pickWeighted(items, () => i / steps).name]++;
  assert.equal(counts.a, 750);
  assert.equal(counts.b, 250);
});

test("surprise 0 only picks familiar, surprise 1 never does", () => {
  const at = (s) => Object.fromEntries(modeWeights(s).map((m) => [m.mode, m.weight]));
  assert.deepEqual(at(0), { familiar: 1, related: 0, neighbour: 0, wild: 0 });
  assert.equal(at(1).familiar, 0);
  assert.ok(at(1).related > 0 && at(1).neighbour > 0 && at(1).wild > 0);
});

test("a suggestion that only adds words the viewer already has is not a neighbour", () => {
  const known = new Set(["rust", "solo", "base", "raid"]);
  const got = neighbourSuggestions(["rust solo base", "rust solo raid", "rust solo vs clan"], "rust solo", known);
  assert.deepEqual(got, ["rust solo vs clan"]);
});

test("freshVideos drops wrong types, videos watched on YouTube and videos already stumbled onto", () => {
  const v = (videoId, type, watched = false) => ({ videoId, type, watched });
  const videos = [v("aaaaaaaaaaa", "video"), v("bbbbbbbbbbb", "short"), v("ccccccccccc", "live"),
    v("ddddddddddd", "video", true), v("eeeeeeeeeee", "video"), v("fffffffffff", "video")];
  const got = freshVideos(videos, {
    accept: accepts.youtube(DEFAULT_OPTIONS),
    watched: new Set(["eeeeeeeeeee"]),
    stumbled: new Set(["fffffffffff"]),
  });
  assert.deepEqual(got.map((x) => x.videoId), ["aaaaaaaaaaa"]);
});
