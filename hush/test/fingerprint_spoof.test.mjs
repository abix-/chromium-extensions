// Tests for the per-site fingerprint-spoof kinds.
//
// These are the four "classic" spoofs that predate the always-on
// kill-switches - they're typically opt-in per site because legit
// uses of canvas / audio / font enum on a known-good site break
// when spoofed. Covers:
//
//   webgl-unmasked  UNMASKED_VENDOR_WEBGL -> "Google Inc."
//                   UNMASKED_RENDERER_WEBGL -> "ANGLE (Generic)"
//                   other params: pass through
//   canvas          toDataURL -> constant 1x1 PNG data URL
//                   toBlob -> callback with constant-bytes Blob
//                   getImageData -> zero-filled ImageData
//   audio           OfflineAudioContext.startRendering -> silent buffer
//   font-enum       measureText -> length-only synthetic metrics

import { test } from "node:test";
import assert from "node:assert";
import { makeContext } from "./_harness.mjs";

function setSpoof(ctx, kinds) {
  ctx.document.documentElement.dataset.hushSpoof = kinds.join(",");
}

function captureSpoofHits(ctx) {
  const hits = [];
  const originalDispatch = ctx.document.dispatchEvent.bind(ctx.document);
  ctx.document.dispatchEvent = function (ev) {
    if (ev && ev.type === "__hush_spoof_hit__") {
      hits.push(ev.detail && ev.detail.kind);
    }
    return originalDispatch(ev);
  };
  return hits;
}

test("webgl-unmasked spoof rewrites UNMASKED_VENDOR_WEBGL and UNMASKED_RENDERER_WEBGL", () => {
  const { ctx } = makeContext();
  setSpoof(ctx, ["webgl-unmasked"]);
  const hits = captureSpoofHits(ctx);

  const gl = new ctx.WebGLRenderingContext();
  assert.strictEqual(gl.getParameter(37445), "Google Inc.", "UNMASKED_VENDOR_WEBGL spoofed");
  assert.strictEqual(gl.getParameter(37446), "ANGLE (Generic)", "UNMASKED_RENDERER_WEBGL spoofed");
  // Dedup: two UNMASKED reads produce one spoof-hit.
  assert.deepStrictEqual(hits, ["webgl-unmasked"]);
});

test("webgl-unmasked spoof leaves other params alone (pass-through)", () => {
  const { ctx } = makeContext();
  setSpoof(ctx, ["webgl-unmasked"]);

  const gl = new ctx.WebGLRenderingContext();
  // Any non-UNMASKED param falls through. The stub returns null.
  assert.strictEqual(gl.getParameter(1234), null);
});

test("webgl-unmasked spoof is inactive when kind not enabled", () => {
  const { ctx } = makeContext();
  // No hushSpoof set. UNMASKED reads pass through to the stub (null).
  const gl = new ctx.WebGLRenderingContext();
  assert.strictEqual(gl.getParameter(37445), null);
  assert.strictEqual(gl.getParameter(37446), null);
});

test("canvas spoof rewrites toDataURL to the constant bland PNG", () => {
  const { ctx } = makeContext();
  setSpoof(ctx, ["canvas"]);
  const hits = captureSpoofHits(ctx);

  const canvas = new ctx.HTMLCanvasElement();
  const result = canvas.toDataURL("image/png");
  assert.match(result, /^data:image\/png;base64,/, "returns a PNG data URL");
  assert.notStrictEqual(result, "data:image/png;base64,", "returns the BLAND_PNG_DATAURL constant, not the empty stub");
  // Second call returns the same bytes - the whole point of constant spoofing.
  assert.strictEqual(canvas.toDataURL("image/png"), result);
  assert.deepStrictEqual(hits, ["canvas"]);
});

test("canvas spoof rewrites toBlob callback with a constant-bytes Blob", async () => {
  const { ctx } = makeContext();
  setSpoof(ctx, ["canvas"]);

  const canvas = new ctx.HTMLCanvasElement();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve));
  assert.ok(blob, "toBlob callback fires with a blob (not null)");
  assert.strictEqual(blob.type, "image/png", "blob type is image/png");
});

test("canvas spoof rewrites getImageData to a zero-initialized ImageData of the requested size", () => {
  const { ctx } = makeContext();
  setSpoof(ctx, ["canvas"]);

  const canvas = new ctx.HTMLCanvasElement();
  const c2d = new ctx.CanvasRenderingContext2D(canvas);
  const img = c2d.getImageData(0, 0, 4, 3);
  assert.strictEqual(img.width, 4);
  assert.strictEqual(img.height, 3);
  assert.strictEqual(img.data.length, 4 * 3 * 4, "RGBA byte array");
  // All-zero content (no pixel info leaked).
  for (let i = 0; i < img.data.length; i++) {
    assert.strictEqual(img.data[i], 0);
  }
});

