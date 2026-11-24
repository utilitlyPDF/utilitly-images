import { describe, it, expect } from 'vitest'
import { pngIsSound } from './png'
import { makePixels, pngChunk, pngFromScratch } from './testing'

const good = pngFromScratch(makePixels(8, 8, (x, y) => [x * 30, y * 30, 90, 255]))
const IDAT_START = 33 // signature (8) + IHDR chunk (25)

describe('pngIsSound', () => {
  it('accepts a whole PNG, and one that stops right after its last chunk', () => {
    expect(pngIsSound(good)).toBe(true)
    expect(pngIsSound(good.subarray(0, good.length - 12))).toBe(true) // no IEND
    expect(pngIsSound(new Uint8Array([...good, 1, 2, 3]))).toBe(true) // bytes after IEND
  })

  it('refuses a PNG cut off inside a chunk', () => {
    expect(pngIsSound(good.subarray(0, IDAT_START + 10))).toBe(false)
    expect(pngIsSound(good.subarray(0, good.length - 5))).toBe(false)
  })

  it('refuses a chunk whose checksum does not match, as the decoder would', () => {
    const flipped = good.slice()
    flipped[IDAT_START + 12] ^= 0x01
    expect(pngIsSound(flipped)).toBe(false)
  })

  it('refuses a PNG with no image data', () => {
    expect(pngIsSound(new Uint8Array([...good.subarray(0, IDAT_START), ...pngChunk('IEND', new Uint8Array())]))).toBe(false)
  })
})
