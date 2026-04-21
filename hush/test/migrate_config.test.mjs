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
  assert.strictEqual(result.skipped, true);
  assert.strictEqual(result.converted, 0);
  assert.strictEqual(result.fromVersion, CURRENT_SCHEMA_VERSION);
  assert.strictEqual(result.toVersion, CURRENT_SCHEMA_VERSION);
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
  assert.strictEqual(r2.skipped, true, "second run skipped");
  assert.strictEqual(r2.converted, 0);
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
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.converted, 0);
  assert.strictEqual(result.toVersion, CURRENT_SCHEMA_VERSION);
  assert.strictEqual(
    storage._store.get("configSchemaVersion"),
    CURRENT_SCHEMA_VERSION
  );
  assert.strictEqual(storage._store.has("config"), false, "no config written");
});

test("non-object config gets only the version stamp", async () => {
  const storage = makeStorage({ config: "not an object" });
  const result = await migrateConfigSchema(storage);
  assert.strictEqual(result.skipped, false);
  assert.strictEqual(result.converted, 0);
  assert.strictEqual(result.toVersion, CURRENT_SCHEMA_VERSION);
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

test("each migration step writes its payload + version atomically", async () => {
  // Per-step atomicity. The migrator chains v1->v2 (rule-entry
  // reshape) and v2->v3 (version-bump anchor). Each step writes
  // its transformed data AND the new version stamp in a single
  // set() call, so a crash between steps leaves the
  // last-completed version correctly paired with its data.
  // v0 -> v3 takes 2 set() calls (one per step).
  const storage = makeStorage({
    config: { "example.com": { block: ["||x"] } },
  });
  await migrateConfigSchema(storage);
  assert.strictEqual(
    storage._setCount(),
    2,
    "two set() calls for v0 -> v3 (v1->v2 reshape, v2->v3 bump)"
  );
});

test("fresh v2 install only runs the v2 -> v3 step (one set)", async () => {
  // Installs that are already at v2 (bare schema stamp) only
  // need the version-bump step to reach v3.
  const storage = makeStorage({
    configSchemaVersion: 2,
    config: { "example.com": { block: [{ value: "||x" }] } },
  });
  await migrateConfigSchema(storage);
  assert.strictEqual(
    storage._setCount(),
    1,
    "one set() call for v2 -> v3 bump"
  );
  assert.strictEqual(
    storage._store.get("configSchemaVersion"),
    CURRENT_SCHEMA_VERSION
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

test("reports fromVersion and toVersion for observability", async () => {
  // v0 -> v3 chain: both legs report in the summary.
  const storage = makeStorage({
    config: { "example.com": { block: [{ value: "||x" }] } },
  });
  const r1 = await migrateConfigSchema(storage);
  assert.strictEqual(r1.fromVersion, 0);
  assert.strictEqual(r1.toVersion, 3);

  // Already current: fromVersion == toVersion == CURRENT.
  const storage2 = makeStorage({
    configSchemaVersion: CURRENT_SCHEMA_VERSION,
    config: { "example.com": { block: [{ value: "||x" }] } },
  });
  const r2 = await migrateConfigSchema(storage2);
  assert.strictEqual(r2.fromVersion, CURRENT_SCHEMA_VERSION);
  assert.strictEqual(r2.toVersion, CURRENT_SCHEMA_VERSION);
});

test("mid-chain crash after v1->v2 still advances version, v2->v3 completes next wake", async () => {
  // Simulate a crash between the v1->v2 set and the v2->v3 set.
  // crashOnNthSet: 2 aborts the SECOND set call (the v2->v3 bump)
  // after v1->v2 has already stamped version 2. Next wake picks
  // up at v2 and runs only the v2->v3 step.
  const storage = makeStorage(
    { config: { "example.com": { block: ["||x"] } } },
    { crashOnNthSet: 2 }
  );

  await assert.rejects(
    () => migrateConfigSchema(storage),
    /simulated storage crash/
  );

  // v1->v2 landed atomically: version is 2 and config is reshaped.
  assert.strictEqual(storage._store.get("configSchemaVersion"), 2);
  assert.deepStrictEqual(
    storage._store.get("config")["example.com"].block,
    [{ value: "||x" }],
    "v1->v2 reshape preserved"
  );

  // Next wake: picks up from v2, runs only v2->v3.
  const r2 = await migrateConfigSchema(storage);
  assert.strictEqual(r2.fromVersion, 2);
  assert.strictEqual(r2.toVersion, 3);
  assert.strictEqual(r2.converted, 0, "v1->v2 already ran last wake");
  assert.strictEqual(
    storage._store.get("configSchemaVersion"),
    CURRENT_SCHEMA_VERSION
  );
});
