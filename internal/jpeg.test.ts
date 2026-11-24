import { describe, it, expect } from 'vitest'
import { jpegHasEnd } from './jpeg'

const SOI = [0xff, 0xd8]
const EOI = [0xff, 0xd9]
/** A marker segment: FF, the marker, a 2-byte length that counts itself, then the payload. */
const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const APP0 = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0])
const SOS = segment(0xda, [1, 1, 0, 0, 63, 0])
// Entropy-coded data. A literal FF byte in it is always followed by 00.
const SCAN = [0x12, 0xff, 0x00, 0x34, 0x56]

describe('jpegHasEnd', () => {
  it('is true when the end-of-image marker follows the scan', () => {
    expect(jpegHasEnd(new Uint8Array([...SOI, ...APP0, ...SOS, ...SCAN, ...EOI]))).toBe(true)
  })

  it('allows bytes after the end marker, which some cameras add', () => {
    expect(jpegHasEnd(new Uint8Array([...SOI, ...APP0, ...SOS, ...SCAN, ...EOI, 0, 0, 1]))).toBe(true)
  })

  it('is false for a file cut off in its image data', () => {
    expect(jpegHasEnd(new Uint8Array([...SOI, ...APP0, ...SOS, ...SCAN]))).toBe(false)
  })

  it('is false for a file cut off before its image data starts', () => {
    expect(jpegHasEnd(new Uint8Array([...SOI, ...APP0.slice(0, 6)]))).toBe(false)
  })

  it("doesn't count the end marker of a thumbnail stored before the image", () => {
    const thumbnail = segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, ...SOI, 1, 2, ...EOI])
    expect(jpegHasEnd(new Uint8Array([...SOI, ...thumbnail, ...SOS, ...SCAN]))).toBe(false)
  })
})
