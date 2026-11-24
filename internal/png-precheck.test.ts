// Its own file, so whether the PNG codec ever loads can be observed.
//
// The PNG decoder can't be restarted, and each failure inside it costs some
// memory that isn't given back. So damage that's visible from the outside
// (a file cut short, a flipped bit) is caught before the decoder sees it.

import { describe, it, expect } from 'vitest'
import { readImage } from './pipeline'
import { nodeWasmSource } from './node'
import { setWasmSource, type WasmFile } from './wasm'
import { makePixels, pngFromScratch } from './testing'

describe('a visibly damaged PNG', () => {
  it('is DECODE_FAILED without the PNG codec ever loading', async () => {
    const loads: WasmFile[] = []
    setWasmSource(file => {
      loads.push(file)
      return nodeWasmSource(file)
    })
    const good = pngFromScratch(makePixels(8, 8, () => [10, 20, 30, 255]))
    const flipped = good.slice()
    flipped[45] ^= 0x01 // inside the image data, so its checksum no longer matches

    await expect(readImage(good.subarray(0, 43))).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    await expect(readImage(flipped)).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    expect(loads).toEqual([])

    expect((await readImage(good)).pixels.width).toBe(8)
    expect(loads).toEqual(['@jsquash/png/codec/pkg/squoosh_png_bg.wasm'])
  })
})
