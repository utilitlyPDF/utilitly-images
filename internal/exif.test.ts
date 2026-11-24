import { describe, it, expect } from 'vitest'
import { orientationFromTiff } from './exif'
import { tiffWithOrientation } from './testing'

describe('orientationFromTiff', () => {
  it('reads every orientation, in both byte orders', () => {
    for (const order of ['II', 'MM'] as const) {
      for (let o = 1; o <= 8; o++) expect(orientationFromTiff(tiffWithOrientation(o, order)), `${order} ${o}`).toBe(o)
    }
  })

  it('treats a value outside 1-8 as upright', () => {
    expect(orientationFromTiff(tiffWithOrientation(9, 'II'))).toBe(1)
    expect(orientationFromTiff(tiffWithOrientation(0, 'MM'))).toBe(1)
  })

  it('treats a missing tag as upright', () => {
    const tiff = tiffWithOrientation(6, 'II')
    tiff[10] = 0x10 // the entry is now tag 0x0110 (camera model)
    expect(orientationFromTiff(tiff)).toBe(1)
  })

  it('treats a cut-off or malformed block as upright instead of throwing', () => {
    expect(orientationFromTiff(tiffWithOrientation(6, 'II').subarray(0, 10))).toBe(1)
    expect(orientationFromTiff(new Uint8Array([0x49, 0x49, 42, 0]))).toBe(1)
    expect(orientationFromTiff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(1)
    const farOffset = tiffWithOrientation(6, 'MM')
    farOffset.set([0x7f, 0xff, 0xff, 0xff], 4) // IFD0 "starts" far past the end
    expect(orientationFromTiff(farOffset)).toBe(1)
  })
})
