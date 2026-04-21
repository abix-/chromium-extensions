# filter-anything-everywhere

Fork of Tommy Li's [Filter Anything Everywhere](https://chrome.google.com/webstore/detail/filter-anything-everywher/jmandnadineideoebcmaekgaccoagnki?hl=en-US)
Chrome extension. Carries upstream's MIT license (see
[LICENSE](LICENSE)).

TypeScript source compiles via Rollup to a loadable extension
under `build/extension/`.

## Loading the extension

**Important**: do NOT point Chrome at this directory (the repo
root for this extension). The source-tree `manifest.json` lives
under `extension/` and references bundled JS files
(`content_bundle.js`, `background_bundle.js`, etc.) that only
exist after `npm run build` writes them to `build/extension/`.

1. `npm install` (first time)
2. `npm run build`
3. `chrome://extensions/` → **Developer mode** → **Load unpacked**
4. Point Chrome at **`build/extension/`**, not the repo root.

Reload the extension (refresh icon on its card) after every
rebuild.

## Other scripts

```
npm run lint       # eslint over .ts
npm run lint:fix   # eslint --fix
npm run format     # prettier --write
npm run test       # jest
```

## License

MIT (see [LICENSE](LICENSE)) — inherited from upstream.
