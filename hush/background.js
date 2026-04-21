// Background service worker bootstrap.

import initWasm, { initEngine, hushBackgroundMain } from "./dist/pkg/hush.js";

// One-shot schema migration to the Stage 9 RuleEntry shape. Runs
// every service-worker wake, but is a no-op after the first run
// thanks to the `configSchemaVersion` gate. Synchronous w.r.t.
// WASM init: must finish before the Rust side loads the config.
async function migrateConfigSchema() {
  const CURRENT = 2;
  const { configSchemaVersion, config } = await chrome.storage.local.get([
    "configSchemaVersion", "config"
  ]);
  if ((configSchemaVersion || 0) >= CURRENT) return;
  if (!config || typeof config !== "object") {
    await chrome.storage.local.set({ configSchemaVersion: CURRENT });
    return;
  }
  const FIELDS = ["block", "allow", "neuter", "silence", "remove", "hide", "spoof"];
  const next = {};
  let converted = 0;
  for (const [domain, cfg] of Object.entries(config)) {
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) continue;
    const out = {};
    for (const f of FIELDS) {
      const arr = Array.isArray(cfg[f]) ? cfg[f] : [];
      out[f] = arr.map(e => {
        if (typeof e === "string") { converted++; return { value: e }; }
        if (e && typeof e === "object") return e;
        return { value: String(e || "") };
      });
    }
    next[domain] = out;
  }
  await chrome.storage.local.set({ config: next, configSchemaVersion: CURRENT });
  console.log(`[Hush bg] migrated config to schema v${CURRENT} (${converted} string entries -> RuleEntry)`);
}

(async () => {
  try {
    await migrateConfigSchema();
    await initWasm({ module_or_path: "./dist/pkg/hush_bg.wasm" });
    try { initEngine(); } catch (e) { console.error("[Hush bg] initEngine threw", e); }
    hushBackgroundMain();
  } catch (e) {
    console.error("[Hush bg] bootstrap failed", e);
  }
})();
