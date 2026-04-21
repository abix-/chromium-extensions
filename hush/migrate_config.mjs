// Schema migrator for `chrome.storage.local["config"]`.
//
// Runs on every service-worker wake. No-ops after the first run
// thanks to the `configSchemaVersion` gate. Extracted from
// background.js so it can be unit-tested with a mock storage
// without loading the WASM bootstrap.
//
// v1 -> v2: rule entries were bare strings ("||ads.example.com");
// they're now objects `{ value, disabled?, tags?, comment? }`. The
// migrator converts any bare strings it finds. The Rust side
// refuses to parse bare strings, so this MUST run before wasm
// init on any install upgrading from v1.
//
// A config already at CURRENT_SCHEMA_VERSION is touched zero times
// (no storage write). A config that has no entries gets only the
// version bump.
//
// The atomic write at the end (`{config, configSchemaVersion}` in
// ONE set() call) matters: a crash between the two writes would
// leave schema-version stamped without the migrated payload, and
// the second run would skip migration and corrupt the user's
// config. Keeping both keys in one write relies on
// chrome.storage.local's spec-defined atomic-per-set-call
// guarantee.

export const CURRENT_SCHEMA_VERSION = 2;

// Rule buckets on SiteConfig. Kept in sync with the `SiteConfig`
// struct in src/types.rs (`hide/remove/block/allow/neuter/silence/
// spoof`). Any new action bucket added to the Rust side needs a
// line here AND a migration-version bump.
const FIELDS = ["block", "allow", "neuter", "silence", "remove", "hide", "spoof"];

/**
 * Migrate a config to the current schema. Idempotent.
 *
 * @param {{ get: (keys: string[]) => Promise<object>, set: (obj: object) => Promise<void> }} storage
 *   A chrome.storage.local-shaped store. Tests pass a mock; production
 *   passes the real `chrome.storage.local`.
 * @returns {Promise<{ skipped: boolean, converted: number }>}
 *   `skipped` true iff no migration was needed (already at CURRENT).
 *   `converted` counts bare-string rule entries rewritten to objects.
 */
export async function migrateConfigSchema(storage) {
  const { configSchemaVersion, config } = await storage.get([
    "configSchemaVersion",
    "config",
  ]);
  if ((configSchemaVersion || 0) >= CURRENT_SCHEMA_VERSION) {
    return { skipped: true, converted: 0 };
  }
  if (!config || typeof config !== "object") {
    await storage.set({ configSchemaVersion: CURRENT_SCHEMA_VERSION });
    return { skipped: false, converted: 0 };
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
  await storage.set({
    config: next,
    configSchemaVersion: CURRENT_SCHEMA_VERSION,
  });
  return { skipped: false, converted };
}
