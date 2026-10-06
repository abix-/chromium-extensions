import { test } from "node:test";
import assert from "node:assert/strict";

import { finders } from "../finders.js";
import { searchUrl, FILTERS, initialData, extractVideos } from "../youtube.js";
import { buildProfile, emptyFactors } from "../profile.js";
import { freshVideos, freshPages, accepts, mergeOptions, DEFAULT_OPTIONS } from "../stumble.js";
import { webFinders, createCache } from "../webfinders.js";

// A stand-in watch history made from real search results, so every finder
// runs against real YouTube with the same kind of profile Learn builds.
async function liveProfile() {
  const history = [];
  for (const q of ["rust solo wipe day", "bodycam breakdown", "ancient engineering"]) {
    const res = await fetch(searchUrl(q, FILTERS.relevance), { headers: { "accept-language": "en-US" } });
    history.push(...extractVideos(initialData(await res.text())).filter((v) => v.type === "video"));
  }
  return buildProfile(history, []);
}

const profile = await liveProfile();
const store = new Map();
const cached = createCache({ get: async (k) => store.get(k), set: async (k, v) => void store.set(k, v) });
const ctx = { profile, factors: emptyFactors(), stumbles: [], cached, options: DEFAULT_OPTIONS };
const filter = { accept: accepts.youtube(DEFAULT_OPTIONS), watched: new Set(profile.recent.map((v) => v.videoId)), stumbled: new Set() };

test("the stand-in profile has channels and topics", () => {
  console.log(`profile: ${Object.keys(profile.channels).length} channels, ${Object.keys(profile.topics).length} topics`);
  assert.ok(Object.keys(profile.topics).length >= 3);
});

// Each finder is random, so give it a few presses like the extension does.
for (const mode of Object.keys(finders)) {
  test(`${mode} finds fresh videos on real YouTube within a few presses`, async () => {
    let fresh = [];
    let reason = "";
    for (let i = 0; i < 6 && fresh.length === 0; i++) {
      // Same as the extension: a failed search costs one try.
      try {
        const found = await finders[mode](ctx);
        fresh = freshVideos(found.videos, filter);
        reason = found.reason;
      } catch (e) {
        console.log(`${mode} try ${i + 1} failed: ${e.message}`);
      }
    }
    console.log(`${mode}: ${fresh.length} fresh, reason: ${reason}`);
    assert.ok(fresh.length > 0);
    assert.ok(reason.length > 0);
  });
}

const webFilter = { accept: accepts.web(DEFAULT_OPTIONS), stumbled: new Set(), sites: {} };

for (const mode of Object.keys(webFinders)) {
  test(`web ${mode} finds fresh pages on the real sources within a few presses`, async () => {
    let fresh = [];
    let reason = "";
    for (let i = 0; i < 6 && fresh.length === 0; i++) {
      try {
        const found = await webFinders[mode](ctx);
        fresh = freshPages(found.pages, webFilter);
        reason = fresh[0]?.reason || found.reason;
      } catch (e) {
        console.log(`web ${mode} try ${i + 1} failed: ${e.message}`);
      }
    }
    console.log(`web ${mode}: ${fresh.length} fresh, reason: ${reason}`);
    assert.ok(fresh.length > 0);
    assert.ok(reason.length > 0);
    for (const p of fresh) assert.match(p.url, /^https?:\/\//);
  });
}

test("each web wild source can give pages", async () => {
  // Turning on one type at a time forces wild onto the sources for it.
  for (const type of ["page", "comic", "code"]) {
    const options = mergeOptions({ sources: { web: { on: true, share: 0.5, forms: { page: false, comic: false, code: false, [type]: true } } } });
    let fresh = [];
    for (let i = 0; i < 6 && fresh.length === 0; i++) {
      try {
        const found = await webFinders.wild({ ...ctx, options });
        fresh = freshPages(found.pages, { ...webFilter, accept: accepts.web(options) });
      } catch (e) {
        console.log(`wild ${type} try ${i + 1} failed: ${e.message}`);
      }
    }
    console.log(`wild ${type}: ${fresh.length} fresh`);
    assert.ok(fresh.length > 0, type);
  }
});
