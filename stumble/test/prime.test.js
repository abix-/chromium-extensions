import { test } from "node:test";
import assert from "node:assert/strict";

import { primeHistoryPath, parsePrimePage, buildPrimeHistory } from "../prime.js";

// Shaped like the real getWatchHistorySettingsPage response read from a
// signed-in amazon.com on 2026-10-04 (field names only; values made up).
// Reading the real one needs an Amazon login, which node does not have.
const item = (gti, text, titleType, time, children = []) => ({
  actions: { REMOVE: { partialURL: "/x", query: {} } },
  children,
  gti,
  imageSrc: `https://images.example/${gti}.jpg`,
  liveEventQualityMetrics: [],
  removeAriaLabel: "",
  time,
  title: { href: `/gp/video/detail/${gti.toUpperCase()}ABCDEFGHIJ`, text },
  titleType,
});

const page = (days, nextToken) => ({
  __type: "page",
  metadata: {},
  notifications: [],
  widgets: [
    { widgetType: "page-title" },
    { widgetType: "watch-history", content: { content: { nextToken, titles: days } } },
  ],
});

test("parsePrimePage reads every title of every day and the next token", () => {
  const got = parsePrimePage(page([
    { date: "October 4, 2026", titles: [item("a", "Show - Season 2", "season", 300, [item("a1", "Ep 1", "episode", 300)])] },
    { date: "October 3, 2026", titles: [item("b", "A Movie", "movie", 200), item("a", "Show - Season 2", "season", 100)] },
  ], "tok"));
  assert.equal(got.nextToken, "tok");
  assert.deepEqual(got.titles.map((t) => [t.gti, t.type]), [["a", "season"], ["b", "movie"], ["a", "season"]]);
  assert.equal(got.titles[1].url, "https://www.amazon.com/gp/video/detail/BABCDEFGHIJ");
  assert.equal(got.titles[1].title, "A Movie");
});

test("the last page has no next token", () => {
  assert.equal(parsePrimePage(page([], undefined)).nextToken, null);
});

test("a response without the watch-history widget is an error, not an empty history", () => {
  assert.throws(() => parsePrimePage({ widgets: [{ widgetType: "page-title" }] }), /no watch-history widget/);
});

test("buildPrimeHistory keeps each title once with its days watched and first and last time", () => {
  const titles = parsePrimePage(page([
    { date: "d1", titles: [item("a", "Show", "season", 300)] },
    { date: "d2", titles: [item("b", "Movie", "movie", 200), item("a", "Show", "season", 100)] },
  ])).titles;
  const got = Object.fromEntries(buildPrimeHistory(titles).map((t) => [t.gti, t]));
  assert.equal(got.a.days, 2);
  assert.equal(got.a.lastWatched, 300);
  assert.equal(got.a.firstWatched, 100);
  assert.equal(got.b.days, 1);
});

test("primeHistoryPath sends the token the way the history page does", () => {
  assert.equal(primeHistoryPath(null), "/gp/video/api/getWatchHistorySettingsPage?widgetArgs=%7B%7D");
  assert.ok(primeHistoryPath("abc").endsWith(encodeURIComponent('{"nextToken":"abc"}')));
});
