# todo

Repo-wide priorities across all three extensions. Informed by
the kovarex review. P0 = credibility / stability. P1 = high
impact, small effort. P2 = polish + coverage. P3 = nice-to-have.

Per-extension backlogs live in each extension's own docs
(`hush/docs/roadmap.md`, etc.). This file is the cross-cutting
view.

## P0 — do first

Small, blocking, or trust-destroying if left. None are more than
a morning's work.

### Delete the stale version-drift item from hush/docs/roadmap.md

P3 says "manifest.json says 0.10.0; Cargo.toml says 0.12.0 —
bump the manifest to match." Both already read 0.12.0. The
roadmap's own maintenance rule says shipped items get deleted.
30 seconds. Credibility fix — if the roadmap lies about one
thing, the reader stops trusting it about everything.

### Kill the production `.unwrap()` in hush/src/background.rs:2123

```rust
let tab_id = tab_id.unwrap();
```

Panics the service worker if a message arrives with no tab id —
which happens. Replace with early-return. Ten seconds.

### Add GitHub Actions CI

No workflow today. 119 passing tests that nothing enforces on
push. `filter-anything-everywhere` has a one-file jest suite
with no gate. Zero way to catch a bad commit before it lands.

Minimum workflow — one job per extension:

- **hush**: `cargo test --manifest-path hush/Cargo.toml`
  + `cargo check --manifest-path hush/Cargo.toml --target wasm32-unknown-unknown`
  + `npm --prefix hush run build` (wasm-pack release).
- **filter-anything-everywhere**: `npm --prefix
  filter-anything-everywhere ci` + `npm --prefix
  filter-anything-everywhere run build` + `npm --prefix
  filter-anything-everywhere test`.
- **zoom-extension**: `node --check zoom-extension/content.js`
  + `node --check zoom-extension/options.js`. That's it
  until the extension gets real tests.

Trigger on `push` to any branch and on pull requests. 15 min to
write, enforced forever.

### Write filter-anything-everywhere/CHANGELOG.md

Fork with no changelog = fork that can't merge upstream. Document
every delta from upstream:

- jQuery 4 `$.isWindow()` removal inlined at `content.ts:184`.
- `@ts-expect-error` → `@ts-ignore` + `(window as any).hasAqi`
  in `browser_action.ts` (accommodates new `@types/chrome`).
- `tsconfig.json` gained explicit `"rootDir": "./extension"`
  for TypeScript 6.
- `@rollup/plugin-eslint` dropped from `rollup.config.js`;
  eslint now runs standalone via `npm run lint`.
- `prepare_extension.ps1`: `Start-Process "rollup"` → `npx
  --no-install rollup -c`; dead `Move-Item` removed.
- Dependency sweep to latest (ncu): rollup 3→4, TypeScript
  5→6, Jest 29→30, jQuery 3→4, `@types/chrome` 0.0.225 →
  0.1.40, eslint 8→10, prettier 2→3, etc.

Without this, the next upstream merge is impossible.

## P1 — high impact, small effort

### Hush: run the Criterion bench, commit results

`benches/compute_suggestions.rs` exists and hasn't been run
since four new detectors landed (attention-tracking,
clipboard-read, device-api-probe, navigator-fp). No idea if the
hot path regressed.

1. `cargo bench --manifest-path hush/Cargo.toml
   --bench compute_suggestions`.
2. Record means / stddevs in `hush/docs/benchmarks.md`.
3. Gate future detector additions on "bench didn't regress."

### Hush: measure popup cold-open against the 100ms budget

Stated performance budget (hush/docs/roadmap.md). Never verified.
WASM bundle is 1.5 MB. Likely over. Measure via DevTools
Performance → Record → click extension icon → stop. If over
budget, profile the slow path (likely Leptos mount + async-
fetch waterfall in `ui_popup.rs`).

### Hush: ship the three seed profiles already

Roadmap P1 for multiple sessions; nothing delivered. Author:

- `hush/profiles/brave-supplement.json` — the whole point of the
  Brave-stack positioning. Site-specific Remove/Hide + first-
  party telemetry blocks + Neuter rules for bundled session-
  replay libs.
- `hush/profiles/news-site-baseline.json` — first-party telemetry
  beacons, social-widget iframes, cookie-banner overlays.
- `hush/profiles/social-media-declutter.json` — Reddit
  promoted-post removes, Twitter/X trending hides.

