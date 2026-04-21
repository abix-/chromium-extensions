// Contract test for mainworld.js emit().
//
// As of Stage 3 (Rust port), mainworld.js captures hook invocations into
// window.__hush_stub_q__ (the pre-WASM stub queue). Once WASM is ready,
// the queue is drained through the Rust validator which re-dispatches
// typed CustomEvents. This test harness doesn't load WASM, so it
// asserts on the queue directly. The assertions still cover what
// matters: every emit() call site populates its signal-specific fields
// (hotParam, font, eventType, vendors, param) without silent drops.

import { test } from "node:test";
import assert from "node:assert";
import { makeContext } from "./_harness.mjs";

test("fetch hook preserves url, method, bodyPreview, stack", async () => {
  const { ctx, captured } = makeContext();
  await ctx.window.fetch("https://example.com/a", { method: "POST", body: "hello" });
  const ev = captured.find(c => c.kind === "fetch");
  assert.ok(ev, "fetch event emitted");
  assert.strictEqual(ev.url, "https://example.com/a");
  assert.strictEqual(ev.method, "POST");
  assert.strictEqual(ev.bodyPreview, "hello");
  assert.ok(Array.isArray(ev.stack));
  assert.ok(typeof ev.t === "string" && ev.t.length > 0);
});

test("xhr hook preserves url, method, bodyPreview", () => {
  const { ctx, captured } = makeContext();
  const x = new ctx.XMLHttpRequest();
  x.open("PUT", "https://example.com/b");
  x.send("payload");
  const ev = captured.find(c => c.kind === "xhr");
  assert.ok(ev, "xhr event emitted");
  assert.strictEqual(ev.url, "https://example.com/b");
  assert.strictEqual(ev.method, "PUT");
  assert.strictEqual(ev.bodyPreview, "payload");
});

test("sendBeacon hook preserves url and body", () => {
  const { ctx, captured } = makeContext();
  ctx.navigator.sendBeacon("https://tracker/ping", "event=click");
  const ev = captured.find(c => c.kind === "beacon");
  assert.ok(ev, "beacon event emitted");
  assert.strictEqual(ev.url, "https://tracker/ping");
  assert.strictEqual(ev.bodyPreview, "event=click");
});

test("WebSocket.send hook preserves url and body", () => {
  const { ctx, captured } = makeContext();
  const ws = new ctx.WebSocket("wss://rt.example.com/");
  ws.send("msg");
  const ev = captured.find(c => c.kind === "ws-send");
  assert.ok(ev, "ws-send event emitted");
  assert.strictEqual(ev.url, "wss://rt.example.com/");
  assert.strictEqual(ev.bodyPreview, "msg");
});

test("canvas-fp preserves method field", () => {
  const { ctx, captured } = makeContext();
  const c = new ctx.HTMLCanvasElement();
  c.toDataURL("image/png");
  c.toBlob(() => {});
  const ctx2d = new ctx.CanvasRenderingContext2D();
  ctx2d.getImageData(0, 0, 1, 1);
  const methods = captured.filter(c => c.kind === "canvas-fp").map(c => c.method);
  // spread to outer-context Array: vm-context arrays have a different
  // prototype chain and deepStrictEqual enforces reference-equal prototypes.
  assert.deepStrictEqual([...methods.sort()], ["getImageData", "toBlob", "toDataURL"]);
});

test("webgl-fp preserves hotParam flag on UNMASKED_* reads", () => {
  const { ctx, captured } = makeContext();
  const gl = new ctx.WebGLRenderingContext();
  gl.getParameter(37445); // UNMASKED_VENDOR_WEBGL
  gl.getParameter(37446); // UNMASKED_RENDERER_WEBGL
  gl.getParameter(7938);  // VERSION (not a hot param)
  const webgl = captured.filter(c => c.kind === "webgl-fp");
  assert.strictEqual(webgl.length, 3);
  const hotCount = webgl.filter(e => e.hotParam === true).length;
  assert.strictEqual(hotCount, 2, "UNMASKED_VENDOR_WEBGL + UNMASKED_RENDERER_WEBGL hot");
  const coldCount = webgl.filter(e => e.hotParam === false).length;
  assert.strictEqual(coldCount, 1, "VERSION not hot");
  for (const e of webgl) {
    assert.ok("param" in e, "param preserved");
  }
});

