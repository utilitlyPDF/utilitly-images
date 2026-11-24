import { describe, it, expect } from 'vitest'
import { cropPixels, flatten, orient, type Pixels } from './pixels'
import { LETTER_GRID, letters, makePixels } from './testing'

describe('orient', () => {
  // The stored image is ABC/DEF. Each orientation is how a viewer must turn it to show it upright.
  const UPRIGHT: Record<number, string> = {
    1: 'ABC/DEF',
    2: 'CBA/FED', // mirrored left to right
    3: 'FED/CBA', // turned 180°
    4: 'DEF/ABC', // mirrored top to bottom
    5: 'AD/BE/CF', // transposed
    6: 'DA/EB/FC', // turned 90° clockwise
    7: 'FC/EB/DA', // transverse
    8: 'CF/BE/AD', // turned 90° counter-clockwise
  }

  it('turns and mirrors the pixels for each of the eight orientations', () => {
    for (let o = 1 as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; o <= 8; o++) {
      expect(letters(orient(LETTER_GRID, o)), `orientation ${o}`).toBe(UPRIGHT[o])
    }
  })

  it('swaps width and height for the quarter turns', () => {
    expect([orient(LETTER_GRID, 6).width, orient(LETTER_GRID, 6).height]).toEqual([2, 3])
    expect([orient(LETTER_GRID, 3).width, orient(LETTER_GRID, 3).height]).toEqual([3, 2])
  })

  it('leaves the input alone', () => {
    orient(LETTER_GRID, 6)
    expect(letters(LETTER_GRID)).toBe('ABC/DEF')
  })
})

describe('cropPixels', () => {
  it('copies out the requested rectangle', () => {
    // Pixel n (0-15, row by row) has red = n.
    const numbered = makePixels(4, 4, (x, y) => [y * 4 + x, 0, 0, 255])
    const out = cropPixels(numbered, { x: 1, y: 1, width: 2, height: 2 })
    expect([out.width, out.height]).toEqual([2, 2])
    expect([out.data[0], out.data[4], out.data[8], out.data[12]]).toEqual([5, 6, 9, 10])
    expect(numbered.data[0]).toBe(0)
    expect(numbered.data.length).toBe(64)
  })
})

const one = (r: number, g: number, b: number, a: number): Pixels => ({ data: new Uint8ClampedArray([r, g, b, a]), width: 1, height: 1 })
const BLUE = { r: 0, g: 0, b: 255 }
const WHITE = { r: 255, g: 255, b: 255 }

describe('flatten', () => {
  it('shows the background where the image is fully transparent', () => {
    expect([...flatten(one(255, 0, 0, 0), BLUE).data]).toEqual([0, 0, 255, 255])
  })

  it('leaves opaque pixels as they are', () => {
    expect([...flatten(one(255, 0, 0, 255), BLUE).data]).toEqual([255, 0, 0, 255])
  })

  it('blends half-transparent pixels with the background', () => {
    const [r, g, b, a] = flatten(one(255, 0, 0, 128), WHITE).data
    expect(r).toBe(255)
    expect(Math.abs(g - 127)).toBeLessThanOrEqual(1)
    expect(Math.abs(b - 127)).toBeLessThanOrEqual(1)
    expect(a).toBe(255)
  })

  it('returns new pixels and leaves the input alone', () => {
    const input = one(255, 0, 0, 0)
    const out = flatten(input, BLUE)
    expect(out).not.toBe(input)
    expect([...input.data]).toEqual([255, 0, 0, 0])
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
  })
})