The import/export code has been shipped. Nothing to import
without seed content.

### Zoom-extension: headless regression test

Three failed pivots in one session. A Puppeteer or Playwright
test that:

1. Loads the extension.
2. Opens a fake YouTube DOM snapshot with
   `.ytp-fullscreen-grid-stills-container`.
3. Asserts the element is hidden after content.css applies.
4. Fires a wheel event in fullscreen and asserts no grid
   reveal.

Would have caught the black-screen bug in seconds. Would catch
any future regression when YouTube renames classes (they will).

## P2 — polish, coverage, structural

### Hush: split the monoliths

Four files north of 2000 LOC:

```
2499 src/background.rs
2362 src/ui_popup.rs
2057 src/ui_options.rs
1991 src/detectors.rs
```

Splits (seams already exist):

- `background.rs` → `background/{listeners,dnr,state,handlers}.rs`.
  DNR sync is the obvious first extraction (~400 LOC,
  self-contained).
- `ui_popup.rs` → one module per section (firewall log / blocked
  panel / hide panel / suggestions list).
- `ui_options.rs` → one module per top-level component
  (RulesTable / AllowlistEditor / JsonEditor / UrlSimulator).
- `detectors.rs` → one file per detector family. Keep the
  dispatch aggregator in detectors.rs proper.

Do this before the files grow past 3000. They will if you don't.

### Hush: rule-simulate regression test against the UI path

Stage 13 (simulate) has pure-function tests against
`simulate::simulate_url`. The options-editor UI path that
consumes those results isn't exercised. After four new detector
additions and a flat-table refactor, verify the simulate panel
renders matches for every action type end-to-end.

Either wasm-based component test or Playwright against a loaded
extension.

### Filter-anything-everywhere: fill the test gap

One 128-line `word_matcher.spec.ts` is the only test covering a
416-line `content.ts`. At minimum:

- Unit-test `hostname.ts` (7 lines — trivial).
- Unit-test the keyword-matching path in `content.ts`.
- Integration test: load a fixture DOM, apply rules, assert
  filtering.

### Hush: security review of spoof / neuter / silence

These actions rewrite site behavior. Fake `fetch` responses,
deny `addEventListener`, constant fingerprint returns. One bug
breaks sites silently.

Add a smoke test: load a handful of popular sites with each
action enabled and confirm normal page behavior (scroll, clicks,
navigation). Record expected breakage in `hush/docs/spoof-
compatibility.md`.

### Zoom-extension: changelog

Three pivots, no changelog. Create `zoom-extension/CHANGELOG.md`.
Minimum: initial version + each meaningful iteration (wheel
blocker, DOM removal attempt, CSS-only final).

## P3 — nice to have

### Hush: priority 2 items from hush/docs/roadmap.md

- Crypto-mining heuristic.
- Tier 4 first-party supercookies.
- Tier 6 service-worker registration disclosure.
- Profile-import conflict dialog.

Each is genuinely useful but strictly less impactful than seed
profiles shipping or perf baselines existing.

### Hush: priority 3 items from hush/docs/roadmap.md

Per-site `strip` / `referrer` / `replace` / battery/connection
detection / cross-bucket reorder / profile-subset export. These
are edge cases for a Brave user. Don't block P1/P2 on them.

### Filter-anything-everywhere: decide the fork's future

Upstream is unmaintained (per README / user context). Options:

- Keep in sync with occasional upstream merges if they resume.
- Adopt as the primary fork and rebrand.
- Consolidate features into hush (the `hide` action + Remove
  action cover some of the same ground).

No need to decide now, but the CHANGELOG above is prerequisite
for any of these paths.

### Cross-extension: shared tooling

All three extensions have their own build + load story. Once
there are 4+ extensions it's worth a shared `tools/` with:

- A generic `load-dev.ps1` / `.sh` that prints the correct
  load-unpacked path for each.
- A `check-all.sh` that runs every extension's test + build.

Premature right now. Revisit when a fourth extension lands.

## Out of scope

These will come up but shouldn't go on the todo yet:

- **Cargo workspace** for hush + any future Rust extension. Wait
  until a second Rust extension exists and is sharing code.
- **Shared `crates/` directory**. Same — premature abstraction
  until there's actual sharing.
- **Chrome Web Store submission** for any of the three. All
  require screenshots, privacy policies, store listings. Do
  once the extensions are stable enough that updates aren't
  weekly.