test("webgl-fp hooks WebGL2RenderingContext too", () => {
  const { ctx, captured } = makeContext();
  const gl2 = new ctx.WebGL2RenderingContext();
  gl2.getParameter(37446); // UNMASKED_RENDERER_WEBGL
  const ev = captured.find(c => c.kind === "webgl-fp");
  assert.ok(ev, "webgl-fp event emitted from WebGL2");
  assert.strictEqual(ev.hotParam, true);
});

test("audio-fp fires on OfflineAudioContext construction", () => {
  const { ctx, captured } = makeContext();
  new ctx.window.OfflineAudioContext(2, 44100, 44100);
  const ev = captured.find(c => c.kind === "audio-fp");
  assert.ok(ev, "audio-fp event emitted");
  assert.strictEqual(ev.method, "OfflineAudioContext");
});

test("font-fp preserves font family and text fields", () => {
  const { ctx, captured } = makeContext();
  const c = new ctx.CanvasRenderingContext2D();
  c.font = "12px Arial";
  c.measureText("probe");
  c.font = "12px Helvetica";
  c.measureText("probe");
  const fontEvents = captured.filter(c => c.kind === "font-fp");
  assert.strictEqual(fontEvents.length, 2);
  const fonts = fontEvents.map(e => e.font).sort();
  assert.deepStrictEqual([...fonts], ["12px Arial", "12px Helvetica"]);
  for (const e of fontEvents) {
    assert.strictEqual(e.text, "probe");
  }
});

test("listener-added preserves eventType for hooked interaction + attention listeners", () => {
  const { ctx, captured } = makeContext();
  ctx.document.addEventListener("mousemove", () => {});
  ctx.document.addEventListener("keydown", () => {});
  ctx.document.addEventListener("click", () => {});
  // `blur` is in ATTENTION_EVENT_TYPES (page-lifecycle/engagement
  // signal), so it's hooked too. An earlier version of this test
  // expected blur to be ignored; that predates the attention-
  // tracking detector.
  ctx.document.addEventListener("blur", () => {});
  const listenerEvents = captured.filter(c => c.kind === "listener-added");
  const types = listenerEvents.map(e => e.eventType).sort();
  assert.deepStrictEqual([...types], ["blur", "click", "keydown", "mousemove"]);
  for (const e of listenerEvents) {
    assert.ok(Array.isArray(e.stack));
  }
});

test("replay-global eventually emits vendors array", async () => {
  const { ctx, captured } = makeContext();
  // Simulate a page with Hotjar + Clarity globals.
  ctx.window._hjSettings = { id: 1 };
  ctx.window.clarity = function () {};
  // Poll schedules via setTimeout; wait for it.
  await new Promise(r => setTimeout(r, 2200));
  const ev = captured.find(c => c.kind === "replay-global");
  assert.ok(ev, "replay-global event emitted");
  assert.ok(Array.isArray(ev.vendors), "vendors array preserved");
  const names = ev.vendors.map(v => v.vendor).sort();
  assert.ok(names.includes("Hotjar"));
  assert.ok(names.includes("Microsoft Clarity"));
});

test("canvas-draw emits op, visible, canvasSel for a visible canvas", () => {
  const { ctx, captured } = makeContext();
  const canvas = new ctx.HTMLCanvasElement({
    id: "main-stage",
    className: "game stage",
    rect: { x: 0, y: 0, width: 800, height: 600 }
  });
  const c = new ctx.CanvasRenderingContext2D(canvas);
  c.fillRect(0, 0, 10, 10);
  const ev = captured.find(e => e.kind === "canvas-draw");
  assert.ok(ev, "canvas-draw event emitted");
  assert.strictEqual(ev.op, "fillRect");
  assert.strictEqual(ev.visible, true);
  assert.strictEqual(ev.canvasSel, "canvas#main-stage.game.stage");
});

