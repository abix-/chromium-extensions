import { test } from "node:test";
import assert from "node:assert/strict";

import { titleTerms, buildProfile, interests, applyRating, emptyFactors, RATING_FACTOR } from "../profile.js";

const video = (videoId, title, channelId, channelName = channelId) => ({ videoId, title, channelId, channelName });

test("titleTerms keeps words and word pairs, drops filler and numbers", () => {
  const terms = titleTerms("The Rise of a Solo Empire - Rust 2024");
  assert.ok(terms.includes("rise"));
  assert.ok(terms.includes("solo empire"));
  assert.ok(terms.includes("rust"));
  assert.ok(!terms.includes("the"));
  assert.ok(!terms.includes("2024"));
});

test("a word becomes a topic only in 5 titles from 3 channels", () => {
  const history = [
    video("v1", "Wipe day solo", "UCa"),
    video("v2", "Another wipe day", "UCb"),
    video("v3", "Wipe day again", "UCa"),
    video("v4", "Wipe day duo", "UCc"),
    video("v5", "Wipe day trio", "UCa"),
    video("v6", "Pizza pizza", "UCd"),
    video("v7", "Pizza tour", "UCd"),
    video("v8", "Pizza night", "UCd"),
    video("v9", "Pizza oven", "UCd"),
    video("v10", "Pizza dough", "UCe"),
    video("v11", "Raid night", "UCa"),
    video("v12", "Raid base", "UCb"),
    video("v13", "Raid duo", "UCc"),
    video("v14", "Raid trio", "UCd"),
  ];
  const p = buildProfile(history, [{ channelId: "UCz", channelName: "Subbed" }]);
  assert.equal(p.topics["wipe day"], 5);
  assert.equal(p.topics.pizza, undefined, "5 titles from only 2 channels is not a topic");
  assert.equal(p.topics.raid, undefined, "4 titles is not a topic");
  assert.equal(p.channels.UCa.watches, 4);
  assert.equal(p.channels.UCz.subscribed, true);
  assert.equal(p.recent.length, 14);
});

test("a subscription counts as one watch", () => {
  const p = buildProfile([video("v1", "x", "UCa")], [{ channelId: "UCa", channelName: "A" }, { channelId: "UCb", channelName: "B" }]);
  const weight = Object.fromEntries(interests(p, emptyFactors()).channels.map((c) => [c.id, c.weight]));
  assert.equal(weight.UCa, 2);
  assert.equal(weight.UCb, 1);
});

test("a liked channel Learn never saw joins the channel list", () => {
  const p = buildProfile([video("v1", "x", "UCa"), video("v2", "y", "UCb")], []);
  const factors = emptyFactors();
  applyRating(factors, p, { channelId: "UCnew", channelName: "New", title: "log cabin build" }, null, "like");
  const { channels, topics } = interests(p, factors);
  assert.ok(channels.some((c) => c.id === "UCnew"));
  assert.ok(topics.some((t) => t.term === "log cabin"), "a like adds a new two word topic");
  assert.ok(!topics.some((t) => t.term === "build"), "but not a single new word");
});

test("two skips on a website's pages drop that site below the cutoff", () => {
  const p = buildProfile([video("v1", "a", "UCa")], []);
  const factors = emptyFactors();
  const page = { site: "blog.example", channelId: "", title: "some post" };
  applyRating(factors, p, page, null, "skip");
  assert.ok(factors.sites["blog.example"] > 0.5, "one skip keeps the site");
  applyRating(factors, p, page, null, "skip");
  assert.ok(factors.sites["blog.example"] < 0.5, "two skips drop it");
});

test("changing a like to a skip from history undoes the like first", () => {
  const p = buildProfile([video("v1", "a", "UCa")], []);
  const factors = emptyFactors();
  const entry = { channelId: "UCa", channelName: "A", title: "a" };
  applyRating(factors, p, entry, null, "like");
  applyRating(factors, p, entry, "like", "skip");
  assert.ok(Math.abs(factors.channels.UCa.factor - RATING_FACTOR.skip) < 1e-9);
  applyRating(factors, p, entry, "skip", null);
  assert.ok(Math.abs(factors.channels.UCa.factor - 1) < 1e-9);
});
