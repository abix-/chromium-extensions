// Tests for the config-schema migrator (migrate_config.mjs).
//
// Covers: idempotence, no-op at current schema, empty-config fast
// path, the v1->v2 string->RuleEntry conversion, preservation of
// existing object entries, and atomicity of the two-key write so
// a crash between writes can't leave configSchemaVersion stamped
// without the migrated config.

import { test } from "node:test";
import assert from "node:assert";
import {
  migrateConfigSchema,
  CURRENT_SCHEMA_VERSION,
} from "../migrate_config.mjs";

// Minimal chrome.storage.local-shaped mock backed by a plain
// Map. `get(keys)` returns just the requested keys; `set(obj)`
// merges atomically. `crashAfterSet` (optional) lets a test
// simulate a power-cut between the `set()` call and the Promise
// resolving - mainworld's guarantee is that both keys land or
// neither lands (single-transaction semantics).
function makeStorage(initial = {}, { crashOnNthSet = null } = {}) {
  const store = new Map(Object.entries(initial));
  let setCount = 0;
  return {
    // Expose for assertions.
    _store: store,
    _setCount: () => setCount,
    async get(keys) {
      const out = {};
      for (const k of keys) {
        if (store.has(k)) out[k] = store.get(k);
      }
      return out;
    },
    async set(obj) {
      setCount += 1;
      if (crashOnNthSet === setCount) {
        // Simulate: set never actually persists and the caller
        // gets a rejected promise (transaction aborted).
        throw new Error("simulated storage crash");
      }
      for (const [k, v] of Object.entries(obj)) {
        store.set(k, v);
      }
    },
  };
}

test("migrator is a no-op when already at CURRENT_SCHEMA_VERSION", async () => {
  const storage = makeStorage({
    configSchemaVersion: CURRENT_SCHEMA_VERSION,
    config: { "example.com": { block: [{ value: "||ads" }] } },
  });
  const result = await migrateConfigSchema(storage);
  assert.deepStrictEqual(result, { skipped: true, converted: 0 });
  assert.strictEqual(storage._setCount(), 0, "no storage write when already current");
});

test("idempotent: run twice, second run is a no-op", async () => {
  const storage = makeStorage({
    config: { "example.com": { block: ["||ads"] } },
  });

  const r1 = await migrateConfigSchema(storage);
  assert.strictEqual(r1.skipped, false);
  assert.strictEqual(r1.converted, 1);

  const writesAfterFirst = storage._setCount();
  const stateAfterFirst = JSON.stringify(
    Object.fromEntries(storage._store.entries())
  );

  const r2 = await migrateConfigSchema(storage);
  assert.deepStrictEqual(r2, { skipped: true, converted: 0 }, "second run skipped");
  assert.strictEqual(
    storage._setCount(),
    writesAfterFirst,
    "second run writes nothing"
  );
  assert.strictEqual(
    JSON.stringify(Object.fromEntries(storage._store.entries())),
    stateAfterFirst,
    "storage bytes unchanged"
  );
});

test("empty config gets only the version stamp", async () => {
  const storage = makeStorage({});
  const result = await migrateConfigSchema(storage);
  assert.deepStrictEqual(result, { skipped: false, converted: 0 });
  assert.strictEqual(
    storage._store.get("configSchemaVersion"),
    CURRENT_SCHEMA_VERSION
  );
  assert.strictEqual(storage._store.has("config"), false, "no config written");
});

test("non-object config gets only the version stamp", async () => {
  const storage = makeStorage({ config: "not an object" });
  const result = await migrateConfigSchema(storage);
  assert.deepStrictEqual(result, { skipped: false, converted: 0 });
  assert.strictEqual(
    storage._store.get("configSchemaVersion"),
    CURRENT_SCHEMA_VERSION
  );
});

test("converts bare-string rule entries to {value: s} objects", async () => {
  const storage = makeStorage({
    config: {
      "example.com": {
        block: ["||ads.example.com", "||tracker.example.com"],
        remove: [".modal-overlay"],
      },
    },
  });
  const result = await migrateConfigSchema(storage);
  assert.strictEqual(result.converted, 3, "three string entries converted");

  const migrated = storage._store.get("config");
  assert.deepStrictEqual(migrated["example.com"].block, [
    { value: "||ads.example.com" },
    { value: "||tracker.example.com" },
  ]);
  assert.deepStrictEqual(migrated["example.com"].remove, [
    { value: ".modal-overlay" },
  ]);
});

