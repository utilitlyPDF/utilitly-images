// Fatal decoder errors must not wear the codecs down. MozJPEG reports them by
// exit(), and the Rust PNG decoder by throwing through its own frames; both
// leave their WebAssembly instance's stack and heap as they were mid-call, so
// without care, after enough bad files every good file fails too.

import { describe, it, expect } from 'vitest'
import { readImage, writeImage } from './pipeline'
import { resolveEncoding } from './options'
import { detectFormat } from './format'
import { encodeFixture, makePixels, pngChunk, pngFromScratch, useNodeCodecs } from './testing'

useNodeCodecs()

const picture = makePixels(16, 16, (x, y) => [x * 16, y * 16, 100, 255])

/** A complete JPEG whose first component uses a quantization table that was never defined: MozJPEG exits on it. */
function undefinedQuantTable(jpeg: Uint8Array): Uint8Array {
  const bad = jpeg.slice()
  for (let i = 2; i < bad.length;) {
    const marker = bad[i + 1]
    if (marker >= 0xc0 && marker <= 0xc2) {
      bad[i + 4 + 6 + 2] = 3 // payload: precision, height, width, count; then the first component's id, sampling, table
      return bad
    }
    i += 2 + ((bad[i + 2] << 8) | bad[i + 3])
  }
  throw new Error('no SOF marker')
}

/** A PNG whose image data isn't valid zlib, with every chunk CRC correct, so only the decoder can tell. */
function badDeflate(): Uint8Array {
  const good = pngFromScratch(picture)
  const idatStart = 33 // signature (8) + IHDR chunk (25)
  const length = new DataView(good.buffer).getUint32(idatStart)
  const data = good.slice(idatStart + 8, idatStart + 8 + length)
  data[0] = 0x78
  data[1] = 0x00 // not a valid zlib header check value
  return new Uint8Array([...good.subarray(0, idatStart), ...pngChunk('IDAT', data), ...good.subarray(idatStart + 12 + length)])
}

describe('after many fatal decoder errors', () => {
  it('JPEGs still decode, to the same pixels, and still encode', async () => {
    const good = await encodeFixture('jpeg', picture)
    const bad = undefinedQuantTable(good)
    const before = await readImage(good)
    for (let i = 0; i < 200; i++) await expect(readImage(bad)).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    const after = await readImage(good)
    expect([...after.pixels.data]).toEqual([...before.pixels.data])
    expect(detectFormat(await writeImage(after.pixels, resolveEncoding({ format: 'jpeg' }, 'jpeg')))).toBe('jpeg')
  })

  it('PNGs still decode, to the same pixels, and still encode', async () => {
    const good = pngFromScratch(picture)
    const bad = badDeflate()
    for (let i = 0; i < 1000; i++) await expect(readImage(bad)).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    const after = await readImage(good)
    expect([...after.pixels.data]).toEqual([...picture.data])
    expect(detectFormat(await writeImage(after.pixels, resolveEncoding({ format: 'png' }, 'png')))).toBe('png')
  })
})
