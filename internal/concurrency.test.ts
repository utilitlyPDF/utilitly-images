// Its own file, so the first use of each codec happens here.

import { describe, it, expect } from 'vitest'
import { writeImage } from './pipeline'
import { resolveEncoding } from './options'
import { detectFormat } from './format'
import { setWasmSource, type WasmFile } from './wasm'
import { nodeWasmSource } from './node'
import { makePixels } from './testing'

describe('codec start-up', () => {
  it('loads each codec once, however many calls arrive before it is ready', async () => {
    const loads: WasmFile[] = []
    setWasmSource(file => {
      loads.push(file)
      return nodeWasmSource(file)
    })
    const pixels = makePixels(8, 8, () => [10, 20, 30, 255])
    const outputs = await Promise.all(Array.from({ length: 8 }, () => writeImage(pixels, resolveEncoding({ format: 'webp' }, 'webp'))))
    expect(outputs.map(detectFormat)).toEqual(Array(8).fill('webp'))
    expect(loads).toEqual(['@jsquash/webp/codec/enc/webp_enc_simd.wasm'])
  })

  it('tries again after a load fails, rather than remembering the failure', async () => {
    let failNext = true
    setWasmSource(file => {
      if (failNext) {
        failNext = false
        return Promise.reject(new Error('disk hiccup'))
      }
      return nodeWasmSource(file)
    })
    const pixels = makePixels(4, 4, () => [10, 20, 30, 255])
    await expect(writeImage(pixels, resolveEncoding({ format: 'jpeg' }, 'jpeg'))).rejects.toMatchObject({
      message: "The JPEG encoder couldn't be loaded.",
      cause: expect.objectContaining({ message: 'disk hiccup' }),
    })
    expect(detectFormat(await writeImage(pixels, resolveEncoding({ format: 'jpeg' }, 'jpeg')))).toBe('jpeg')
  })
})
