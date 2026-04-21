// Rollup config. Build-time eslint was removed when upgrading to
// eslint 9 (flat config) because @rollup/plugin-eslint hadn't
// released a flat-config-compatible version at upgrade time —
// lint separately via `npm run lint` if needed.
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import {babel} from '@rollup/plugin-babel';
import typescript from 'rollup-plugin-typescript2';

const commonPlugins = () => [
  nodeResolve(),
  commonjs(),
  babel({
    babelHelpers: 'bundled',
  }),
  typescript(),
];

export default [
  {
    input: 'extension/background.ts',
    output: {
      file: 'build/extension/background_bundle.js',
      format: 'iife',
      name: 'BackgroundBundle',
    },
    plugins: commonPlugins(),
  },
  {
    input: 'extension/browser_action.ts',
    output: {
      file: 'build/extension/browser_action_bundle.js',
      format: 'iife',
      name: 'BrowserActionBundle',
    },
    plugins: commonPlugins(),
  },
  {
    input: 'extension/content.ts',
    output: {
      file: 'build/extension/content_bundle.js',
      format: 'iife',
      name: 'ContentBundle',
    },
    plugins: commonPlugins(),
  },
  {
    input: 'extension/options.ts',
    output: {
      file: 'build/extension/options_bundle.js',
      format: 'iife',
      name: 'OptionsBundle',
    },
    plugins: commonPlugins(),
  },
];
