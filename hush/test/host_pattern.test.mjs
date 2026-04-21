// Tests for matchesHostPattern in mainworld.js.
//
// Security-critical: the Neuter and Silence actions match their
// configured patterns against the initiating script's host via
// this function. A false-negative means a known-bad vendor's
// capture listener registers; a false-positive means a legit
// site's listener gets silently denied.
//
// Grammar under test:
//   ||host           anchor: exact OR any subdomain
//   ||host^          trailing ^ accepted as no-op
//   *                wildcard: zero-or-more chars across DNS labels
//   bare string      substring match on host
//
// Deliberately NOT supported (documented in mainworld.js comment):
//   | full anchors, path matching, /regex/, $options. Tests cover
//   a few of those to lock the "we treat them literally / give
//   no match" semantics.

import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadMatchesHostPattern() {
  // Minimal vm context; same shape as stack_origin test's harness.
  const window = {};
  const document = {
    documentElement: { dataset: {} },
    addEventListener() {},
    dispatchEvent() { return true; },
    readyState: "complete",
  };
  class Stub {}
  const ctx = {
    window,
    document,
    navigator: { sendBeacon() { return true; }, userAgent: "", language: "en", languages: ["en"] },
    URL,
    Error,
    CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } },
    EventTarget: Stub,
    XMLHttpRequest: Stub,
    WebSocket: Stub,
    HTMLCanvasElement: Stub,
    CanvasRenderingContext2D: Stub,
    WebGLRenderingContext: Stub,
    WebGL2RenderingContext: Stub,
    OfflineAudioContext: Stub,
    Screen: Stub,
    Navigator: Stub,
    fetch: async () => ({ ok: true }),
    setTimeout, clearTimeout, setInterval, clearInterval,
    console: { warn: () => {}, error: () => {}, log: () => {} },
  };
  for (const k of Object.keys(ctx)) {
    if (k !== "window" && k !== "document") window[k] = ctx[k];
  }
  window.window = window;
  window.document = document;
  vm.createContext(ctx);
  const source = readFileSync(resolve(__dirname, "..", "mainworld.js"), "utf8");
  try { vm.runInContext(source, ctx); } catch (_e) {}
  const exported = ctx.window.__hush_mainworld__;
  if (!exported || typeof exported.matchesHostPattern !== "function") {
    throw new Error("matchesHostPattern not exposed on __hush_mainworld__");
  }
  return exported.matchesHostPattern;
}

const match = loadMatchesHostPattern();

// ---- ||host anchor (exact + subdomain match) ---------------------

test("||host matches exact host", () => {
  assert.strictEqual(match("hotjar.com", "||hotjar.com"), "||hotjar.com");
});

test("||host matches subdomains", () => {
  assert.strictEqual(match("static.hotjar.com", "||hotjar.com"), "||hotjar.com");
  assert.strictEqual(match("cdn.static.hotjar.com", "||hotjar.com"), "||hotjar.com");
});

test("||host does NOT match unrelated host", () => {
  assert.strictEqual(match("example.com", "||hotjar.com"), "");
});

test("||host does NOT match prefix confusion", () => {
  // 'hotjar.com' must not match 'hotjar.com.evil.example' or
  // 'fakehotjar.com' - the anchor requires exact or dot-suffix.
  assert.strictEqual(match("fakehotjar.com", "||hotjar.com"), "");
  assert.strictEqual(match("hotjar.com.evil.example", "||hotjar.com"), "");
});

test("||host^ trailing ^ accepted as no-op", () => {
  assert.strictEqual(match("hotjar.com", "||hotjar.com^"), "||hotjar.com^");
  assert.strictEqual(match("a.hotjar.com", "||hotjar.com^"), "||hotjar.com^");
});

// ---- wildcard * --------------------------------------------------

test("||*.domain matches any subdomain", () => {
  assert.strictEqual(
    match("tracker.ads.example.com", "||*.ads.example.com"),
    "||*.ads.example.com"
  );
  assert.strictEqual(
    match("a.b.ads.example.com", "||*.ads.example.com"),
    "||*.ads.example.com"
  );
});