test("preserves existing object entries unchanged (metadata survives)", async () => {
  const storage = makeStorage({
    config: {
      "example.com": {
        block: [
          { value: "||ads", disabled: true, tags: ["ad"], comment: "muted" },
          "||naked-string",
        ],
      },
    },
  });
  const result = await migrateConfigSchema(storage);
  assert.strictEqual(result.converted, 1, "only the string was converted");

  const migrated = storage._store.get("config");
  assert.deepStrictEqual(migrated["example.com"].block, [
    { value: "||ads", disabled: true, tags: ["ad"], comment: "muted" },
    { value: "||naked-string" },
  ]);
});

test("fills missing action buckets with empty arrays", async () => {
  const storage = makeStorage({
    config: { "example.com": { block: ["||x"] } },
  });
  await migrateConfigSchema(storage);
  const site = storage._store.get("config")["example.com"];
  // Every action bucket present even when the input had only `block`.
  for (const f of [
    "block",
    "allow",
    "neuter",
    "silence",
    "remove",
    "hide",
    "spoof",
  ]) {
    assert.ok(Array.isArray(site[f]), `${f} bucket present`);
  }
  assert.strictEqual(site.block.length, 1);
  assert.strictEqual(site.hide.length, 0);
});

test("skips non-object site entries without crashing", async () => {
  const storage = makeStorage({
    config: {
      "example.com": { block: ["||ads"] },
      "malformed.com": "not an object",
      "array.com": [1, 2, 3],
      "null.com": null,
    },
  });
  const result = await migrateConfigSchema(storage);
  assert.strictEqual(result.converted, 1);

  const migrated = storage._store.get("config");
  assert.ok(migrated["example.com"], "valid site migrated");
  assert.strictEqual(
    migrated["malformed.com"],
    undefined,
    "malformed entries dropped"
  );
  assert.strictEqual(migrated["array.com"], undefined);
  assert.strictEqual(migrated["null.com"], undefined);
});

test("writes both config and configSchemaVersion in a single set() call (atomic)", async () => {
  // The whole point of the single-set-call contract: a crash
  // between two separate writes would leave the version stamped
  // without the migrated payload. Verify one write.
  const storage = makeStorage({
    config: { "example.com": { block: ["||x"] } },
  });
  await migrateConfigSchema(storage);
  assert.strictEqual(
    storage._setCount(),
    1,
    "exactly one set() call for migration"
  );
});

test("crash during migration leaves storage untouched, next wake retries", async () => {
  const storage = makeStorage(
    { config: { "example.com": { block: ["||ads"] } } },
    { crashOnNthSet: 1 }
  );

  await assert.rejects(
    () => migrateConfigSchema(storage),
    /simulated storage crash/
  );

  // Storage unchanged: version still not stamped, config still
  // has the bare string.
  assert.strictEqual(storage._store.has("configSchemaVersion"), false);
  assert.deepStrictEqual(storage._store.get("config"), {
    "example.com": { block: ["||ads"] },
  });

  // Next wake: crash-on-nth pattern increments, we're past it now,
  // so the retry succeeds and the migration completes.
  const result = await migrateConfigSchema(storage);
  assert.strictEqual(result.converted, 1);
  assert.strictEqual(
    storage._store.get("configSchemaVersion"),
    CURRENT_SCHEMA_VERSION
  );
});

test("converts null / undefined / number rule entries to stringified fallback", async () => {
  // Robustness: the migrator must not throw on weird data shapes a
  // future bug or a hand-edited config could produce.
  const storage = makeStorage({
    config: {
      "example.com": {
        block: [null, undefined, 42, true],
      },
    },
  });
  const result = await migrateConfigSchema(storage);
  // null, undefined, 42, true: none are strings, none are objects.
  // Fallback: { value: String(e || "") }. That path gives "" for
  // null/undefined/0/false and a stringified form for truthy
  // primitives.
  const migrated = storage._store.get("config")["example.com"].block;
  assert.deepStrictEqual(migrated, [
    { value: "" },
    { value: "" },
    { value: "42" },
    { value: "true" },
  ]);
  // `converted` counts only string->object conversions; primitives
  // don't count.
  assert.strictEqual(result.converted, 0);
});
