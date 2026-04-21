# todo

Cross-extension priority queue. Re-prioritized against
[review-2026-04.md](review-2026-04.md)'s 10-year durability bar
(runs 10 years, daily use by 100 people, never needs a code
update).

Updated 2026-04-21 with second-pass code-level deep-audit
findings (three new P0s, two new P1s, three new P2s, one item
dropped). The deep audit didn't write a companion doc - each
new item below cites file:line directly.

**2026-04-21 P0 session**: shipped localhost-POST removal,
substring-self-filter fix, guarded-unwrap fix, silent-error
audit on startup/storage-changed paths, version-drift roadmap
cleanup, filter-anything-everywhere CHANGELOG seed, and CI
workflow. Those items removed from the list below. Leptos rip
stays open (explicitly deferred; multi-session work). Two new
P2 items added from CI setup: clippy lint cleanup (36 lints)
and eslint flat-config migration.

Priority buckets:

- **P0** - durability risks + broken invariants. Addresses the
  single largest rot threats and silent-failure paths.
- **P1** - hard infrastructure gaps. Tests on load-bearing code,
  schema versioning, correctness audits.
- **P2** - polish + coverage + readability.
- **P3** - nice-to-have.

Every item names file:line where applicable.

## P0 - durability risks + broken invariants

### Port `content.js` to Rust/WASM

Doc-reconcile path taken 2026-04-21: `history.md` Stage 5 Iter 6
block rewritten to say the port "did not land," and
`architecture.md` confirmed content.js as pure-JS. That closes
the *lie*, not the *gap*: the content script is still 689 LOC
of hand-maintained JS that duplicates what `src/allowlist.rs` +
a would-be `src/content.rs` would own. Every rule-evaluation
code path now exists in two languages with no cross-language
test enforcing parity.

Port for real when the Leptos rip is landed and WASM bundle-
load cost is understood end-to-end. Until then this is a
medium-term rot risk: JS side drifts from Rust-side detectors
silently.

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

### (mostly done 2026-04-21) Surface swallowed errors

Earlier: all 6 startup / storage-changed paths
(`refresh_debug_flag`, `seed_config_if_empty`, `seed_allowlist_if_empty`,
`load_allowlist`, `sync_dynamic_rules`, plus the retry loop +
config-changed sync + allowlist-changed load) route through
`log_error` with descriptive phase prefixes.

Now: that's paired with a **bootstrap-health surface**. Every
such failure also pushes a `BootstrapError { t, phase, msg }`
onto a per-SW-wake FIFO (cap 20) in `BackgroundState`. New
message `hush:get-bootstrap-errors` exposes it; the popup's
new `<BootstrapErrorBanner>` renders a red banner at the top
with a scrollable list of phase + message lines. Silent on a
healthy wake.

Still pending (P2 follow-up): the ~18 minor `.ok()` sites in
`background.rs` (badge updates, DNR-rule metadata extraction)
still swallow. Their failures are cosmetic and don't warrant
the banner; consider a dedicated "minor-errors counter" or
leave as-is.

Also pending: badge color/title change (currently no change -
banner is the only surface). Adding badge requires coordinating
with the existing yellow-`!` / grey-count badge states; modeled
but not yet implemented.

## P1 - hard infrastructure gaps

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

### (substantially done 2026-04-21) Tests on `hush/mainworld.js`

Shipped: shared `test/_harness.mjs` (vm-context builder with every
Web API stub mainworld needs) plus three test files:
- `emit_contract.test.mjs` (18 tests) - every emit() call site has
  its payload shape locked including variant-specific fields
  (hotParam, font, eventType, vendors, param).
- `kill_switch.test.mjs` (13 tests) - all six always-on spoof
  kinds (sendbeacon, clipboard-read, bluetooth, usb, hid, serial)
  verified including dedup, pass-through, and the hasSpoofTag
  exact-match regression.
- `fingerprint_spoof.test.mjs` (11 tests) - the four per-site
  fingerprint spoofs (webgl-unmasked, canvas, audio, font-enum)
  verified including constant-value invariants and
  TextMetrics-shape completeness.

Remaining gaps (follow-up P2): neuter / silence origin-match
tests (matchesHostPattern wildcards, per-vendor behavior),
replay-global poll, invisible-canvas-draw detector.

### Tests on `hush/src/background.rs` handlers

2499 LOC of service-worker logic. Zero unit coverage on DNR
sync, handler dispatch, or persistence. Use
`wasm-bindgen-test` + the existing `BackgroundState` + mock JS
values via `serde_wasm_bindgen`. Target the hot paths:
`handle_stats`, `do_sync_dynamic_rules`,
`push_firewall_event`, `schedule_persist_stats`.

### (done 2026-04-21) Ship the three Hush seed profiles

Shipped: `hush/profiles/{brave-supplement,news-site-baseline,social-media-declutter}.json`,
75 rules total with per-rule `comment` fields explaining each. Wired
into the extension: added to `web_accessible_resources`, new
`chrome_bridge::fetch_extension_text` helper, "Load starter
profile..." `<select>` dropdown added to `ProfileTools` next to
Import/Export. Load merges into current rules (existing rules
untouched).

