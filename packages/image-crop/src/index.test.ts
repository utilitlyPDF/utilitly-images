import { describe, it, expect } from 'vitest'
import { cropImage } from './node'
import { detectFormat } from '../../../internal/format'
import type { Pixels } from '../../../internal/pixels'
import { decodeFixture, encodeFixture, makePixels, pngChunk, withOrientation } from '../../../internal/testing'

type Rgba = [number, number, number, number]
const RED: Rgba = [255, 0, 0, 255]
const GREEN: Rgba = [0, 255, 0, 255]
const BLUE: Rgba = [0, 0, 255, 255]
const WHITE: Rgba = [255, 255, 255, 255]

// 40 × 40 in four 20 × 20 quarters: red, green / blue, white.
const quarters = makePixels(40, 40, (x, y) => (y < 20 ? (x < 20 ? RED : GREEN) : x < 20 ? BLUE : WHITE))

function expectEveryPixelNear(pixels: Pixels, [r, g, b]: Rgba, tolerance: number) {
  for (let i = 0; i < pixels.data.length; i += 4) {
    const off = Math.max(Math.abs(pixels.data[i] - r), Math.abs(pixels.data[i + 1] - g), Math.abs(pixels.data[i + 2] - b))
    if (off > tolerance) expect.fail(`pixel ${i / 4} is ${pixels.data.slice(i, i + 3).join(',')}, more than ${tolerance} from ${r},${g},${b}`)
  }
}

describe('cropImage', () => {
  it('cuts the requested rectangle', async () => {
    const out = await cropImage(await encodeFixture('png', quarters), { x: 20, y: 0, width: 20, height: 20 })
    expect(detectFormat(out)).toBe('png')
    const pixels = await decodeFixture(out)
    expect([pixels.width, pixels.height]).toEqual([20, 20])
    expectEveryPixelNear(pixels, GREEN, 0)
  })

  it('crops to an aspect ratio, centred', async () => {
    const photo = await encodeFixture('png', makePixels(400, 300, () => [90, 90, 90, 255]))
    const size = async (aspect: '16:9' | '1:1' | number) => {
      const p = await decodeFixture(await cropImage(photo, { aspect }))
      return [p.width, p.height]
    }
    expect(await size('16:9')).toEqual([400, 225])
    expect(await size('1:1')).toEqual([300, 300])
    expect(await size(0.5)).toEqual([150, 300])
  })

  it('takes the middle when cropping to an aspect ratio', async () => {
    // Red 50-pixel bands on the left and right of a green 400 × 300: a centred square has no red in it.
    const banded = makePixels(400, 300, x => (x < 50 || x >= 350 ? RED : GREEN))
    expectEveryPixelNear(await decodeFixture(await cropImage(await encodeFixture('png', banded), { aspect: '1:1' })), GREEN, 0)
  })

  it('keeps the input format unless told otherwise', async () => {
    const jpeg = await encodeFixture('jpeg', quarters)
    expect(detectFormat(await cropImage(jpeg, { x: 0, y: 0, width: 10, height: 10 }))).toBe('jpeg')
    expect(detectFormat(await cropImage(jpeg, { x: 0, y: 0, width: 10, height: 10 }, { format: 'webp' }))).toBe('webp')
    const clear = await encodeFixture('png', makePixels(20, 20, () => [255, 0, 0, 0]))
    const onBlue = await cropImage(clear, { x: 5, y: 5, width: 10, height: 10 }, { format: 'jpeg', background: '#0000ff' })
    expectEveryPixelNear(await decodeFixture(onBlue), BLUE, 8)
  })

  it('measures the rectangle on the upright photo', async () => {
    // Stored 40 × 20, red left and blue right, tagged "turn 90° clockwise": upright it is
    // 20 × 40 with red on top and blue below.
    const stored = await encodeFixture('jpeg', makePixels(40, 20, x => (x < 20 ? RED : BLUE)))
    const phone = withOrientation(stored, 'jpeg', 6)
    const bottom = await decodeFixture(await cropImage(phone, { x: 0, y: 20, width: 20, height: 20 }))
    expect([bottom.width, bottom.height]).toEqual([20, 20])
    // Away from the seam, where JPEG blurs the two colors together.
    expectEveryPixelNear({ ...bottom, data: bottom.data.subarray(4 * 20 * 4) }, BLUE, 16)
    await expect(cropImage(phone, { x: 0, y: 0, width: 40, height: 20 })).rejects.toMatchObject({
      code: 'INVALID_OPTIONS',
      message: 'The crop area (x 0, y 0, 40 × 20) goes past the edge of the image, which is 20 × 40.',
    })
  })

  it('refuses a crop the output format cannot store, before decoding', async () => {
    // A PNG with only a header claiming 20,000 × 10: decoding it would fail as damaged.
    const headerOnly = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...pngChunk('IHDR', new Uint8Array([0, 0, 0x4e, 0x20, 0, 0, 0, 10, 8, 6, 0, 0, 0]))])
    await expect(cropImage(headerOnly, { x: 0, y: 0, width: 20_000, height: 10 }, { format: 'webp' }))
      .rejects.toMatchObject({ code: 'TOO_LARGE', message: expect.stringContaining('16,383') })
  })

  it('rejects bad areas', async () => {
    const png = await encodeFixture('png', quarters)
    const whole = 'The crop area needs whole-pixel x, y, width and height, with width and height of at least 1.'
    await expect(cropImage(png, { x: 1.5, y: 0, width: 10, height: 10 })).rejects.toMatchObject({ code: 'INVALID_OPTIONS', message: whole })
    await expect(cropImage(png, { x: 0, y: 0, width: 0, height: 10 })).rejects.toMatchObject({ code: 'INVALID_OPTIONS', message: whole })
    await expect(cropImage(png, { x: -1, y: 0, width: 10, height: 10 })).rejects.toMatchObject({ code: 'INVALID_OPTIONS', message: whole })
    await expect(cropImage(png, { x: 0, y: 0, width: 10 } as never)).rejects.toMatchObject({ code: 'INVALID_OPTIONS', message: whole })
    await expect(cropImage(png, { aspect: 'wide' } as never)).rejects.toMatchObject({
      code: 'INVALID_OPTIONS',
      message: "aspect must be '1:1', '4:3', '16:9' or a positive number (width ÷ height), not \"wide\".",
    })
    await expect(cropImage(png, { aspect: -1 })).rejects.toMatchObject({ code: 'INVALID_OPTIONS' })
    await expect(cropImage(png, null as never)).rejects.toMatchObject({ code: 'INVALID_OPTIONS' })
    await expect(cropImage(png, { x: 0, y: 0, width: 10, height: 10 }, { format: 'gif' } as never)).rejects.toMatchObject({ code: 'INVALID_OPTIONS' })
  })
})
