// Side panel bootstrap. The whole panel renders from Leptos in the WASM
// bundle. See `src/panel.rs`.

import initWasm, { upitPanelMain } from "./dist/pkg/upit.js";

(async () => {
  try {
    await initWasm({ module_or_path: "./dist/pkg/upit_bg.wasm" });
    upitPanelMain();
  } catch (e) {
    console.error("[upit panel] bootstrap failed", e);
  }
})();