test("canvas spoof falls through when kind not enabled", () => {
  const { ctx } = makeContext();

  const canvas = new ctx.HTMLCanvasElement();
  // Stub's toDataURL returns "data:image/png;base64," (empty body).
  assert.strictEqual(canvas.toDataURL("image/png"), "data:image/png;base64,");
});

test("audio spoof resolves startRendering to a silent buffer with matching shape", async () => {
  const { ctx } = makeContext();
  setSpoof(ctx, ["audio"]);
  const hits = captureSpoofHits(ctx);

  // Harness stubs OfflineAudioContext with both `createBuffer`
  // (used by mainworld's audio spoof to build a silent buffer)
  // and a `startRendering` marked `REAL_RENDERING` so we can
  // assert the spoof path wins over the original.
  const oac = new ctx.OfflineAudioContext(2, 44100, 44100);
  const buf = await oac.startRendering();
  // If spoof fired, buf is a silent buffer; the stub marker must not
  // appear.
  assert.notStrictEqual(buf && buf.__marker, "REAL_RENDERING", "spoof must win over original");
  assert.strictEqual(buf.numberOfChannels, 2);
  assert.strictEqual(buf.sampleRate, 44100);
  // Data is silent (zero-filled).
  const ch = buf.getChannelData(0);
  for (let i = 0; i < Math.min(ch.length, 16); i++) {
    assert.strictEqual(ch[i], 0, "silent buffer");
  }
  assert.deepStrictEqual(hits, ["audio"]);
});

test("font-enum spoof returns length-only synthetic metrics", () => {
  const { ctx } = makeContext();
  setSpoof(ctx, ["font-enum"]);
  const hits = captureSpoofHits(ctx);

  const canvas = new ctx.HTMLCanvasElement();
  const c2d = new ctx.CanvasRenderingContext2D(canvas);
  c2d.font = "12px Arial";
  const m1 = c2d.measureText("abcdef");
  c2d.font = "12px Helvetica";
  const m2 = c2d.measureText("abcdef");
  c2d.font = "12px Comic Sans";
  const m3 = c2d.measureText("abcdef");

  // Three different fonts, same 6-character string -> identical
  // metrics under spoof. That's the whole point.
  assert.strictEqual(m1.width, 48, "6 chars * 8 px/char");
  assert.strictEqual(m1.width, m2.width);
  assert.strictEqual(m2.width, m3.width);
  // Dedup fires once per page.
  assert.deepStrictEqual(hits, ["font-enum"]);
});

test("font-enum spoof width depends only on text length, not font", () => {
  const { ctx } = makeContext();
  setSpoof(ctx, ["font-enum"]);

  const canvas = new ctx.HTMLCanvasElement();
  const c2d = new ctx.CanvasRenderingContext2D(canvas);
  c2d.font = "100px Times";
  assert.strictEqual(c2d.measureText("a").width, 8);
  assert.strictEqual(c2d.measureText("ab").width, 16);
  assert.strictEqual(c2d.measureText("abcdefghij").width, 80);
  assert.strictEqual(c2d.measureText("").width, 0);
});

test("font-enum spoof returns TextMetrics-shaped object (not instance)", () => {
  const { ctx } = makeContext();
  setSpoof(ctx, ["font-enum"]);

  const canvas = new ctx.HTMLCanvasElement();
  const c2d = new ctx.CanvasRenderingContext2D(canvas);
  const m = c2d.measureText("test");
  // All fields the real TextMetrics exposes must be present so
  // fingerprinters can't trivially detect the spoof by feature-
  // checking for, say, fontBoundingBoxAscent.
  const required = [
    "width",
    "actualBoundingBoxLeft",
    "actualBoundingBoxRight",
    "actualBoundingBoxAscent",
    "actualBoundingBoxDescent",
    "fontBoundingBoxAscent",
    "fontBoundingBoxDescent",
    "emHeightAscent",
    "emHeightDescent",
    "hangingBaseline",
    "alphabeticBaseline",
  ];
  for (const field of required) {
    assert.ok(field in m, `${field} present on synthetic metrics`);
    assert.strictEqual(typeof m[field], "number", `${field} is numeric`);
  }
});
