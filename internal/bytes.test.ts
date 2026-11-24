import { describe, it, expect } from 'vitest'
import { exactBuffer, toImageBytes } from './bytes'

describe('exactBuffer', () => {
  it('holds only the bytes of a view into a bigger buffer', () => {
    const big = new Uint8Array([9, 9, 1, 2, 3, 9])
    expect([...new Uint8Array(exactBuffer(big.subarray(2, 5)))]).toEqual([1, 2, 3])
  })

  it("holds only a small Buffer's bytes, not Node's shared pool around them", () => {
    const pooled = Buffer.from([1, 2, 3])
    expect(pooled.buffer.byteLength).toBeGreaterThan(3)
    expect([...new Uint8Array(exactBuffer(pooled))]).toEqual([1, 2, 3])
  })

  it('reuses the buffer when the view already covers all of it', () => {
    const whole = new Uint8Array([1, 2, 3])
    expect(exactBuffer(whole)).toBe(whole.buffer)
  })
})

describe('toImageBytes', () => {
  it('takes a Uint8Array as it is and wraps an ArrayBuffer', () => {
    const bytes = new Uint8Array([1, 2])
    expect(toImageBytes(bytes)).toBe(bytes)
    expect([...toImageBytes(bytes.buffer)]).toEqual([1, 2])
  })

  it('rejects anything else, naming what was passed', () => {
    expect(() => toImageBytes('photo.jpg' as never, 'Image 2 of 3')).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT', message: 'Image 2 of 3 must be a Uint8Array or an ArrayBuffer.' }),
    )
  })
})
