import { describe, it, expect } from 'vitest'
import { coverArea } from './geometry'

describe('coverArea', () => {
  it('trims the sides of an image wider than the shape', () => {
    expect(coverArea(4000, 3000, 1)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 })
  })

  it('trims the top and bottom of an image taller than the shape', () => {
    expect(coverArea(3000, 4000, 16 / 9)).toEqual({ x: 0, y: 1156, width: 3000, height: 1688 })
  })

  it('keeps the whole image when it already has the shape', () => {
    expect(coverArea(1920, 1080, 16 / 9)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('never goes below one pixel', () => {
    expect(coverArea(1, 1000, 16 / 9)).toEqual({ x: 0, y: 499, width: 1, height: 1 })
    expect(coverArea(1000, 1, 1 / 50)).toEqual({ x: 499, y: 0, width: 1, height: 1 })
  })
})
