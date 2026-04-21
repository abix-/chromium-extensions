# todo

Cross-extension priority queue. Re-prioritized against
[review-2026-04.md](review-2026-04.md)'s 10-year durability bar
(runs 10 years, daily use by 100 people, never needs a code
update).

Priority buckets:

- **P0** — durability risks + broken invariants. Addresses the
  single largest rot threats and silent-failure paths.
- **P1** — hard infrastructure gaps. Tests on load-bearing code,
  schema versioning, correctness audits.
- **P2** — polish + coverage + readability.
- **P3** — nice-to-have.

Every item names file:line where applicable. Citations trace
back to the review so the rationale is grep-able.

## P0 — durability risks + broken invariants

### Rip Leptos out of the load-bearing UI

> Review: *"Pre-1.0 framework dependency in load-bearing code is
> the single largest durability risk in the repo."*

~4500 LOC across `hush/src/ui_popup.rs` (2362) and
`hush/src/ui_options.rs` (2057) is tied to `leptos = "0.8"`, a
framework that has already refactored its reactive engine twice
at the minor-version level. The popup and options render tables;
neither needs fine-grained reactivity.

Scope:
- Rewrite popup + options as vanilla TS + DOM. Target < 800 LOC
  combined. The zoom-extension options page does the same kind
  of round-tripping in 34 LOC and proves the point.
- Keep the simulate panel + firewall-log view only if reactivity
  pays for itself there. Audit by feature.
- Delete `leptos` from `hush/Cargo.toml`. Delete `mem::forget
  (leptos::mount::mount_to(...))` incantations (5 sites).

### Audit every silent error swallow in `hush/src/background.rs`

> Review: *"`sync_dynamic_rules()` failing means the user's
> Block rules don't fire."*

Sites:

- `:430` — `let _ = do_sync_dynamic_rules().await;`
- `:1021-1025` — five bootstrap awaits under `let _ =`
  (`refresh_debug_flag`, `seed_config_if_empty`,
  `seed_allowlist_if_empty`, `load_allowlist`,
  `sync_dynamic_rules`)
- `:1038-1040` — same three on the startup branch

Each call returns a `Result`. On startup they silently discard
failures, leaving the user with a broken extension and no
signal. Minimum:

```rust
if let Err(e) = sync_dynamic_rules().await {
    log_error(&format!("sync_dynamic_rules failed: {e:?}"));
}
```

Better: surface to the debug-info payload + badge so the user
knows something didn't boot.

### Add GitHub Actions CI

No `.github/workflows/` today. 119 tests enforced by author
discipline only. Jobs per extension:

- **hush**: `cargo test` + `cargo check --target
  wasm32-unknown-unknown` + `npm --prefix hush run build`.
- **filter-anything-everywhere**: `npm ci` + `npm run build` +
  `npm test`.
- **zoom-extension**: `node --check` on both `.js` files.

Trigger on `push` and `pull_request`. ~20 minutes of setup,
enforced forever.

### Delete the stale version-drift item from `hush/docs/roadmap.md`

P3 in hush's roadmap reads *"manifest.json says 0.10.0; Cargo.toml
says 0.12.0 — bump the manifest to match"*. Both already read
0.12.0. The roadmap's own maintenance rule says shipped items
get deleted. If the roadmap lies about one thing, it's trusted
about nothing. 30 seconds.

### Kill the guarded-but-ugly unwrap at `hush/src/background.rs:2123`

```rust
if tab_id.is_none() || key.is_empty() { ... return; }
let tab_id = tab_id.unwrap();
```

Safe today; one refactor to the guard breaks it. Idiomatic:
`if let Some(tab_id) = tab_id { ... } else { reply_false(); return; }`.
Every non-test `.unwrap()` is a failed-invariant check waiting
for a refactor.

### Write `filter-anything-everywhere/CHANGELOG.md`

Fork with no CHANGELOG can't merge upstream. Document every
delta this fork carries:

- jQuery 4 `$.isWindow()` removal inlined at `content.ts:184`.
- `@ts-expect-error` → `@ts-ignore` at `browser_action.ts:173`
  for the new permissive `@types/chrome`.
- `tsconfig.json` gained explicit `"rootDir": "./extension"`
  for TypeScript 6.
- `@rollup/plugin-eslint` removed from `rollup.config.js`.
- `prepare_extension.ps1`: `npx --no-install rollup -c`;
  dead `Move-Item` removed.
- Dependency sweep to latest (ncu): rollup 3→4, TS 5→6,
  jest 29→30, jQuery 3→4, `@types/chrome` 0.0.225→0.1.40,
  eslint 8→10, prettier 2→3, etc.

