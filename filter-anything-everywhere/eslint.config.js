// Flat config for eslint 10. Replaces the legacy .eslintrc.cjs.
//
// Scope: the TypeScript sources under extension/. Build output and
// node_modules are ignored.
//
// Rule set kept as close to the legacy config as possible:
//   - @typescript-eslint/recommended
//   - eslint-config-prettier (disables rules that conflict with
//     prettier)
//   - prettier/prettier error (run prettier as part of lint)
//   - indent: 2 spaces with SwitchCase: 1 (project convention)
//
// We deliberately do NOT pull in `@eslint/js` for
// `js.configs.recommended` - it's not already installed and the
// TS-specific rules above cover the majority of what it provides
// for this codebase. If a core JS lint becomes necessary later,
// `npm install --save-dev @eslint/js` and extend with
// `js.configs.recommended` at the top of the array.

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

// Shared browser + extension globals. Enumerated rather than
// pulling in the `globals` package to keep dep count minimal.
const BROWSER_GLOBALS = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  console: "readonly",
  chrome: "readonly",
  location: "readonly",
  history: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  MutationObserver: "readonly",
  performance: "readonly",
  Event: "readonly",
  CustomEvent: "readonly",
  Element: "readonly",
  HTMLElement: "readonly",
  HTMLInputElement: "readonly",
  HTMLIFrameElement: "readonly",
  HTMLVideoElement: "readonly",
  Node: "readonly",
  Text: "readonly",
  NodeFilter: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Promise: "readonly",
  $: "readonly",
  jQuery: "readonly",
};

const TS_ECOSYSTEM_RULES = {
  ...tsPlugin.configs["eslint-recommended"].overrides[0].rules,
  ...tsPlugin.configs.recommended.rules,
  ...prettierConfig.rules,
  "prettier/prettier": "error",
  indent: ["error", 2, { SwitchCase: 1 }],
  // Fork convention (see CHANGELOG.md): @ts-ignore with a
  // description is accepted in cases where @ts-expect-error would
  // fire as unused-directive under the permissive @types/chrome
  // typing. Default rule config forbids @ts-ignore outright;
  // loosening to allow it iff a description follows matches what
  // the fork's maintainer does by hand.
  "@typescript-eslint/ban-ts-comment": [
    "error",
    {
      "ts-ignore": "allow-with-description",
      "ts-expect-error": "allow-with-description",
      minimumDescriptionLength: 3,
    },
  ],
  // Extension code frequently reaches for `any` to model the
  // runtime-dynamic parts of the chrome.* API or DOM fields the
  // site script attaches at runtime (e.g. window.hasAqi set by a
  // content script). Downgraded to warning so code review can
  // still flag accidental uses without blocking the build.
  "@typescript-eslint/no-explicit-any": "warn",
  // Allow underscore-prefixed args + catch bindings as a
  // 'deliberately unused' signal. Keeps the lint effective for
  // accidental unused-arg footguns while supporting the common
  // pattern of `(_unused, used) =>` or `catch (_e)`.
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
};

export default [
  {
    ignores: ["build/**", "node_modules/**", "dist/**", "coverage/**"],
  },
  // Production TS: fully type-checked against tsconfig.json.
  {
    files: ["extension/**/*.ts"],
    ignores: ["extension/**/*.spec.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: BROWSER_GLOBALS,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      prettier: prettierPlugin,
    },
    rules: TS_ECOSYSTEM_RULES,
  },
  // Test files: not in the main tsconfig project, so type-
  // checked-parsing is disabled for them. Syntax + style rules
  // still apply. Jest globals go in here.
  {
    files: ["extension/**/*.spec.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...BROWSER_GLOBALS,
        // Jest globals
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      prettier: prettierPlugin,
    },
    rules: TS_ECOSYSTEM_RULES,
  },
];
