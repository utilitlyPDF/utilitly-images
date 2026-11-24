import { defineConfig } from 'tsdown'

// Shared by every package. Each one runs `tsdown -c ../../tsdown.config.ts`
// from its own folder. tsdown resolves paths from the config file's folder
// when -c is used, so cwd is pinned back to the package being built.
export default defineConfig({
  cwd: process.cwd(),
  // index.ts runs anywhere. node.ts is what Node gets: it points the codecs at
  // their .wasm files on disk, which Node can't fetch, then re-exports index.
  entry: ['src/index.ts', 'src/node.ts'],
  format: ['esm', 'cjs'],
  // The engines run in Node and in browsers, so the output can't assume either.
  platform: 'neutral',
  target: 'es2022',
  fixedExtension: true,
  dts: true,
  clean: true,
  // node.ts reads import.meta.url, which the CommonJS build has to shim.
  shims: true,
  // The neutral platform doesn't know Node's built-ins; only node.ts imports
  // them, and Node supplies them at run time. Dependencies (the codecs) stay
  // external as always, so their .wasm files keep resolving next to them.
  deps: { neverBundle: [/^node:/] },
  failOnWarn: true,
})