test("||prefix.* matches hosts whose label position matches", () => {
  assert.strictEqual(
    match("ads.foo.example.com", "||ads.*.example.com"),
    "||ads.*.example.com"
  );
});

test("bare *ads* substring wildcard matches any host containing 'ads'", () => {
  assert.strictEqual(match("bigads.example.com", "*ads*"), "*ads*");
  assert.strictEqual(match("example.com", "*ads*"), "");
});

test("||*.ads.example.com does NOT match 'ads.example.com' (leading dot required)", () => {
  // The pattern literal '*.ads.example.com' (after stripping ||)
  // contains `*.` - wildcard THEN a literal dot. The literal dot
  // has to appear in the input, so a bare 'ads.example.com' (no
  // label before 'ads') doesn't match. Subdomains like
  // 'tracker.ads.example.com' do match because the '.' between
  // 'tracker' and 'ads' is the one the pattern demands.
  assert.strictEqual(match("ads.example.com", "||*.ads.example.com"), "");
  assert.strictEqual(
    match("tracker.ads.example.com", "||*.ads.example.com"),
    "||*.ads.example.com"
  );
});

test("||ads.example.com (no wildcard) matches 'ads.example.com' exactly", () => {
  // Without the wildcard, ||ads.example.com is the normal host
  // anchor - matches exact + any subdomain.
  assert.strictEqual(
    match("ads.example.com", "||ads.example.com"),
    "||ads.example.com"
  );
  assert.strictEqual(
    match("tracker.ads.example.com", "||ads.example.com"),
    "||ads.example.com"
  );
});

// ---- bare substring -----------------------------------------------

test("bare pattern is substring match on host", () => {
  assert.strictEqual(match("foo.hotjar.com", "hotjar.com"), "hotjar.com");
  assert.strictEqual(match("hotjar", "hotjar.com"), "");
  assert.strictEqual(match("x.foo.hotjar.com", "hotjar"), "hotjar");
});

// ---- empty / malformed inputs ------------------------------------

test("empty host returns empty", () => {
  assert.strictEqual(match("", "||anything"), "");
});

test("empty pattern returns empty", () => {
  assert.strictEqual(match("hotjar.com", ""), "");
});

test("pattern with only anchors returns empty", () => {
  assert.strictEqual(match("hotjar.com", "||"), "");
  assert.strictEqual(match("hotjar.com", "||^"), "");
});

// ---- non-supported syntax: treated literally ---------------------

test("uBlock $options suffix NOT parsed; treated as part of pattern", () => {
  // A user writing '||hotjar.com^$third-party' gets literal
  // matching of 'hotjar.com^$third-party' (minus the || anchor).
  // Since '^' is stripped only when it's at the very end, the
  // '$third-party' suffix remains in the match string. Result:
  // no host contains that literal, so no match.
  //
  // This test locks the 'honest-grammar' boundary: if someone
  // adds $option parsing later, this test must change
  // deliberately.
  assert.strictEqual(
    match("hotjar.com", "||hotjar.com^$third-party"),
    ""
  );
});

test("regex-style /pattern/ treated literally (no match)", () => {
  assert.strictEqual(match("hotjar.com", "/hotjar\\.com/"), "");
});

// ---- regression: hasSpoofTag tightening doesn't apply here -------

test("prefix collision: 'hotjar' pattern matches 'hotjar.com' via substring", () => {
  // Bare substring match IS loose by design. 'hotjar' is a
  // substring of 'hotjar.com', so it matches. The anchored form
  // '||hotjar' requires exact or dot-subdomain, so it would only
  // match 'hotjar' alone, not 'hotjar.com'.
  assert.strictEqual(match("hotjar.com", "hotjar"), "hotjar");
  assert.strictEqual(match("hotjar.com", "||hotjar"), "");
});