<!-- placeholder: prevent next heading from bumping against the above -->

### (done 2026-04-21) Ship "always-on kill-switch" spoof kinds

Shipped: six new Spoof kinds implemented in `mainworld.js` -
`sendbeacon`, `clipboard-read`, `bluetooth`, `usb`, `hid`,
`serial`. Each returns the spec-compliant denial value
(`true` / `NotAllowedError` / `NotFoundError`) so sites that
handle denial gracefully keep working. Added to
`sites.json` Global scope defaults-on and to
`brave-supplement.json` for explicit opt-in. Documented in
`completed.md`, `types.rs` SiteConfig::spoof doc, and
`options.html` how-it-works (new "Kill-switch kinds" section).

Follow-up still open: update `architecture.md` Spoof section
and `comparison.md` to add the kill-switch kinds in the
feature-overlap matrix (currently just lists 4 fingerprint
kinds).



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

## P2 - polish + coverage

### Clippy lint cleanup so `-D warnings` can go green

`cargo clippy --all-targets -- -D warnings` currently reports
36 errors across the crate:
- `redundant_locals`, `clone_on_copy`, `collapsible_if` in
  `ui_popup.rs` and `ui_options.rs`
- `criterion::black_box` deprecation in
  `benches/compute_suggestions.rs` (9 call sites; swap to
  `std::hint::black_box`)
- Scattered minor lints across the Rust sources

CI workflow (`.github/workflows/ci.yml`) intentionally skips
the clippy step until these are cleaned. Once clean, re-enable
`cargo clippy --all-targets -- -D warnings` in CI so new lints
can't land silently.

### Migrate `filter-anything-everywhere` to eslint 10 flat-config

`filter-anything-everywhere/.eslintrc.cjs` predates eslint 9's
default-flat-config switch. `npm run lint` fails out of the box
under eslint 10 with a migration-required message. CI step
skipped until this lands.

Migration path: rename `.eslintrc.cjs` -> `eslint.config.js`,
export a single flat-config array, drop the `parserOptions`
style that's now rolled into per-rule configs. 20-30 minutes
by the [eslint migration guide](https://eslint.org/docs/latest/use/configure/migration-guide).

### (closed 2026-04-21) Narrow `#![allow(clippy::too_many_arguments)]`

Simply deleted it. Turned out no function in `background.rs`
currently trips `too_many_arguments`, so the blanket allow was
dead code - a leftover from an earlier refactor. `cargo clippy
--lib` now reports zero `too_many_arguments` warnings. The one
remaining function-scoped `#[allow(clippy::too_many_arguments)]`
at `detectors.rs:751` is narrow and documented, fine as-is.

### (closed 2026-04-21) Unify `LIVE_CLOSURES` types

Can't unify as originally stated: `background.rs` stores
`Closure` values of FOUR different shapes (`Fn()` for onStartup,
`Fn(JsValue)` for onInstalled, `Fn(JsValue, JsValue)` for
storage.onChanged, `Fn(JsValue, JsValue, JsValue)` for
runtime.onMessage). A single typed vec can't hold heterogeneous
types; an enum wrapper would add runtime dispatch the set
doesn't need (we never read from the vec - it's a pin-for-life
bag). `main_world.rs` can stay typed because every closure it
stores has the same signature.

Did instead: expanded the doc comment next to the
`LIVE_CLOSURES` thread-local in background.rs to spell out
which shapes go in, why `Any` is correct here, and the disposal
model (SW-death-is-the-reaper; Chrome kills the SW routinely;
nothing to manually free).

### (done 2026-04-21) `migrateConfigSchema` idempotence + crash-recovery test

Shipped: extracted migrator from `background.js` into
`hush/migrate_config.mjs` so it's testable against a mock storage.
11 tests in `test/migrate_config.test.mjs` cover:
- no-op when already at CURRENT_SCHEMA_VERSION
- idempotent: run twice, second is a no-op with zero writes
- empty / non-object config: version stamp only
- bare-string -> {value} conversion
- existing object entries preserved (metadata survives)
- missing action buckets filled with empty arrays
- malformed site entries dropped without crashing
- atomicity: both keys in one set() call
- crash recovery: simulated storage failure on write leaves
  storage untouched, next wake retries and completes
- robustness: null / undefined / primitive rule entries don't
  throw

### (closed 2026-04-21) Move YouTube selectors to JSON

Premise doesn't hold for this extension: `content.css` is
manifest-injected at `document_start`, before any JS runs.
Moving the selectors to a JSON file + injecting via content.js
would LOSE that timing guarantee (JS runs after the page's own
scripts). A build-step template would work but there's no build
system for a 4-selector pure-JS extension.

Did instead: added a rename-gate comment to `content.css` (it
and `README.md:29-32` are the only two places those classes
live; the comment flags both) so future YouTube renames are
an obvious 2-file bump rather than a silent drift.

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

### (done 2026-04-21) Runtime self-test for `Error().stack` format

