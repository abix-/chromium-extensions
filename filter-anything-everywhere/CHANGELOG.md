# Changelog

Fork of [Tommy Li's upstream
project](https://github.com/tomlimike/filter-anything-everywhere)
(MIT-licensed). This file tracks every delta this fork carries
over upstream so a future merge-up or pull-request-back stays
reviewable.

Format loosely follows [Keep a Changelog](https://keepachangelog.com).

## [Unreleased] - fork deltas carried over upstream

### Dependency sweep

Bumped to current majors via `npm-check-updates`:

- `rollup` 3 -> 4
- `typescript` 5 -> 6
- `jest` + `ts-jest` + `@types/jest` 29 -> 30 / 29-compatible
- `jquery` 3 -> 4 (see "jQuery 4 shims" below)
- `@types/chrome` 0.0.225 -> 0.1.40 (new permissive typings)
- `eslint` 8 -> 10
- `prettier` 2 -> 3
- `@types/jquery` 3 -> 4

### jQuery 4 shims

- `extension/content.ts:184` - inlined `$.isWindow()` as
  `obj === obj.window`. jQuery 4 removed `$.isWindow` entirely;
  the inline form is the canonical jQuery implementation from
  prior versions.

### TypeScript 6 compatibility

- `extension/browser_action.ts:173` - swapped `@ts-expect-error`
  to `@ts-ignore`. The access is legal under any `@types/chrome`
  0.1.x typing, so `@ts-expect-error` was firing as
  "unused-error-directive." `@ts-ignore` is strictly weaker but
  correct for the dynamic-property access pattern used here.
- `tsconfig.json` - added explicit `"rootDir": "./extension"`.
  TypeScript 6 no longer auto-infers the root when the tsconfig
  lives above a nested source directory.

### Build pipeline

- `rollup.config.js` - removed `@rollup/plugin-eslint`. The
  plugin was a rollup-3-only package; linting runs separately
  via `npm run lint` now.
- `prepare_extension.ps1` - call rollup via
  `npx --no-install rollup -c` so the PowerShell driver uses the
  project's pinned rollup rather than whatever's on PATH. Also
  removed a dead `Move-Item` left over from a prior output-path
  refactor.

## Policy

- **Add an entry when you change anything upstream doesn't
  have.** Commit the CHANGELOG bump in the same commit as the
  code change; otherwise the entry rots.
- **Cite file:line.** Future you + future upstream reviewer
  needs the pointer to verify the fork actually changed what
  the entry claims.
- **Don't list version-only churn** unless the version bump
  required a code change here (see "Dependency sweep" above -
  only bumped entries are listed when no source edit was
  needed, so the section stays scannable).
