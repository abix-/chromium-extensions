// Tests for the always-on kill-switch spoof kinds.
//
// When a kind appears in `document.documentElement.dataset.hushSpoof`,
// the corresponding API returns a spec-compliant denial value
// (`true` / `NotAllowedError` / `NotFoundError`) WITHOUT calling the
// real implementation. When the kind is absent, the API falls
// through to the real implementation unchanged.
//
// Each test also asserts a `spoof-hit` CustomEvent is dispatched via
// `__hush_spoof_hit__` and deduped per-kind (one event per kind per
// page load), matching the promise in the popup's "how do I know
// this fired?" FirewallLog row.

import { test } from "node:test";
import assert from "node:assert";
import { makeContext } from "./_harness.mjs";

// Helper: turn on a set of kill-switch kinds by writing to the
// dataset attribute content.js normally writes at document_start.
// Comma-separated, matching the production shape.
function enableSpoofs(ctx, kinds) {
  ctx.document.documentElement.dataset.hushSpoof = kinds.join(",");
}

// Capture spoof-hit CustomEvents so tests can assert dedup +
// per-kind dispatch. mainworld fires these via
// `document.dispatchEvent(new CustomEvent("__hush_spoof_hit__", ...))`,
// so we stub dispatchEvent.
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

test("sendbeacon kill-switch returns true without firing the real sendBeacon", async () => {
  const { ctx, originalCalled } = makeContext();
  enableSpoofs(ctx, ["sendbeacon"]);
  const hits = captureSpoofHits(ctx);

  const result = ctx.navigator.sendBeacon(
    "https://tracker.example.com/beacon",
    "user=alice"
  );

  assert.strictEqual(result, true, "hook returns true per spec");
  assert.strictEqual(
    originalCalled.sendBeacon,
    0,
    "original sendBeacon must NOT be invoked"
  );
  assert.deepStrictEqual(hits, ["sendbeacon"], "one spoof-hit dispatched");
});

test("sendbeacon falls through to original when the kind is not enabled", () => {
  const { ctx, originalCalled } = makeContext();
  // dataset.hushSpoof empty -> hook should call through.
  const result = ctx.navigator.sendBeacon("https://x/", "body");

  assert.strictEqual(result, true, "original stub returns true");
  assert.strictEqual(
    originalCalled.sendBeacon,
    1,
    "original sendBeacon invoked exactly once"
  );
});

test("sendbeacon spoof dedups: two calls produce one spoof-hit event", () => {
  const { ctx } = makeContext();
  enableSpoofs(ctx, ["sendbeacon"]);
  const hits = captureSpoofHits(ctx);

  ctx.navigator.sendBeacon("https://x/", "a");
  ctx.navigator.sendBeacon("https://y/", "b");
  ctx.navigator.sendBeacon("https://z/", "c");

  assert.deepStrictEqual(
    hits,
    ["sendbeacon"],
    "hushSpoofEmitted set dedups per-kind"
  );
});

test("clipboard-read kill-switch rejects with NotAllowedError", async () => {
  const { ctx, originalCalled } = makeContext();
  enableSpoofs(ctx, ["clipboard-read"]);
  const hits = captureSpoofHits(ctx);

  await assert.rejects(
    () => ctx.navigator.clipboard.readText(),
    (err) => {
      assert.strictEqual(err.name, "NotAllowedError");
      assert.match(err.message, /permission/i);
      return true;
    },
    "clipboard.readText rejects with NotAllowedError"
  );
  assert.strictEqual(
    originalCalled.clipboardRead,
    0,
    "original readText must NOT be invoked"
  );
  assert.deepStrictEqual(hits, ["clipboard-read"]);
});

test("clipboard-read falls through when not enabled", async () => {
  const { ctx, originalCalled } = makeContext();

  const text = await ctx.navigator.clipboard.readText();
  assert.strictEqual(text, "ORIGINAL_CLIPBOARD_TEXT");
  assert.strictEqual(originalCalled.clipboardRead, 1);
});

test("bluetooth kill-switch rejects with NotFoundError", async () => {
  const { ctx, originalCalled } = makeContext();
  enableSpoofs(ctx, ["bluetooth"]);
  const hits = captureSpoofHits(ctx);

  await assert.rejects(
    () => ctx.navigator.bluetooth.requestDevice({}),
    (err) => {
      assert.strictEqual(err.name, "NotFoundError");
      return true;
    }
  );
  assert.strictEqual(originalCalled.bluetoothRequest, 0);
  assert.deepStrictEqual(hits, ["bluetooth"]);
});

