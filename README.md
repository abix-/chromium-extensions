# chromium-extensions

Chrome / Brave / Edge (MV3) browser extensions by abix.

## Extensions

- **[hush](hush/)** — per-site firewall-style rule engine with
  behavioral detection. Catches first-party telemetry, session-replay
  listener density, fingerprinting-API reads, attention-tracking
  hooks, clipboard sniffing, and hardware-device probes that filter
  lists can't see. Designed to sit alongside Brave Shields or
  uBlock Origin, not replace them. Rust → WASM engine + minimal JS
  bootstrap. Licensed GPL-3.

  See [hush/README.md](hush/README.md) for the pitch and
  [hush/docs/comparison.md](hush/docs/comparison.md) for how it
  compares to uBO / Privacy Badger / Ghostery / Brave Shields /
  DDG / NoScript.

- **[filter-anything-everywhere](filter-anything-everywhere/)** —
  universal keyword blocker for feeds, lists, and comment
  sections across every site. Fork of [Tommy Li's upstream
  project](https://github.com/tomlimike/filter-anything-everywhere);
  carries the original MIT license. TypeScript + Rollup build;
  after `npm run build` load unpacked from
  `filter-anything-everywhere/build/extension/` (NOT the repo
  directory — the root is the source tree, not the loadable
  extension).

- **[zoom-extension](zoom-extension/)** — YouTube zoom / pan via
  Shift+Alt+mousewheel and keyboard shortcuts. Pure JS content
  script, no build step. Licensed GPL-3.

## Cross-cutting priorities

- **[docs/todo.md](docs/todo.md)** — P0 / P1 / P2 / P3 priorities
  across all three extensions. Start here if you don't know
  what to work on next.
- **[docs/review-2026-04.md](docs/review-2026-04.md)** — Kovarex-
  style review against the 10/10 bar ("runs 10 years, daily use
  by 100 people, never needs a code update"). Cites file:line
  for every claim. Current grade: 6.5/10, with a map of what
  closes the gap.

## Repo layout

Each extension is a self-contained directory at the repo root:

- Its own `manifest.json`, `package.json`, and (for Rust-backed
  extensions) `Cargo.toml` + `src/`.
- Its own `docs/`, `README.md`, `CHANGELOG.md`.
- Versioned independently.

No Cargo workspace today — the first extension to share Rust code
with another will trigger a refactor into `crates/` + workspace
root at that time, not before.

## Install (developer mode)

For any extension:

1. Clone this repo.
2. Follow the extension's own `README.md` for build steps (Rust /
   WASM extensions need `wasm-pack build` before load).
3. `chrome://extensions/` → Developer mode → Load unpacked →
   point at the extension's directory (e.g. `chromium-extensions/hush`).

## Licensing

Per-extension, because one extension is a fork of MIT-licensed
upstream code:

- Repo default: **GPL-3.0-or-later**. See [LICENSE](LICENSE).
  Applies to every original work in the repo (hush, zoom-extension).
- **filter-anything-everywhere** carries its own **MIT** license
  at [filter-anything-everywhere/LICENSE](filter-anything-everywhere/LICENSE)
  inherited from the upstream project. That license takes
  precedence for everything inside that directory.
