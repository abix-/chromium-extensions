import { test } from "node:test";
import assert from "node:assert/strict";

import { withRetry, RETRY_DELAYS_MS } from "../learn.js";

// A page that answers with the given results in order, like the in-page
// functions do: { data } or { error, status }.
const answers = (...results) => {
  let i = 0;
  return () => Promise.resolve(results[i++]);
};
const busy = (status) => ({ error: `browse: HTTP ${status}`, status });
const noWait = () => Promise.resolve();

test("a 503 then a 429 are waited out and the same page is asked for again", async () => {
  const waits = [];
  const data = await withRetry(answers(busy(503), busy(429), { data: "page" }), (ms, status) => waits.push([ms, status]), noWait);
  assert.equal(data, "page");
  assert.deepEqual(waits, [[RETRY_DELAYS_MS[0], 503], [RETRY_DELAYS_MS[1], 429]]);
});

test("each wait is longer than the one before", () => {
  for (let i = 1; i < RETRY_DELAYS_MS.length; i++) assert.ok(RETRY_DELAYS_MS[i] > RETRY_DELAYS_MS[i - 1]);
});

test("a site still busy after every retry fails with its own message", async () => {
  const results = Array.from({ length: RETRY_DELAYS_MS.length + 1 }, () => busy(503));
  await assert.rejects(withRetry(answers(...results), () => {}, noWait), /browse: HTTP 503/);
});

test("other errors fail at once, without waiting", async () => {
  const waits = [];
  await assert.rejects(
    withRetry(answers({ error: "not signed in to YouTube in this Chrome" }), () => waits.push(1), noWait),
    /not signed in/,
  );
  await assert.rejects(withRetry(answers(busy(404)), () => waits.push(1), noWait), /HTTP 404/);
  assert.equal(waits.length, 0);
});