## P1 — hard infrastructure gaps

### Schema-version everything in `chrome.storage.local`

> Review: *"Day 1 of a schema migration, you beg for a version
> number. Stamp it now."*

Wrap every stored value:

```json
{
  "__hush_schema_version": 1,
  "data": { ... }
}
```

Read path checks the version and migrates if old. Write path
always sets current. Without this, the first breaking schema
change means a stop-the-world parse-and-guess job.

### Replace `rule_id` string format with a struct

> Review: *"A match containing `::` (e.g. `||foo::bar.example
> .com`) creates an unreachable rule id."*

`hush/src/types.rs::rule_id` returns
`format!("{action}::{scope}::{match_}")`. No version, no escape.
Users typing `::` in a pattern create rules that can never be
referenced back. Switch to a struct:

```rust
pub struct RuleId { pub action: String, pub scope: String, pub match_: String }
```

...serialized via serde_json when used as a string key.
Round-trip-safe for any input.

### Tests on `hush/mainworld.js`

913 LOC of security-sensitive prototype-patching —
`fetch`/`XHR`/`sendBeacon`/`addEventListener`/`Clipboard.readText`/
`Bluetooth.requestDevice`/navigator getters/canvas/WebGL/audio.
Zero tests.

Minimum viable harness:
- Node + jsdom (or similar) simulated Window + document.
- Test hook installation (prototype is patched).
- Test call-through (original behavior preserved).
- Test emit payload shape (kind, method, stack).
- Test spoof dedup via `hushSpoofEmitted` Set.
- Test every spoof branch (canvas / audio / font-enum /
  webgl-unmasked).

### Tests on `hush/src/background.rs` handlers

2499 LOC of service-worker logic. Zero unit coverage on DNR
sync, handler dispatch, or persistence. Use
`wasm-bindgen-test` + the existing `BackgroundState` + mock JS
values via `serde_wasm_bindgen`. Target the hot paths:
`handle_stats`, `do_sync_dynamic_rules`,
`push_firewall_event`, `schedule_persist_stats`.

### Regex metachar escape audit in `filter-anything-everywhere`

`extension/content.ts:234` feeds user-entered blacklist words
straight into `regexpFromWordList`. `word_matcher.ts` (41 LOC)
either escapes or it doesn't — audit, test, fix if broken.
A user typing `c++`, `(test)`, or `a.b` crashes the matcher or
silently matches nothing.

### Ship the three Hush seed profiles

Import/export code shipped sessions ago; no seed content to
import. Author `hush/profiles/`:

- `brave-supplement.json` — the whole point of the Brave-stack
  positioning. Site-specific Remove/Hide + first-party telemetry
  blocks + Neuter rules for bundled session-replay libraries.
- `news-site-baseline.json` — first-party telemetry beacons,
  social-widget iframes, cookie-banner overlays.
- `social-media-declutter.json` — Reddit promoted-post removes,
  Twitter/X trending hides.

### Run the Criterion bench, commit baseline

`hush/benches/compute_suggestions.rs` exists. Four detectors
shipped since the last recorded baseline (attention-tracking,
clipboard-read, device-api-probe, navigator-fp). Run; commit
means / stddevs to `hush/docs/benchmarks.md`; gate future
detector additions on no-regression.

### Measure popup cold-open against the 100ms budget

Stated budget in `hush/docs/roadmap.md`. Never verified. WASM
bundle is 1.5 MB. DevTools Performance → Record → click
extension icon → stop. If over budget, profile the slow path
(likely Leptos mount + async-fetch waterfall — which evaporates
when P0 #1 lands).

## P2 — polish + coverage

### Replace the `zoom-extension` 1 Hz poll

`zoom-extension/content.js:200`:

```js
setInterval(() => { ... }, 1000);
```

100 users × daily YouTube × 10 years = hundreds of billions of
wasted queries. Switch to a `MutationObserver` on the player
container that wakes on `<video>` element insertion.

### Move YouTube selectors to a JSON config file

`zoom-extension/content.css` pins `.ytp-fullscreen-grid*` class
names. YouTube renames internal markup ~annually. Extract to
`zoom-extension/selectors.json`:

```json
{ "fullscreen_grid_classes": [
  "ytp-fullscreen-grid",
  "ytp-fullscreen-grid-main-content",
  "ytp-fullscreen-grid-stills-container",
  "ytp-fullscreen-grid-buttons-container"
] }
```

A rename becomes a JSON edit, not a code + css + docs change.

### Dial down the Rust version pin

`hush/Cargo.toml`:

```toml
edition = "2024"
rust-version = "1.95"
```

Distro stable Rust trails by ~1 year. A 10-year codebase uses
a conservative MSRV actually needed by deps. Reality-check —
probably `rust-version = "1.80"` and `edition = "2021"` work
fine.

### Runtime self-test for `Error().stack` format

`hush/src/stack.rs` + `hush/mainworld.js::cap` parse V8 stack
strings. V8 has changed the format before. At `mainworld.js`
init, synthesize a known `new Error().stack` and confirm it
matches the parser's assumptions. If not, bail loud via the
debug payload and fall back to empty origin (graceful
degradation, not silent miss).

### Split the four Hush monoliths

```
2499 src/background.rs      → src/background/{listeners,dnr,state,handlers}.rs
2362 src/ui_popup.rs        → one module per section
2057 src/ui_options.rs      → one module per top-level component
1991 src/detectors.rs       → one file per detector family
```

Seams exist. Readability compound interest over 10 years. Do
this after P0 #1 (Leptos rip) — most of `ui_*.rs` will shrink
massively during that work anyway.

### Zoom-extension headless regression test

Three failed pivots in one session proved the need. Puppeteer
or Playwright:

1. Load the extension unpacked.
2. Open a fake YouTube DOM snapshot containing
   `.ytp-fullscreen-grid-stills-container`.
3. Assert the grid is not visible after content.css applies.
4. Fire a wheel event in simulated fullscreen; assert no reveal.

Would have caught the black-screen bug in seconds.

### Rule-simulate UI regression test

Stage 13 has pure-function tests on
`hush::simulate::simulate_url`. The options-editor UI path that
consumes those results has no coverage. After four new detectors
and a flat-table refactor, verify the simulate panel renders
matches for every action type.

### Fill `filter-anything-everywhere` test gaps

One 128-LOC `word_matcher.spec.ts` covers a 41-LOC
`word_matcher.ts`. The 416-LOC `content.ts` (the whole runtime)
has none. Minimum:

- `hostname.ts` unit test (7 lines, trivial).
- Keyword matcher end-to-end with fixture DOM.
- Mutation-observer debounce path.

### Security smoke for hush spoof / neuter / silence

These actions rewrite live site behavior — fake fetch responses,
deny listener registrations, constant fingerprint returns. One
bug breaks sites silently. Load 5-10 popular sites with each
action active; record expected breakage in
`hush/docs/spoof-compatibility.md`.

### `zoom-extension/CHANGELOG.md`

Three pivots, no changelog. Seed with the current state and
each meaningful iteration going forward.

## P3 — nice-to-have

### Structured logging + request IDs

Scattered `console.log` calls. Nothing correlates a detector
firing to a rule hit to a DNR match. One correlation ID per
tab / navigation would make debugging a 10th as painful.

### Permission audit for `hush/manifest.json`

Multiple chrome.* permissions. No justification doc. Annual
audit: for each permission, is it still minimum-necessary? Log
diffs over time.

### Hush roadmap P2 (was)

- Crypto-mining heuristic.
- Tier 4 first-party supercookies.
- Tier 6 service-worker registration disclosure.
- Profile-import conflict dialog.

### Hush roadmap P3 (was)

Per-site `strip` / `referrer` / `replace` / battery/connection
detection / cross-bucket reorder / profile-subset export.

### filter-anything-everywhere fork future

Upstream unmaintained. Decide:

- Keep pulling if they resume.
- Adopt as the primary fork and rebrand.
- Consolidate features into hush.

No need to decide yet; CHANGELOG (P0 above) is prerequisite to
any path.

### Cross-extension shared tooling

When a fourth extension lands, a shared `tools/` with
`check-all.sh` + `load-dev.ps1` starts paying off. Premature
today.

## Out of scope

- **Cargo workspace** — wait until a second Rust extension
  actually shares code.
- **Shared `crates/` directory** — same.
- **Chrome Web Store submission** — all three need privacy
  policies, screenshots, and stable release cadences first.

## Grade tracking

| Review date | Grade | Delta |
|---|---|---|
| [2026-04](review-2026-04.md) | 6.5/10 | — |

Target after P0 complete: 7.5+. Target after P1 complete: 8.5.
9+ needs the polish items in P2. 10 requires passing the
"10-year, daily use by 100, zero code changes" bar — probably
never achievable for a browser extension given MV3's instability,
but the further we get toward 9 the better the tail.
