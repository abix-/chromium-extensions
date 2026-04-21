# chromium-extensions

Chrome / Brave / Edge (MV3) browser extensions by abix.

## Extensions

- **[hush](hush/)** — per-site firewall-style rule engine with
  behavioral detection. Catches first-party telemetry, session-replay
  listener density, fingerprinting-API reads, attention-tracking
  hooks, clipboard sniffing, and hardware-device probes that filter
  lists can't see. Designed to sit alongside Brave Shields or
  uBlock Origin, not replace them.

  See [hush/README.md](hush/README.md) for the pitch and
  [hush/docs/comparison.md](hush/docs/comparison.md) for how it
  compares to uBO / Privacy Badger / Ghostery / Brave Shields /
  DDG / NoScript.

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

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
