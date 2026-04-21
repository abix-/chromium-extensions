// Cross-language contract test for stack-origin extraction.
//
// Shares `stack_fixtures.json` with `hush/src/stack.rs`'s
// `fixture_cases_match_expected` test. Both implementations MUST
// produce the same `expected` host for each fixture case. Drift
// between Rust and JS copies surfaces as a failing test in the
// language that drifted.
//
// The JS copy lives in mainworld.js (must be re-implemented there
// because main world can't load WASM). We load mainworld.js in a
// vm sandbox with the minimal stubs the script needs to run past
// the stackOriginHost export line, then pull
// `window.__hush_mainworld__.stackOriginHost` out of the sandbox
// and iterate.

import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadMainworld() {
  // Minimal sandbox. mainworld's early-init reads `window`,
  // `document.documentElement.dataset`, and nothing else the
  // export line depends on. Hook-installation code runs later
  // in the IIFE and may throw on missing prototypes; the
  // `__hush_mainworld__` export has already been set by then,
  // so we catch-and-ignore those post-export errors.
  const window = {};
  const document = {
    documentElement: { dataset: {} },
    addEventListener() {},
    dispatchEvent() { return true; },
    readyState: "complete",
  };
  // Minimal prototype surface so mainworld's captureOrig() /
  // property patches don't throw before the export line. Any
  // later throw is absorbed by the outer try/catch.
  class Stub { }
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
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  // Wire window <-> globals so `window.X` and `X` both resolve.
  for (const k of Object.keys(ctx)) {
    if (k !== "window" && k !== "document") window[k] = ctx[k];
  }
  window.window = window;
  window.document = document;
  vm.createContext(ctx);

  const source = readFileSync(resolve(__dirname, "..", "mainworld.js"), "utf8");
  try {
    vm.runInContext(source, ctx);
  } catch (_e) {
    // Post-export hook-install errors are fine; the export line
    // ran before any such throw. If the export itself failed we
    // catch it on the access below.
  }

  const exported = ctx.window.__hush_mainworld__;
  if (!exported || typeof exported.stackOriginHost !== "function") {
    throw new Error("mainworld.js did not expose __hush_mainworld__.stackOriginHost; check the IIFE didn't throw before the export line");
  }
  return exported.stackOriginHost;
}

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "stack_fixtures.json"), "utf8")
);

test("mainworld stackOriginHost matches every fixture case", () => {
  const stackOriginHost = loadMainworld();
  assert.ok(fixture.cases && fixture.cases.length > 0, "fixture has cases");

  for (const c of fixture.cases) {
    const got = stackOriginHost(c.stack);
    assert.strictEqual(
      got,
      c.expected,
      `fixture case \`${c.name}\`: JS returned \`${got}\`, expected \`${c.expected}\``
    );
  }
});
