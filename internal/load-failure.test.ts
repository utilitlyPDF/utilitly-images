// Its own file, so every codec's first start-up happens here.
//
// A codec that fails to load (a network blip, a .wasm file missing after a
// deploy) is not a damaged image: the error must say what failed, and the
// next call must try loading again.

import { describe, it, expect } from 'vitest'
import { readImage, writeImage } from './pipeline'
import { resolveEncoding } from './options'
import { nodeWasmSource } from './node'
import { setWasmSource, type WasmFile } from './wasm'
import { makePixels, pngFromScratch } from './testing'

// Node has the WebAssembly global, but only the DOM lib declares it.
declare const WebAssembly: { compile(bytes: Uint8Array): Promise<unknown> }

const picture = makePixels(16, 16, (x, y) => [x * 16, y * 16, 100, 255])
// A valid WebAssembly module with nothing in it: it loads, but it isn't the codec.
const EMPTY_MODULE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])

/** Loads from disk, except that each file in `broken` comes back wrong the first time it's asked for. */
function failOnce(broken: WasmFile[], how: 'empty module' | 'rejection') {
  const pending = new Set(broken)
  setWasmSource(async file => {
    if (!pending.delete(file)) return nodeWasmSource(file)
    if (how === 'rejection') throw new Error('network blip')
    return WebAssembly.compile(EMPTY_MODULE)
  })
}

async function notDamaged(promise: Promise<unknown>) {
  const err = await promise.then(() => null, e => e as { code?: string; message: string })
  expect(err, 'the first call should fail').not.toBeNull()
  expect(err!.code).not.toBe('DECODE_FAILED')
  expect(err!.message).toMatch(/^The (JPEG|WebP) (decoder|encoder) couldn't be loaded\.$|^The PNG codec couldn't be loaded\.$/)
}

describe('a codec that fails to load', () => {
  it('is reported as a load failure, then loads on the next call (JPEG and WebP)', async () => {
    failOnce(['@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', '@jsquash/webp/codec/enc/webp_enc_simd.wasm'], 'empty module')
    const jpeg = resolveEncoding({ format: 'jpeg' }, 'jpeg')
    const webp = resolveEncoding({ format: 'webp' }, 'webp')
    await notDamaged(writeImage(picture, jpeg))
    const jpegBytes = await writeImage(picture, jpeg)
    await notDamaged(writeImage(picture, webp))
    const webpBytes = await writeImage(picture, webp)

    failOnce(['@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm', '@jsquash/webp/codec/dec/webp_dec.wasm'], 'empty module')
    await notDamaged(readImage(jpegBytes))
    expect((await readImage(jpegBytes)).pixels.width).toBe(16)
    await notDamaged(readImage(webpBytes))
    expect((await readImage(webpBytes)).pixels.width).toBe(16)
  })

  it('is reported as a load failure, then loads on the next call (PNG)', async () => {
    failOnce(['@jsquash/png/codec/pkg/squoosh_png_bg.wasm'], 'rejection')
    const png = pngFromScratch(picture)
    await notDamaged(readImage(png))
    expect((await readImage(png)).pixels.width).toBe(16)
  })
})