Shipped in mainworld.js right after stackOriginHost export.
Synthesizes a canonical V8 frame `at fn (https://host/path:L:C)`
and asserts stackOriginHost pulls back the expected host. On
mismatch it writes `console.warn` and sets
`window.__hush_stack_selftest_failed__` with diagnostic detail
for the popup debug payload to surface later (flag present =
V8 format changed; future work can pipe that to the badge).
Test `V8 stack-format self-test stays silent when the parser
is healthy` locks the silent-on-healthy invariant.

A V8 format change now produces a loud DevTools warning the day
it lands, instead of silent attribution failures accumulating.

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

### Fill `filter-anything-everywhere` test gaps (partial)

Shipped 2026-04-21: `hostname.spec.ts` with 8 tests covering
`getCanonicalHostname`. Locks behavior around the single-edge-
case `www.` prefix strip: doesn't lowercase, doesn't strip
embedded `www.`, handles edge inputs (empty, bare `www.`,
`wwwx.`).

Remaining (needs jsdom harness):
- Keyword matcher end-to-end with fixture DOM.
- Mutation-observer debounce path.

### Security smoke for hush spoof / neuter / silence

These actions rewrite live site behavior — fake fetch responses,
deny listener registrations, constant fingerprint returns. One
bug breaks sites silently. Load 5-10 popular sites with each
action active; record expected breakage in
`hush/docs/spoof-compatibility.md`.

### (done 2026-04-21) `zoom-extension/CHANGELOG.md`

Seeded with the two 2026-04-21 changes (loadedmetadata listener
replacing the 1 Hz poll, rename-gate comment on content.css).
Policy section on the file describes the per-change entry
convention going forward.

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

| Review date | Grade | Delta | Notes |
|---|---|---|---|
| [2026-04](review-2026-04.md) | 6.5/10 | -- | first-pass review, docs + spot-check |
| 2026-04-21 deep audit | 5.5/10 | -1.0 | code-level second pass; localhost POST + `content.rs` phantom + attribution bug were missed first time |
| 2026-04-21 P0 session | 7.0/10 | +1.5 | shipped: localhost POST removed, stack substring bug fixed (+ regression lock), guarded unwrap fixed, silent-error audit on startup + storage-changed paths, version-drift roadmap item deleted, filter-anything-everywhere CHANGELOG seeded, CI workflow landed. Remaining P0: Leptos rip (deferred), content.js -> Rust port (deferred). |
| 2026-04-21 P1 cross-lang stack contract test | 7.1/10 | +0.1 | shipped: shared `stack_fixtures.json` consumed by Rust `fixture_cases_match_expected` and JS `stack_origin.test.mjs`, both run in CI. Future drift between the two copies surfaces as a failing test. |
| 2026-04-21 P1 rule_id format fix | 7.3/10 | +0.2 | shipped: `types.rs::rule_id` now emits JSON-array `["action","scope","match"]` (hand-rolled escape, no serde_json runtime dep). `::` in user patterns no longer produces unreachable IDs. 6 new round-trip + regression tests. Prior `::`-delimited events in `chrome.storage.session` age out via FIFO on browser restart. |
| 2026-04-21 P1 host-pattern rename + `*` wildcard | 7.4/10 | +0.1 | shipped: `matchesUrlFilter` -> `matchesHostPattern` in mainworld.js with new `*` wildcard support across DNS labels. Call sites renamed (`findFilterMatch` -> `findHostMatch`, 4 sites). Misleading "uBlock-style URL filter" docs fixed in content.js, types.rs (neuter + silence fields). Grammar now honestly documented: `\|\|host\|\|`, `^`, `*`, bare substring. |
| 2026-04-21 options.html how-it-works rewrite | 7.5/10 | +0.1 | shipped: options.html "How Hush works" section rewritten from scratch. All 7 actions documented with what/why/when (previously only Block/Remove/Hide). Scopes explained. Full 17-signal behavioral detector list with relevance for each. Firewall log, simulate, profiles, allowlists, cross-layer interaction, data-egress posture all covered. Tagline updated to match. |
| 2026-04-21 seed profiles + starter-profile dropdown | 7.6/10 | +0.1 | shipped: `hush/profiles/{brave-supplement,news-site-baseline,social-media-declutter}.json` with 75 hand-curated rules total. Each rule carries a `comment` explaining what it kills and why. Wired into extension via `web_accessible_resources` + `chrome_bridge::fetch_extension_text` + "Load starter profile..." `<select>` in options page ProfileTools. |
| 2026-04-21 kill-switch spoof kinds | 7.9/10 | +0.3 | shipped: six new always-on spoof kinds answering user feedback "people don't want to maintain rules for this." `sendbeacon`/`clipboard-read`/`bluetooth`/`usb`/`hid`/`serial` return spec-compliant denial values when present in Global scope. Defaults-on in seed `sites.json`. Major UX win: new installs get category-level defenses without any configuration, Brave-style. |

Target after P0 complete: 7.5+. Target after P1 complete: 8.5.
9+ needs the polish items in P2. 10 requires passing the
"10-year, daily use by 100, zero code changes" bar - probably
never achievable for a browser extension given MV3's
instability, but the further we get toward 9 the better the
tail.
