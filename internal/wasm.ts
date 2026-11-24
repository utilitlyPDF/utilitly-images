/**
 * Where the codecs' WebAssembly comes from, and their start-up.
 *
 * In a browser or bundler, each codec fetches its own .wasm file from next to
 * its JavaScript, so there's nothing to set. Node can't fetch a file URL, so
 * each package's Node entry sets a source that reads the files from disk
 * (internal/node.ts).
 */

/** Every .wasm file the packages load, as a path inside node_modules. */
export type WasmFile =
  | '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'
  | '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'
  | '@jsquash/png/codec/pkg/squoosh_png_bg.wasm'
  | '@jsquash/webp/codec/enc/webp_enc_simd.wasm'
  | '@jsquash/webp/codec/enc/webp_enc.wasm'
  | '@jsquash/webp/codec/dec/webp_dec.wasm'

/** Resolves to a compiled WebAssembly.Module. Typed unknown: engine code has no WebAssembly types. */
export type WasmSource = (file: WasmFile) => Promise<unknown>

let source: WasmSource | undefined
const loaded = new Map<string, Promise<unknown>>()

export function setWasmSource(next: WasmSource): void {
  source = next
}

/**
 * Loads a codec once, however many calls arrive while it's loading, and
 * returns it. A codec that fails to load is reported as that (not as a
 * damaged image) and forgotten, so the next call tries again.
 */
export function loadOnce<T>(key: string, name: string, load: (source: WasmSource | undefined) => Promise<T>): Promise<T> {
  let ready = loaded.get(key)
  if (!ready) {
    ready = load(source).catch(cause => {
      loaded.delete(key)
      throw new Error(`The ${name} couldn't be loaded.`, { cause })
    })
    loaded.set(key, ready)
  }
  return ready as Promise<T>
}

/** Drops a loaded codec, so the next call starts a fresh instance of it. */
export function forget(key: string): void {
  loaded.delete(key)
}
