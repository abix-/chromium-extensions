// Background service worker bootstrap.

import initWasm, { initEngine, hushBackgroundMain } from "./dist/pkg/hush.js";
import { migrateConfigSchema, CURRENT_SCHEMA_VERSION } from "./migrate_config.mjs";

(async () => {
  try {
    const result = await migrateConfigSchema(chrome.storage.local);
    if (!result.skipped) {
      console.log(
        `[Hush bg] migrated storage schema v${result.fromVersion} -> v${result.toVersion}`
        + (result.converted > 0 ? ` (${result.converted} bare-string rule entries rewritten)` : "")
      );
    }
    await initWasm({ module_or_path: "./dist/pkg/hush_bg.wasm" });
    try { initEngine(); } catch (e) { console.error("[Hush bg] initEngine threw", e); }
    hushBackgroundMain();
  } catch (e) {
    console.error("[Hush bg] bootstrap failed", e);
  }
})();
