// Schema migrator for `chrome.storage.local`.
//
// Runs on every service-worker wake. No-ops after the first run
// thanks to the `configSchemaVersion` gate (kept under that name
// for backward compat; it governs the whole storage schema now,
// not just `config`). Extracted from background.js so it can be
// unit-tested with a mock storage without loading the WASM
// bootstrap.
//
// Version history:
//   v1 -> v2  Rule entries were bare strings ("||ads.example.com");
//             they're now objects `{ value, disabled?, tags?, comment? }`.
//             Migrator converts any bare strings it finds. The Rust
//             side refuses to parse bare strings, so this MUST run
//             before wasm init on any install upgrading from v1.
//   v2 -> v3  No data-format changes. Version bump reserved for the
//             "stamp it now" anchor (see Kovarex-review 2026-04):
//             this is the first version that explicitly governs
//             `options` and `allowlist` in addition to `config`.
//             Future breaking changes to any of those three blobs
//             add a `migrateVN_VN1` function below and bump
//             CURRENT_SCHEMA_VERSION.
//
// Pattern for future migrations:
//   1. Add `async function migrateVN_VN1(storage, current) { ... }`
//      that reads any needed keys, transforms, and writes back.
//   2. Append a `migrate V(current) -> V(current+1)` arm to the
//      chain below.
//   3. Bump CURRENT_SCHEMA_VERSION.
//   4. Update the tests in test/migrate_storage.test.mjs.
//
// Atomic-write contract: every per-step migration writes its
// transformed data AND the new schema-version in a single
// `storage.set()` call. chrome.storage.local guarantees
// per-set-call atomicity, so a crash between steps leaves the
// last-completed version stamped correctly and the next wake
// resumes from there. Splitting the writes would risk "stamped
// version without migrated payload" corruption.

export const CURRENT_SCHEMA_VERSION = 3;

// Rule buckets on SiteConfig. Kept in sync with the `SiteConfig`
// struct in src/types.rs (`hide/remove/block/allow/neuter/silence/
// spoof`). Any new action bucket added to the Rust side needs a
// line here AND a migration-version bump.
const FIELDS = ["block", "allow", "neuter", "silence", "remove", "hide", "spoof"];

/**
 * Migrate storage to the current schema. Idempotent.
 *
 * @param {{ get: (keys: string[]) => Promise<object>, set: (obj: object) => Promise<void> }} storage
 *   A chrome.storage.local-shaped store. Tests pass a mock; production
 *   passes the real `chrome.storage.local`.
 * @returns {Promise<{ skipped: boolean, converted: number, fromVersion: number, toVersion: number }>}
 *   `skipped` true iff no migration was needed (already at CURRENT).
 *   `converted` counts bare-string rule entries rewritten to objects
 *   during the v1->v2 step (0 for wakes that start at v2 or later).
 *   `fromVersion` / `toVersion` bracket the jump made this wake.
 */
export async function migrateStorageSchema(storage) {
  const snapshot = await storage.get(["configSchemaVersion", "config"]);
  const fromVersion = snapshot.configSchemaVersion || 0;
  if (fromVersion >= CURRENT_SCHEMA_VERSION) {
    return {
      skipped: true,
      converted: 0,
      fromVersion,
      toVersion: fromVersion,
    };
  }

  let current = fromVersion;
  let totalConverted = 0;

  // v0/v1 -> v2: string-to-RuleEntry conversion on config.
  if (current < 2) {
    const res = await migrateV1_V2(storage, snapshot.config);
    totalConverted += res.converted;
    current = 2;
  }

  // v2 -> v3: version-bump only (anchor for future per-blob
  // migrations of options / allowlist). No data reshape.
  if (current < 3) {
    await storage.set({ configSchemaVersion: 3 });
    current = 3;
  }

  return {
    skipped: false,
    converted: totalConverted,
    fromVersion,
    toVersion: current,
  };
}

/**
 * v1 -> v2: Convert bare-string rule entries inside `config[*][action]`
 * arrays into `{ value: string }` objects. Preserves any entry that
 * is already an object. Writes `config` and `configSchemaVersion = 2`
 * in one atomic set() call.
 */
async function migrateV1_V2(storage, config) {
  if (!config || typeof config !== "object") {
    await storage.set({ configSchemaVersion: 2 });
    return { converted: 0 };
  }
  const next = {};
  let converted = 0;
  for (const [domain, cfg] of Object.entries(config)) {
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) continue;
    const out = {};
    for (const f of FIELDS) {
      const arr = Array.isArray(cfg[f]) ? cfg[f] : [];
      out[f] = arr.map((e) => {
        if (typeof e === "string") {
          converted++;
          return { value: e };
        }
        if (e && typeof e === "object") return e;
        return { value: String(e || "") };
      });
    }
    next[domain] = out;
  }
  await storage.set({ config: next, configSchemaVersion: 2 });
  return { converted };
}

// Backward-compat re-export. Older call sites imported
// `migrateConfigSchema` + `CURRENT_SCHEMA_VERSION` from
// migrate_config.mjs. migrate_config.mjs now re-exports from
// here, but keeping the legacy name available under the new
// module too lets internal call sites migrate at their own pace.
export { migrateStorageSchema as migrateConfigSchema };