test("usb kill-switch rejects with NotFoundError", async () => {
  const { ctx, originalCalled } = makeContext();
  enableSpoofs(ctx, ["usb"]);

  await assert.rejects(
    () => ctx.navigator.usb.requestDevice({}),
    (err) => {
      assert.strictEqual(err.name, "NotFoundError");
      return true;
    }
  );
  assert.strictEqual(originalCalled.usbRequest, 0);
});

test("hid kill-switch rejects with NotFoundError", async () => {
  const { ctx, originalCalled } = makeContext();
  enableSpoofs(ctx, ["hid"]);

  await assert.rejects(
    () => ctx.navigator.hid.requestDevice({}),
    (err) => {
      assert.strictEqual(err.name, "NotFoundError");
      return true;
    }
  );
  assert.strictEqual(originalCalled.hidRequest, 0);
});

test("serial kill-switch rejects with NotFoundError", async () => {
  const { ctx, originalCalled } = makeContext();
  enableSpoofs(ctx, ["serial"]);

  await assert.rejects(
    () => ctx.navigator.serial.requestPort({}),
    (err) => {
      assert.strictEqual(err.name, "NotFoundError");
      return true;
    }
  );
  assert.strictEqual(originalCalled.serialRequest, 0);
});

test("device-probe kinds are independent: enabling bluetooth does not affect usb/hid/serial", async () => {
  const { ctx, originalCalled } = makeContext();
  enableSpoofs(ctx, ["bluetooth"]);

  await assert.rejects(() => ctx.navigator.bluetooth.requestDevice({}));

  // usb / hid / serial should still call through to originals.
  await ctx.navigator.usb.requestDevice({});
  await ctx.navigator.hid.requestDevice({});
  await ctx.navigator.serial.requestPort({});

  assert.strictEqual(originalCalled.bluetoothRequest, 0);
  assert.strictEqual(originalCalled.usbRequest, 1);
  assert.strictEqual(originalCalled.hidRequest, 1);
  assert.strictEqual(originalCalled.serialRequest, 1);
});

test("all six kill-switches active simultaneously each fire their own spoof-hit", async () => {
  const { ctx, originalCalled } = makeContext();
  enableSpoofs(ctx, [
    "sendbeacon",
    "clipboard-read",
    "bluetooth",
    "usb",
    "hid",
    "serial",
  ]);
  const hits = captureSpoofHits(ctx);

  ctx.navigator.sendBeacon("https://x/", "a");
  await assert.rejects(() => ctx.navigator.clipboard.readText());
  await assert.rejects(() => ctx.navigator.bluetooth.requestDevice({}));
  await assert.rejects(() => ctx.navigator.usb.requestDevice({}));
  await assert.rejects(() => ctx.navigator.hid.requestDevice({}));
  await assert.rejects(() => ctx.navigator.serial.requestPort({}));

  assert.deepStrictEqual(hits.sort(), [
    "bluetooth",
    "clipboard-read",
    "hid",
    "sendbeacon",
    "serial",
    "usb",
  ]);
  // Every original must be skipped.
  assert.strictEqual(originalCalled.sendBeacon, 0);
  assert.strictEqual(originalCalled.clipboardRead, 0);
  assert.strictEqual(originalCalled.bluetoothRequest, 0);
  assert.strictEqual(originalCalled.usbRequest, 0);
  assert.strictEqual(originalCalled.hidRequest, 0);
  assert.strictEqual(originalCalled.serialRequest, 0);
});

test("prefix-match kinds do not false-trigger (hasSpoofTag is exact-match)", () => {
  // Regression lock for the hasSpoofTag tightening. Previously the
  // hook used indexOf() which matched "sendbeacon" as a substring
  // of "sendbeaconx" - a latent forward-compat hazard for any
  // future kind name that's a prefix of an existing one. Now
  // hasSpoofTag splits on comma and exact-matches each part.
  const { ctx, originalCalled } = makeContext();
  enableSpoofs(ctx, ["sendbeaconx"]); // not a real kind; prefix of "sendbeacon" it is NOT
  ctx.navigator.sendBeacon("https://x/", "a");

  assert.strictEqual(
    originalCalled.sendBeacon,
    1,
    "original sendBeacon must be called because 'sendbeaconx' != 'sendbeacon'"
  );
});

test("comma-separated list with surrounding whitespace still matches", () => {
  // Real configs may end up with spaces around commas after manual
  // edits in the JSON editor. hasSpoofTag trims each part before
  // comparing. Lock that invariant.
  const { ctx, originalCalled } = makeContext();
  ctx.document.documentElement.dataset.hushSpoof = " sendbeacon , clipboard-read ";

  ctx.navigator.sendBeacon("https://x/", "a");
  assert.strictEqual(originalCalled.sendBeacon, 0, "sendbeacon spoofed");
});
