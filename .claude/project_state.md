# project_state

## Current focus

Post-audit P0/P1 hardening pass on Hush plus UX wins from user
feedback. Scope landed 2026-04-21 across one long session.
No active work in flight; next planned item is the Leptos rip
(deferred - multi-session).

## Repo shape (as of 2026-04-21)

Three extensions at repo root:

- `hush/` - MV3 firewall-style rule engine. Rust -> WASM + JS
  shims. 127 Rust unit tests, 19 JS tests across 2 files (emit
  contract + cross-language stack-origin fixture). Version
  0.12.0 in both manifest.json and Cargo.toml.
- `filter-anything-everywhere/` - fork of Tommy Li's extension,
  MIT-inherited. Now carries its own CHANGELOG documenting
  fork deltas.
- `zoom-extension/` - YouTube zoom + fullscreen-grid blocker.

`.github/workflows/ci.yml` now gates every push/PR: Rust fmt
check, tests, wasm target check, wasm-pack build, hush JS
syntax + emit-contract + stack-origin tests, filter jest,
zoom node --check.

## Shipped this session

### P0 (all landed except the two deferred big items)

- Privacy violation fixed: `hush/background.js` no longer POSTs
  to `http://127.0.0.1:8765/log` on every service-worker event.
  `tools/log-server.mjs` deleted. README privacy claim now
  matches reality.
- Stack-origin substring-filter bug fixed in both `stack.rs:22`
  and `mainworld.js:108`. Hush's `chrome-extension://` frames
  skip naturally via the http/https anchor check. Regression
  lock test `site_hosted_mainworld_js_is_not_mistaken_for_hush`
  added.
- Guarded unwrap at `background.rs:2123` replaced with
  `Option::filter` + `let-else`.
- Silent-error audit on startup and storage-changed paths in
  `background.rs` (onInstalled, onStartup, retry loop,
  config-changed, allowlist-changed). Errors now route through
  `log_error` which lands in the debug-info ring buffer.
- Stale version-drift item deleted from `hush/docs/roadmap.md`.
- `filter-anything-everywhere/CHANGELOG.md` seeded with the
  jQuery 4 / TypeScript 6 / Rollup 4 / eslint 10 fork deltas.
- GitHub Actions CI landed.
- `src/content.rs` phantom reconciled - history.md Stage 5 Iter
  6 rewritten to say "did not land", architecture.md matches.

### P0 (deferred)

- **Leptos rip** - multi-session rewrite of popup + options to
  vanilla TS + DOM. 4500 LOC. Still the single largest
  durability risk in the repo.
- **content.js -> Rust port** - now a real P0 work item rather
  than a doc lie. Recommended after Leptos rip is done.

### P1

- Cross-language stack-origin contract test:
  `hush/test/stack_fixtures.json` shared between
  `stack.rs::fixture_cases_match_expected` and
  `test/stack_origin.test.mjs`. Drift between the two copies
  of `stackOriginHost` now surfaces as a failing test in CI.
- `rule_id` format fix: `types.rs::rule_id` emits
  `["action","scope","match"]` JSON-array instead of the
  `::`-delimited format. Patterns containing `::` no longer
  produce unreachable ids. Hand-rolled JSON escape to avoid
  pulling serde_json into the runtime.
- `matchesUrlFilter` -> `matchesHostPattern` rename with `*`
  wildcard support. Honest documentation: it's a host-anchor
  pattern, not full uBlock syntax. Misleading "uBlock-style URL
  filter" docs in content.js and types.rs neuter/silence fields
  corrected.

### UX wins from user feedback

- `options.html` "How Hush works" section rewritten from
  scratch. All 7 actions documented with what/why/when/syntax.
  All 17 behavioral-detector signals listed with relevance.
  Firewall log, simulate, profiles, allowlists, cross-layer
  interaction, data-egress posture - all covered.
- Three hand-curated seed profiles shipped:
  `hush/profiles/{brave-supplement,news-site-baseline,social-media-declutter}.json`.
  75 rules total, each with a `comment` explaining what it
  kills and why. Wired to the extension via
  `web_accessible_resources` + `chrome_bridge::fetch_extension_text`
  + "Load starter profile..." `<select>` in options page.
- Kill-switch spoof kinds shipped answering user question
  "is there ANY reason to EVER allow sendBeacon?": six new
  spoof kinds (`sendbeacon`, `clipboard-read`, `bluetooth`,
  `usb`, `hid`, `serial`). Defaults-on in `sites.json` Global
  scope and in `brave-supplement.json`. New installs get
  category-level protection without any configuration.
- Popup `GlobalProtections` component added. Shows a green
  pill row with tooltip per active Global-scope spoof kind so
  users can see kill-switches are on without opening options.

## Current grade

Per `docs/todo.md` tracking: **7.9/10** (Kovarex review floor
was 5.5; target after Leptos rip + content.rs port is 8.5+).

## Next steps

Prioritized in `docs/todo.md`. Immediate next candidates:

- P1 Tests on `hush/mainworld.js` (913 LOC, zero direct tests
  beyond the emit-contract boundary test).
- P1 Tests on `hush/src/background.rs` handlers via
  wasm-bindgen-test.
- P1 Schema-version everything in `chrome.storage.local`.
- P1 Run and commit the Criterion bench baseline with the four
  new detectors included.
- P2 Clippy lint cleanup (36 pre-existing lints blocking
  `-D warnings` in CI).
- P2 eslint 10 flat-config migration for
  `filter-anything-everywhere`.
- P0 Leptos rip (multi-session).
- P0 content.js -> Rust port (multi-session, best after Leptos
  rip).

## Things users should know

- Hush's "no network egress" claim is now true in code. Before
  2026-04-21 the shipped extension POSTed every tab-scan
  summary to localhost. Fixed.
- Defaults-on kill-switches mean a fresh Hush install silently
  blocks sendBeacon / clipboard-read / all four device-probe
  APIs site-wide. Documented in the popup's new
  "Global protections active:" row.
