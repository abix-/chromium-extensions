// Settings page bootstrap. The page renders from Leptos in the WASM
// bundle. See `src/options.rs`.

import initWasm, { upitOptionsMain } from "./dist/pkg/upit.js";

(async () => {
  try {
    await initWasm({ module_or_path: "./dist/pkg/upit_bg.wasm" });
    upitOptionsMain();
  } catch (e) {
    console.error("[upit options] bootstrap failed", e);
  }
})();