test("canvas-draw marks offscreen canvas as invisible", () => {
  const { ctx, captured } = makeContext();
  // Canvas positioned well off-viewport (viewport 1280x800)
  const canvas = new ctx.HTMLCanvasElement({
    id: "offscreen",
    rect: { x: -5000, y: -5000, width: 100, height: 100 }
  });
  const c = new ctx.CanvasRenderingContext2D(canvas);
  c.drawImage({}, 0, 0);
  const ev = captured.find(e => e.kind === "canvas-draw");
  assert.ok(ev, "canvas-draw event emitted");
  assert.strictEqual(ev.visible, false);
  assert.strictEqual(ev.op, "drawImage");
});

test("canvas-draw marks display:none canvas as invisible", () => {
  const { ctx, captured } = makeContext();
  const canvas = new ctx.HTMLCanvasElement({
    id: "hidden",
    rect: { x: 0, y: 0, width: 200, height: 200 },
    computedStyle: { display: "none", visibility: "visible", opacity: "1" }
  });
  const c = new ctx.CanvasRenderingContext2D(canvas);
  c.fill();
  const ev = captured.find(e => e.kind === "canvas-draw");
  assert.ok(ev, "canvas-draw event emitted");
  assert.strictEqual(ev.visible, false);
});

test("canvas-draw marks tiny (1x1) canvas as invisible", () => {
  const { ctx, captured } = makeContext();
  const canvas = new ctx.HTMLCanvasElement({
    rect: { x: 0, y: 0, width: 1, height: 1 }
  });
  const c = new ctx.CanvasRenderingContext2D(canvas);
  c.stroke();
  const ev = captured.find(e => e.kind === "canvas-draw");
  assert.ok(ev, "canvas-draw event emitted");
  assert.strictEqual(ev.visible, false);
});

test("canvas-draw throttles repeat same-canvas calls within 100ms", async () => {
  const { ctx, captured } = makeContext();
  const canvas = new ctx.HTMLCanvasElement({
    rect: { x: 0, y: 0, width: 400, height: 300 }
  });
  const c = new ctx.CanvasRenderingContext2D(canvas);
  for (let i = 0; i < 60; i++) c.fillRect(0, 0, 1, 1); // simulate 60Hz burst
  const firstCount = captured.filter(e => e.kind === "canvas-draw").length;
  assert.strictEqual(firstCount, 1, "60 rapid calls produce 1 sample");
  // Advance past the throttle window
  await new Promise(r => setTimeout(r, 120));
  for (let i = 0; i < 60; i++) c.fillRect(0, 0, 1, 1);
  const secondCount = captured.filter(e => e.kind === "canvas-draw").length;
  assert.strictEqual(secondCount, 2, "after >100ms, next burst produces 1 more sample");
});

test("canvas-draw throttle is per-canvas, not global", () => {
  const { ctx, captured } = makeContext();
  const a = new ctx.HTMLCanvasElement({ id: "a", rect: { x: 0, y: 0, width: 400, height: 300 } });
  const b = new ctx.HTMLCanvasElement({ id: "b", rect: { x: 0, y: 0, width: 400, height: 300 } });
  const ca = new ctx.CanvasRenderingContext2D(a);
  const cb = new ctx.CanvasRenderingContext2D(b);
  ca.fillRect(0, 0, 1, 1);
  cb.fillRect(0, 0, 1, 1);
  const events = captured.filter(e => e.kind === "canvas-draw");
  const sels = events.map(e => e.canvasSel).sort();
  assert.deepStrictEqual([...sels], ["canvas#a", "canvas#b"]);
});

test("every emitted event carries kind and timestamp", async () => {
  const { ctx, captured } = makeContext();
  await ctx.window.fetch("https://x/");
  const c = new ctx.HTMLCanvasElement();
  c.toDataURL();
  for (const ev of captured) {
    assert.ok(typeof ev.kind === "string" && ev.kind.length > 0);
    assert.ok(typeof ev.t === "string" && /^\d{4}-\d{2}-\d{2}T/.test(ev.t));
  }
});
